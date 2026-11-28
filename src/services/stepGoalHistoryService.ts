import { getUserSupabase, supabase } from '../config/database';

export const STEP_GOAL_HISTORY_TABLE = 'user_step_goal_history';
export const DAILY_STEPS_TABLE = 'daily_steps';
export const PROFILES_TABLE = 'profiles';
const USER_DEVICES_TABLE = 'user_devices';

export const DEFAULT_STEP_GOAL = 10000;
export const DEFAULT_TIMEZONE = 'Africa/Lagos';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface StepGoalHistoryEntry {
  effective_date: string; // YYYY-MM-DD
  step_goal: number;
  time_zone?: string | null;
}

export interface ResolveGoalOptions {
  daySnapshotGoal?: number | null;
  history: StepGoalHistoryEntry[];
  fallbackGoal?: number | null;
}

export interface StepGoalUpdateResult {
  stepGoal: number;
  previousStepGoal: number | null;
  effectiveDate: string;
  timeZone: string;
  updatedAt: string;
}

export function isValidTimeZone(tz?: string | null): tz is string {
  if (!tz || typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the local calendar date (YYYY-MM-DD) for the given IANA timezone.
 */
export function getLocalDateInTimezone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  const safeTz = isValidTimeZone(timeZone) ? timeZone.trim() : 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function isMissingSchemaError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
}

/**
 * Resolves the user's most accurate IANA timezone:
 * 1. Explicit timezone passed by client (if valid)
 * 2. Most recently seen active device timezone
 * 3. Most recent daily_steps time_zone
 * 4. Default ('Africa/Lagos')
 */
export async function resolveUserTimezone(
  userId: string,
  explicitTimeZone?: string | null
): Promise<string> {
  if (isValidTimeZone(explicitTimeZone)) {
    return explicitTimeZone.trim();
  }

  try {
    const { data: device } = await supabase
      .from(USER_DEVICES_TABLE)
      .select('timezone')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isValidTimeZone(device?.timezone)) {
      return device!.timezone.trim();
    }
  } catch {
    // Fall through to daily_steps lookup
  }

  try {
    const { data: stepRow } = await supabase
      .from(DAILY_STEPS_TABLE)
      .select('time_zone')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isValidTimeZone(stepRow?.time_zone)) {
      return stepRow!.time_zone.trim();
    }
  } catch {
    // Fall through to default
  }

  return DEFAULT_TIMEZONE;
}

/**
 * Loads a user's versioned step-goal history sorted ascending by effective_date.
 */
export async function getStepGoalHistory(userId: string): Promise<StepGoalHistoryEntry[]> {
  try {
    const tableRef: any = supabase.from(STEP_GOAL_HISTORY_TABLE);
    if (!tableRef || typeof tableRef.select !== 'function') return [];
    const selected: any = tableRef.select('effective_date, step_goal, time_zone');
    if (!selected || typeof selected.eq !== 'function') return [];
    const filtered: any = selected.eq('user_id', userId);
    const queryResult =
      filtered && typeof filtered.order === 'function'
        ? await filtered.order('effective_date', { ascending: true })
        : await filtered;

    const { data, error } = queryResult ?? { data: null, error: null };

    if (error) {
      if (!isMissingSchemaError(error)) {
        console.warn('[stepGoalHistoryService] Failed to query goal history:', error.message);
      }
      return [];
    }

    if (!Array.isArray(data)) return [];

    return data
      .filter((row: any) => row?.effective_date && Number(row?.step_goal) > 0)
      .map((row: any) => ({
        effective_date: String(row.effective_date).slice(0, 10),
        step_goal: Number(row.step_goal),
        time_zone: row.time_zone ?? null,
      }))
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  } catch (err) {
    console.warn('[stepGoalHistoryService] Unexpected error loading goal history:', err);
    return [];
  }
}

/**
 * Pure, deterministic resolver for the step goal applicable on a specific calendar date.
 *
 * Resolution priority:
 * 1. Explicit per-day snapshot stored on daily_steps.step_goal (when valid > 0)
 * 2. Latest goal-history entry with effective_date <= date
 * 3. Earliest goal-history entry if date precedes the first recorded effective_date
 * 4. Fallback goal (profiles.step_goal or DEFAULT_STEP_GOAL)
 */
export function resolveGoalForDate(date: string, options: ResolveGoalOptions): number {
  const { daySnapshotGoal, history, fallbackGoal } = options;

  if (typeof daySnapshotGoal === 'number' && Number.isFinite(daySnapshotGoal) && daySnapshotGoal > 0) {
    return daySnapshotGoal;
  }

  if (Array.isArray(history) && history.length > 0) {
    const sorted = [...history].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    let matched: StepGoalHistoryEntry | null = null;
    for (const entry of sorted) {
      if (entry.effective_date <= date) {
        matched = entry;
      } else {
        break;
      }
    }
    if (matched && matched.step_goal > 0) {
      return matched.step_goal;
    }
    // Date is before the earliest recorded effective_date: use the earliest known goal,
    // never a newer goal added later.
    if (sorted[0].step_goal > 0) {
      return sorted[0].step_goal;
    }
  }

  if (typeof fallbackGoal === 'number' && Number.isFinite(fallbackGoal) && fallbackGoal > 0) {
    return fallbackGoal;
  }

  return DEFAULT_STEP_GOAL;
}

