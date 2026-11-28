/**
 * Sabi Sweat Step Notifications Engine
 *
 * Manages local check-ins (09:00, 14:00, 19:00) and real-time near-goal (90%+) triggers:
 * - Max 2 step reminders per member per local day
 * - At least 3 hours apart
 * - Completion checked first at every send (>= 100% stops reminders for the rest of the local day)
 * - Near-goal (90% to <100%) takes priority over morning/afternoon/evening copy, triggers once,
 *   and suppresses further reminders that local day
 * - Afternoon & evening check-ins skipped if step count has not changed since last reminder
 * - Skips check-in when today's step data has not synced / is stale
 * - Respects DAILY_STEP_REMINDER preference and quiet hours
 * - Push-only (does not pollute in-app inbox / unread badge)
 * - Persists rotation & daily history in existing notification_delivery_attempts.payload_summary
 *   (no database migration required)
 * - Rechecks step count, goal, and send history immediately before delivery
 */

import { randomUUID } from 'crypto';
import { supabase } from '../config/database';
import { getApplicableGoalForDate } from './stepGoalHistoryService';
import { PUSH_CATEGORIES } from '../models/notificationModel';
import { dispatchNotification } from './notificationDispatcher';
import { getPreferences, isPushCategoryEnabled } from './preferenceService';
import {
  classifyStepBand,
  getEligibleStepVariations,
  renderStepCopyVariation,
  selectLeastRecentlyShownVariation,
  type ActiveStepBand,
  type CheckInSlot,
  type RenderedStepCopy,
} from './stepNotificationCopy';

const TABLE_PROFILES = 'profiles';
const TABLE_DAILY_STEPS = 'daily_steps';
const TABLE_USER_DEVICES = 'user_devices';
const TABLE_ATTEMPTS = 'notification_delivery_attempts';

export const STEP_REMINDER_DAILY_CAP = 2;
export const STEP_REMINDER_MIN_SPACING_MS = 3 * 60 * 60 * 1000; // 3 hours
export const STEP_SYNC_FRESHNESS_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

export const CHECKIN_HOURS: Record<number, CheckInSlot> = {
  9: 'morning',
  14: 'afternoon',
  19: 'evening',
};

export interface LocalTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateStr: string;
}

export interface StepReminderHistoryEntry {
  dispatchId: string;
  localDate: string;
  slot: CheckInSlot | 'sync';
  band: ActiveStepBand;
  variationKey: string;
  stepCount: number;
  goal: number;
  sentAtMs: number;
}

export interface StepReminderHistory {
  todaySends: StepReminderHistoryEntry[];
  lastShownAtByKey: Map<string, number>;
}

export interface StepReminderDecisionInput {
  trigger: 'checkin' | 'sync';
  slot: CheckInSlot | 'any';
  steps: number | null;
  goal: number;
  nowMs: number;
  history: StepReminderHistory;
  firstName?: string | null;
  locale?: string | null;
  inQuietHours?: boolean;
  pushEnabled?: boolean;
}

export type StepReminderDecision =
  | {
      shouldSend: false;
      reason:
        | 'push_disabled'
        | 'quiet_hours'
        | 'progress_unknown'
        | 'goal_completed'
        | 'near_goal_already_sent'
        | 'daily_cap_reached'
        | 'min_spacing_not_met'
        | 'not_near_goal_on_sync'
        | 'slot_already_sent'
        | 'unchanged_step_count';
    }
  | {
      shouldSend: true;
      band: ActiveStepBand;
      rendered: RenderedStepCopy;
    };

/**
 * Extracts local date/time parts for an IANA timezone.
 */
export function getMemberLocalTime(
  date: Date = new Date(),
  timeZone: string = 'Africa/Lagos'
): LocalTimeParts {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const year = Number(getPart('year'));
    const month = Number(getPart('month'));
    const day = Number(getPart('day'));
    const rawHour = Number(getPart('hour'));
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(getPart('minute'));
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, hour, minute, dateStr };
  } catch {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const dateStr = date.toISOString().slice(0, 10);
    return { year, month, day, hour, minute, dateStr };
  }
}