/**
 * Convenience helper to resolve the goal applicable for a single user and calendar date.
 */
export async function getApplicableGoalForDate(
  userId: string,
  date: string,
  fallbackGoal?: number | null,
  options?: { daySnapshotGoal?: number | null }
): Promise<number> {
  const hasProvidedSnapshot = options !== undefined && 'daySnapshotGoal' in options;

  const stepRowPromise = hasProvidedSnapshot
    ? Promise.resolve({ data: { step_goal: options?.daySnapshotGoal ?? null }, error: null })
    : Promise.resolve()
        .then(() =>
          supabase
            .from(DAILY_STEPS_TABLE)
            .select('step_goal')
            .eq('user_id', userId)
            .eq('date', date)
            .maybeSingle()
        )
        .catch(() => ({ data: null, error: null }));

  const profilePromise =
    fallbackGoal !== undefined
      ? Promise.resolve({ data: { step_goal: fallbackGoal } })
      : Promise.resolve()
          .then(() =>
            supabase
              .from(PROFILES_TABLE)
              .select('step_goal')
              .eq('id', userId)
              .maybeSingle()
          )
          .catch(() => ({ data: null }));

  const [history, stepRowRes, profileRes] = await Promise.all([
    getStepGoalHistory(userId),
    stepRowPromise,
    profilePromise,
  ]);

  const daySnapshotGoal =
    stepRowRes?.data && typeof (stepRowRes.data as any).step_goal === 'number'
      ? Number((stepRowRes.data as any).step_goal)
      : null;

  const resolvedFallback =
    fallbackGoal !== undefined
      ? fallbackGoal
      : (profileRes?.data as any)?.step_goal ?? DEFAULT_STEP_GOAL;

  return resolveGoalForDate(date, {
    daySnapshotGoal,
    history,
    fallbackGoal: resolvedFallback,
  });
}

/**
 * Records the initial step goal when a user completes onboarding.
 * Idempotent: never overwrites an existing entry on the same effective_date.
 */