/**
 * Maps a local hour (0–23) to a check-in slot (09:00, 14:00, 19:00).
 */
export function getCheckInSlotForHour(hour: number): CheckInSlot | null {
  return CHECKIN_HOURS[hour] ?? null;
}

/**
 * Parses an "HH:MM" clock string into minutes since midnight.
 */
function parseClockMinutes(clock: string | undefined | null): number | null {
  if (!clock || typeof clock !== 'string') return null;
  const match = clock.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Checks whether the member's local time falls within configured quiet hours.
 * Properly supports overnight windows (e.g. 22:00 → 07:00) and daytime windows (e.g. 13:00 → 15:00).
 */
export function isWithinQuietHours(
  localHour: number,
  localMinute: number,
  quietHours?: { enabled?: boolean; start?: string; end?: string } | null
): boolean {
  if (!quietHours?.enabled) return false;
  const startMin = parseClockMinutes(quietHours.start);
  const endMin = parseClockMinutes(quietHours.end);
  if (startMin === null || endMin === null || startMin === endMin) return false;

  const currentMin = localHour * 60 + localMinute;
  if (startMin < endMin) {
    // Same-day window (e.g. 13:00–15:00)
    return currentMin >= startMin && currentMin < endMin;
  }
  // Overnight window (e.g. 22:00–07:00)
  return currentMin >= startMin || currentMin < endMin;
}

/**
 * Checks whether a daily_steps row represents freshly synced data for a scheduled check-in.
 */
export function isStepRowFresh(
  row: { steps?: number | null; synced_at?: string | null; updated_at?: string | null } | null | undefined,
  now: Date = new Date(),
  maxAgeMs: number = STEP_SYNC_FRESHNESS_WINDOW_MS
): boolean {
  if (!row || typeof row.steps !== 'number' || !Number.isFinite(row.steps)) {
    return false;
  }
  const timestampStr = row.synced_at || row.updated_at;
  if (!timestampStr) return false;

  const syncedMs = new Date(timestampStr).getTime();
  if (!Number.isFinite(syncedMs)) return false;

  return now.getTime() - syncedMs <= maxAgeMs;
}

/**
 * Pure decision engine implementing every rule in the Sabi Sweat step notifications spec.
 */
export function evaluateStepReminderDecision(
  input: StepReminderDecisionInput
): StepReminderDecision {
  const {
    trigger,
    slot,
    steps,
    goal,
    nowMs,
    history,
    firstName,
    locale,
    inQuietHours = false,
    pushEnabled = true,
  } = input;

  if (!pushEnabled) {
    return { shouldSend: false, reason: 'push_disabled' };
  }

  if (inQuietHours) {
    return { shouldSend: false, reason: 'quiet_hours' };
  }

  const band = classifyStepBand(steps, goal);

  // Check completion first at every send
  if (band === 'completed') {
    return { shouldSend: false, reason: 'goal_completed' };
  }

  if (band === 'unknown' || steps === null) {
    return { shouldSend: false, reason: 'progress_unknown' };
  }

  // On sync triggers, only the 90%+ near-goal prompt qualifies
  if (trigger === 'sync' && band !== 'near_goal') {
    return { shouldSend: false, reason: 'not_near_goal_on_sync' };
  }

  const todaySends = [...history.todaySends].sort((a, b) => a.sentAtMs - b.sentAtMs);

  // Once near-goal has been sent, suppress further step reminders for the rest of the local day
  if (todaySends.some((s) => s.band === 'near_goal')) {
    return { shouldSend: false, reason: 'near_goal_already_sent' };
  }

  // Max 2 step reminders per local day
  if (todaySends.length >= STEP_REMINDER_DAILY_CAP) {
    return { shouldSend: false, reason: 'daily_cap_reached' };
  }

  // Minimum 3 hours between step reminders
  const lastSendToday = todaySends.length > 0 ? todaySends[todaySends.length - 1] : undefined;
  if (lastSendToday && nowMs - lastSendToday.sentAtMs < STEP_REMINDER_MIN_SPACING_MS) {
    return { shouldSend: false, reason: 'min_spacing_not_met' };
  }

  if (trigger === 'checkin') {
    // Idempotency per check-in slot for the local day (works for 15-min or hourly cron)
    if (slot !== 'any' && todaySends.some((s) => s.slot === slot)) {
      return { shouldSend: false, reason: 'slot_already_sent' };
    }

    // Skip afternoon or evening check-in if step count has not changed since the last reminder
    if (
      (slot === 'afternoon' || slot === 'evening') &&
      lastSendToday &&
      steps === lastSendToday.stepCount
    ) {
      return { shouldSend: false, reason: 'unchanged_step_count' };
    }
  }

  const eligible = getEligibleStepVariations(slot, band);
  const chosen = selectLeastRecentlyShownVariation(eligible, history.lastShownAtByKey);
  const rendered = renderStepCopyVariation(chosen, {
    steps,
    goal,
    firstName,
    locale,
  });

  return {
    shouldSend: true,
    band,
    rendered,
  };
}

/**
 * Loads a member's step reminder history from existing notification_delivery_attempts records.
 * Deduplicates multi-device delivery attempts by dispatchId so one send to 2 devices counts as 1 reminder.
 */
export async function fetchStepReminderHistory(
  userId: string,
  todayLocalDate: string
): Promise<StepReminderHistory> {
  const { data: rows, error } = await supabase
    .from(TABLE_ATTEMPTS)
    .select('status, payload_summary, created_at')
    .eq('user_id', userId)
    .eq('channel', 'push')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !rows || rows.length === 0) {
    return { todaySends: [], lastShownAtByKey: new Map() };
  }

  const seenDispatches = new Set<string>();
  const todaySends: StepReminderHistoryEntry[] = [];
  const lastShownAtByKey = new Map<string, number>();

  for (const row of rows as any[]) {
    if (row.status === 'failed') continue;
    const meta = row.payload_summary?.stepReminder;
    if (!meta || typeof meta !== 'object' || typeof meta.variationKey !== 'string') {
      continue;
    }

    const sentAtMs =
      typeof meta.sentAt === 'string'
        ? new Date(meta.sentAt).getTime()
        : new Date(row.created_at).getTime();
    if (!Number.isFinite(sentAtMs)) continue;

    const dispatchKey =
      typeof meta.dispatchId === 'string' && meta.dispatchId.length > 0
        ? meta.dispatchId
        : `${meta.localDate || ''}:${meta.slot || ''}:${meta.variationKey}:${Math.floor(sentAtMs / 60000)}`;

    if (seenDispatches.has(dispatchKey)) continue;
    seenDispatches.add(dispatchKey);

    const prevShown = lastShownAtByKey.get(meta.variationKey);
    if (prevShown === undefined || sentAtMs > prevShown) {
      lastShownAtByKey.set(meta.variationKey, sentAtMs);
    }

    if (meta.localDate === todayLocalDate) {
      todaySends.push({
        dispatchId: dispatchKey,
        localDate: meta.localDate,
        slot: meta.slot || 'sync',
        band: meta.band,
        variationKey: meta.variationKey,
        stepCount: typeof meta.stepCount === 'number' ? meta.stepCount : 0,
        goal: typeof meta.goal === 'number' ? meta.goal : 10000,
        sentAtMs,
      });
    }
  }

  return { todaySends, lastShownAtByKey };
}

/**
 * Fetches live member state (profile goal/name + today's daily_steps row).
 */
async function fetchLiveMemberStepState(
  userId: string,
  localDateStr: string
): Promise<{
  firstName: string | null;
  goal: number;
  stepRow: { steps: number; synced_at?: string | null; updated_at?: string | null } | null;
}> {
  const [profileRes, stepRes] = await Promise.all([
    supabase
      .from(TABLE_PROFILES)
      .select('first_name, step_goal')
      .eq('id', userId)
      .single(),
    supabase
      .from(TABLE_DAILY_STEPS)
      .select('steps, synced_at, updated_at, step_goal')
      .eq('user_id', userId)
      .eq('date', localDateStr)
      .maybeSingle(),
  ]);

  let stepRowData: any = stepRes.data ?? null;
  if (
    stepRes.error &&
    (stepRes.error.code === '42703' || String(stepRes.error.message || '').includes('step_goal'))
  ) {
    const fallbackStepRes = await supabase
      .from(TABLE_DAILY_STEPS)
      .select('steps, synced_at, updated_at')
      .eq('user_id', userId)
      .eq('date', localDateStr)
      .maybeSingle();
    stepRowData = fallbackStepRes.data ?? null;
  }

  const daySnapshotGoal =
    stepRowData && typeof stepRowData.step_goal === 'number' && stepRowData.step_goal > 0
      ? Number(stepRowData.step_goal)
      : null;

  const goal = await getApplicableGoalForDate(
    userId,
    localDateStr,
    profileRes.data?.step_goal ?? 10000,
    { daySnapshotGoal }
  );
  const firstName = profileRes.data?.first_name ?? null;
  const stepRow = stepRowData;

  return { firstName, goal, stepRow };
}