export async function recordInitialStepGoal(
  userId: string,
  stepGoal: number,
  effectiveDate?: string,
  timeZone?: string
): Promise<void> {
  if (!Number.isFinite(stepGoal) || stepGoal < 1000) return;

  const resolvedTz = isValidTimeZone(timeZone) ? timeZone.trim() : DEFAULT_TIMEZONE;
  const resolvedDate =
    effectiveDate && DATE_RE.test(effectiveDate)
      ? effectiveDate
      : getLocalDateInTimezone(resolvedTz);

  try {
    const { error } = await supabase
      .from(STEP_GOAL_HISTORY_TABLE)
      .upsert(
        {
          user_id: userId,
          step_goal: Math.round(stepGoal),
          effective_date: resolvedDate,
          time_zone: resolvedTz,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,effective_date', ignoreDuplicates: true }
      );

    if (error && !isMissingSchemaError(error)) {
      console.warn('[stepGoalHistoryService] Failed to record initial step goal:', error.message);
    }
  } catch (err) {
    console.warn('[stepGoalHistoryService] Unexpected error recording initial step goal:', err);
  }
}

/**
 * Persists a monotonic high-water mark for longest_streak_days on profiles.
 * Never decreases profiles.longest_streak_days.
 */
export async function persistLongestStreakHighWaterMark(
  userId: string,
  computedLongestStreak: number,
  currentStoredLongest?: number | null
): Promise<number> {
  const safeComputed = Math.max(0, Math.floor(computedLongestStreak || 0));
  const safeStored = Math.max(0, Math.floor(currentStoredLongest || 0));
  const best = Math.max(safeComputed, safeStored);

  if (safeComputed > safeStored) {
    try {
      const { error } = await supabase
        .from(PROFILES_TABLE)
        .update({ longest_streak_days: best })
        .eq('id', userId);

      if (error && !isMissingSchemaError(error)) {
        console.warn('[stepGoalHistoryService] Failed to persist longest_streak_days:', error.message);
      }
    } catch (err) {
      console.warn('[stepGoalHistoryService] Unexpected error persisting longest_streak_days:', err);
    }
  }

  return best;
}

/**
 * Updates a user's daily step goal with effective-date preservation:
 * - Captures any missing pre-change baseline goal for historical days (< effectiveDate)
 *   BEFORE updating profiles.step_goal, so legacy users' prior days keep their original goal.
 * - Upserts the new goal in user_step_goal_history for effectiveDate (unique per day,
 *   so multiple same-day changes never create overlapping periods).
 * - Updates profiles.step_goal for current/future reads.
 * - Updates daily_steps.step_goal ONLY for effectiveDate (if today's row already exists),
 *   never touching any historical daily_steps rows (< effectiveDate).
 * - Never triggers retroactive achievement awarding.
 */
export async function recordStepGoalChange(
  userId: string,
  newStepGoal: number,
  options: {
    token?: string;
    timeZone?: string | null;
    effectiveDate?: string | null;
    now?: Date;
  } = {}
): Promise<StepGoalUpdateResult> {
  const normalizedGoal = Math.round(newStepGoal);
  if (!Number.isFinite(normalizedGoal) || normalizedGoal < 1000 || normalizedGoal > 100000) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Valid stepGoal is required (between 1000 and 100000)',
    };
  }

  const now = options.now ?? new Date();
  const updatedAt = now.toISOString();
  const resolvedTz = await resolveUserTimezone(userId, options.timeZone);
  const effectiveDate =
    options.effectiveDate && DATE_RE.test(options.effectiveDate)
      ? options.effectiveDate
      : getLocalDateInTimezone(resolvedTz, now);

  // 1. Read current profile state BEFORE updating profiles.step_goal
  const { data: profile, error: profileErr } = await supabase
    .from(PROFILES_TABLE)
    .select('step_goal, finished_onboarded_at, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.warn('[stepGoalHistoryService] Profile read warning before goal update:', profileErr.message);
  }

  const previousStepGoal =
    typeof profile?.step_goal === 'number' && profile.step_goal > 0
      ? profile.step_goal
      : null;

  // 2. Preserve legacy baseline goal for dates < effectiveDate if no prior history exists
  const existingHistory = await getStepGoalHistory(userId);
  const hasPriorHistory = existingHistory.some((h) => h.effective_date < effectiveDate);

  if (!hasPriorHistory && previousStepGoal !== null && previousStepGoal !== normalizedGoal) {
    let baselineDate = (profile?.finished_onboarded_at || profile?.created_at || effectiveDate).slice(0, 10);

    try {
      const { data: earliestStep } = await supabase
        .from(DAILY_STEPS_TABLE)
        .select('date')
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (earliestStep?.date && String(earliestStep.date).slice(0, 10) < baselineDate) {
        baselineDate = String(earliestStep.date).slice(0, 10);
      }
    } catch {
      // Keep onboarding/created date as baseline
    }

    if (baselineDate < effectiveDate) {
      try {
        const { error: baselineErr } = await supabase
          .from(STEP_GOAL_HISTORY_TABLE)
          .upsert(
            {
              user_id: userId,
              step_goal: previousStepGoal,
              effective_date: baselineDate,
              time_zone: resolvedTz,
              updated_at: updatedAt,
            },
            { onConflict: 'user_id,effective_date', ignoreDuplicates: true }
          );

        if (baselineErr && !isMissingSchemaError(baselineErr)) {
          console.warn('[stepGoalHistoryService] Failed to persist baseline goal:', baselineErr.message);
        }
      } catch (err) {
        console.warn('[stepGoalHistoryService] Unexpected error persisting baseline goal:', err);
      }
    }
  }

  // 3. Upsert the new goal at effectiveDate (replaces same-day changes cleanly without overlap)
  try {
    const { error: historyErr } = await supabase
      .from(STEP_GOAL_HISTORY_TABLE)
      .upsert(
        {
          user_id: userId,
          step_goal: normalizedGoal,
          effective_date: effectiveDate,
          time_zone: resolvedTz,
          updated_at: updatedAt,
        },
        { onConflict: 'user_id,effective_date' }
      );

    if (historyErr && !isMissingSchemaError(historyErr)) {
      console.warn('[stepGoalHistoryService] Failed to upsert goal history:', historyErr.message);
    }
  } catch (err) {
    console.warn('[stepGoalHistoryService] Unexpected error upserting goal history:', err);
  }

  // 4. Update profiles.step_goal (current active goal)
  const profileClient = options.token ? getUserSupabase(options.token) : supabase;
  const { error: updateErr } = await profileClient
    .from(PROFILES_TABLE)
    .update({ step_goal: normalizedGoal })
    .eq('id', userId);

  if (updateErr) {
    throw { status: 500, error: 'server_error', message: 'Failed to update step goal' };
  }

  // 5. Update ONLY today's (effectiveDate) daily_steps.step_goal snapshot if today already has a row.
  //    NEVER modify any historical daily_steps rows (date < effectiveDate).
  try {
    const { error: todaySnapErr } = await supabase
      .from(DAILY_STEPS_TABLE)
      .update({ step_goal: normalizedGoal, updated_at: updatedAt })
      .eq('user_id', userId)
      .eq('date', effectiveDate);

    if (todaySnapErr && !isMissingSchemaError(todaySnapErr)) {
      console.warn('[stepGoalHistoryService] Failed to update effectiveDate daily_steps goal snapshot:', todaySnapErr.message);
    }
  } catch {
    // Non-fatal if column not yet migrated
  }

  return {
    stepGoal: normalizedGoal,
    previousStepGoal,
    effectiveDate,
    timeZone: resolvedTz,
    updatedAt,
  };
}