/**
 * Evaluates and dispatches a step reminder for a single user, performing a final
 * pre-delivery recheck of step count, goal, and send history immediately before send.
 */
export async function evaluateAndSendStepReminder(params: {
  userId: string;
  trigger: 'checkin' | 'sync';
  slot: CheckInSlot | 'any';
  localDateStr: string;
  localHour: number;
  localMinute: number;
  locale?: string | null;
  now?: Date;
  /** Known freshly synced step count when trigger === 'sync' */
  syncedStepsOverride?: number;
}): Promise<{ sent: boolean; reason?: string; variationKey?: string; band?: ActiveStepBand }> {
  const now = params.now ?? new Date();
  const { userId, trigger, slot, localDateStr, localHour, localMinute, locale } = params;

  // 1. Check user push preferences & quiet hours
  const [pushEnabled, prefs] = await Promise.all([
    isPushCategoryEnabled(userId, PUSH_CATEGORIES.DAILY_STEP_REMINDER),
    getPreferences(userId),
  ]);

  const inQuietHours = isWithinQuietHours(localHour, localMinute, prefs?.quietHours);
  if (!pushEnabled) return { sent: false, reason: 'push_disabled' };
  if (inQuietHours) return { sent: false, reason: 'quiet_hours' };

  // 2. Initial evaluation
  const [initialState, initialHistory] = await Promise.all([
    fetchLiveMemberStepState(userId, localDateStr),
    fetchStepReminderHistory(userId, localDateStr),
  ]);

  const initialSteps =
    trigger === 'sync'
      ? (initialState.stepRow && typeof initialState.stepRow.steps === 'number'
          ? Math.max(initialState.stepRow.steps, params.syncedStepsOverride ?? 0)
          : (params.syncedStepsOverride ?? null))
      : (isStepRowFresh(initialState.stepRow, now) ? initialState.stepRow!.steps : null);

  const firstDecision = evaluateStepReminderDecision({
    trigger,
    slot,
    steps: initialSteps,
    goal: initialState.goal,
    nowMs: now.getTime(),
    history: initialHistory,
    firstName: initialState.firstName,
    locale,
    inQuietHours,
    pushEnabled,
  });

  if (!firstDecision.shouldSend) {
    return { sent: false, reason: firstDecision.reason };
  }

  // 3. Pre-delivery recheck of count, goal, and send history immediately before send
  const [freshState, freshHistory] = await Promise.all([
    fetchLiveMemberStepState(userId, localDateStr),
    fetchStepReminderHistory(userId, localDateStr),
  ]);

  const freshSteps =
    trigger === 'sync'
      ? (freshState.stepRow && typeof freshState.stepRow.steps === 'number'
          ? Math.max(freshState.stepRow.steps, params.syncedStepsOverride ?? 0)
          : (params.syncedStepsOverride ?? null))
      : (isStepRowFresh(freshState.stepRow, now) ? freshState.stepRow!.steps : null);

  const finalDecision = evaluateStepReminderDecision({
    trigger,
    slot,
    steps: freshSteps,
    goal: freshState.goal,
    nowMs: now.getTime(),
    history: freshHistory,
    firstName: freshState.firstName,
    locale,
    inQuietHours,
    pushEnabled,
  });

  if (!finalDecision.shouldSend) {
    return { sent: false, reason: finalDecision.reason };
  }

  // 4. Dispatch push-only step reminder with rotation & history metadata
  const dispatchId = randomUUID();
  const sentAtIso = now.toISOString();

  const dispatchResult = await dispatchNotification({
    userId,
    type: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
    title: finalDecision.rendered.title,
    body: finalDecision.rendered.body,
    channel: 'push_only',
    data: {
      screen: 'HomeTab',
      band: finalDecision.band,
      variationKey: finalDecision.rendered.key,
      stepReminderMeta: {
        dispatchId,
        localDate: localDateStr,
        slot: trigger === 'sync' ? 'sync' : slot,
        band: finalDecision.band,
        variationKey: finalDecision.rendered.key,
        stepCount: freshSteps ?? 0,
        goal: freshState.goal,
        sentAt: sentAtIso,
      },
    },
  });

  const delivered =
    !dispatchResult ||
    dispatchResult.pushTicketsCount > 0 ||
    dispatchResult.pushAttempts > 0;

  return {
    sent: delivered,
    reason: delivered ? undefined : 'no_active_devices',
    variationKey: finalDecision.rendered.key,
    band: finalDecision.band,
  };
}

/**
 * Triggered on step sync: evaluates whether the member just reached 90%+ (near-goal)
 * and qualifies for the near-goal prompt right now.
 */
export async function evaluateStepSyncReminder(
  userId: string,
  dateStr: string,
  currentSteps: number,
  timeZone?: string,
  now: Date = new Date()
): Promise<{ sent: boolean; reason?: string; variationKey?: string }> {
  // Fetch member's latest active device for timezone & locale
  const { data: devices } = await supabase
    .from(TABLE_USER_DEVICES)
    .select('timezone, locale')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('notifications_enabled', true)
    .limit(1);

  const device = devices?.[0];
  const resolvedTz = timeZone || device?.timezone || 'Africa/Lagos';
  const resolvedLocale = device?.locale || 'en-US';
  const local = getMemberLocalTime(now, resolvedTz);

  // Only fire near-goal reminders for the member's current local day (ignore historical backfills)
  if (dateStr !== local.dateStr) {
    return { sent: false, reason: 'not_today' };
  }

  return evaluateAndSendStepReminder({
    userId,
    trigger: 'sync',
    slot: 'any',
    localDateStr: local.dateStr,
    localHour: local.hour,
    localMinute: local.minute,
    locale: resolvedLocale,
    now,
    syncedStepsOverride: currentSteps,
  });
}

/**
 * Scheduled cron job: evaluates local 09:00, 14:00, and 19:00 check-ins for all active users.
 */
export async function processStepCheckInJob(
  now: Date = new Date()
): Promise<{ evaluated: number; sent: number }> {
  const { data: devices, error } = await supabase
    .from(TABLE_USER_DEVICES)
    .select('user_id, timezone, locale')
    .eq('is_active', true)
    .eq('notifications_enabled', true);

  if (error || !devices || devices.length === 0) {
    return { evaluated: 0, sent: 0 };
  }

  // Group by unique user (first active device supplies timezone + locale)
  const userMap = new Map<string, { timezone: string; locale: string }>();
  for (const d of devices) {
    if (!userMap.has(d.user_id)) {
      userMap.set(d.user_id, {
        timezone: d.timezone || 'Africa/Lagos',
        locale: d.locale || 'en-US',
      });
    }
  }

  let sent = 0;
  for (const [userId, info] of userMap.entries()) {
    const local = getMemberLocalTime(now, info.timezone);
    const slot = getCheckInSlotForHour(local.hour);
    if (!slot) continue;

    try {
      const outcome = await evaluateAndSendStepReminder({
        userId,
        trigger: 'checkin',
        slot,
        localDateStr: local.dateStr,
        localHour: local.hour,
        localMinute: local.minute,
        locale: info.locale,
        now,
      });
      if (outcome.sent) {
        sent++;
      }
    } catch (err) {
      console.warn(`[stepNotificationService] Failed check-in for user ${userId}:`, err);
    }
  }

  return { evaluated: userMap.size, sent };
}
