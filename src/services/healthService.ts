import { getUserSupabase, supabase } from '../config/database';
import {
  WeeklyReportData,
  WeeklyReportDailyBreakdown,
  WeeklyReportBestDay,
  HealthHistoryAllResponse,
} from '../models/healthModel';
import {
  mergeWithDefaultPreferences,
  resolveWeekStartDate,
} from '../models/userPreferencesModel';
import { handleStepSyncEvents } from './notificationEventService';
import { checkAndAwardSabiLevelMilestones } from './sabiLevelService';
import { resolveWeeklyDistanceEquivalent } from './distanceEquivalentsService';
import {
  DEFAULT_STEP_GOAL,
  getLocalDateInTimezone,
  getStepGoalHistory,
  recordStepGoalChange,
  resolveGoalForDate,
  resolveUserTimezone,
} from './stepGoalHistoryService';
import { evaluateAndAwardAchievements } from './achievementService';
import { getCurrentStreak } from './streaksService';

export interface HealthSyncPayload {
  date: string;
  source?: string;
  steps: number;
  distanceKm?: number;
  activeCalories?: number;
  syncedAt?: string;
  timeZone?: string;
}

const MAX_STEPS_PER_DAY = 100000;

function validateAndCapSteps(steps: number): number {
  if (steps < 0) return 0;
  return Math.min(steps, MAX_STEPS_PER_DAY);
}

function isMissingColumnError(error: any, columnName: string): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' || message.includes(columnName.toLowerCase());
}

/**
 * Resolves the step_goal snapshot to store on a daily_steps row during sync.
 * Preserves any existing snapshotted goal on historical dates (< localToday)
 * so re-syncing past step data never overwrites historical targets.
 */
async function resolveSyncGoalSnapshots(
  userId: string,
  dates: string[],
  timeZone?: string
): Promise<{ snapshots: Map<string, number>; resolvedTz: string; localToday: string }> {
  const uniqueDates = Array.from(new Set(dates.filter(Boolean)));
  const snapshots = new Map<string, number>();
  const resolvedTz = await resolveUserTimezone(userId, timeZone);
  const localToday = getLocalDateInTimezone(resolvedTz);
  if (uniqueDates.length === 0) return { snapshots, resolvedTz, localToday };

  const [goalHistory, profileRes, existingRowsRes] = await Promise.all([
    getStepGoalHistory(userId),
    Promise.resolve()
      .then(() =>
        supabase
          .from('profiles')
          .select('step_goal')
          .eq('id', userId)
          .maybeSingle()
      )
      .catch(() => ({ data: null })),
    Promise.resolve()
      .then(() =>
        supabase
          .from('daily_steps')
          .select('date, step_goal')
          .eq('user_id', userId)
          .in('date', uniqueDates)
      )
      .catch(() => ({ data: null, error: null })),
  ]);

  const fallbackGoal = (profileRes?.data as any)?.step_goal ?? DEFAULT_STEP_GOAL;
  const existingGoalByDate = new Map<string, number>();

  if (Array.isArray(existingRowsRes?.data)) {
    for (const row of existingRowsRes.data as any[]) {
      if (row?.date && typeof row?.step_goal === 'number' && row.step_goal > 0) {
        existingGoalByDate.set(String(row.date).slice(0, 10), Number(row.step_goal));
      }
    }
  }

  for (const date of uniqueDates) {
    const existingGoal = existingGoalByDate.get(date) ?? null;
    // Preserve existing historical snapshot for dates before today; for today or unsnapshotted dates, resolve from history
    const snapshot =
      date < localToday && existingGoal !== null
        ? existingGoal
        : resolveGoalForDate(date, {
            daySnapshotGoal: date < localToday ? existingGoal : null,
            history: goalHistory,
            fallbackGoal,
          });
    snapshots.set(date, snapshot);
  }

  return { snapshots, resolvedTz, localToday };
}

export const syncStepData = async (userId: string, payload: HealthSyncPayload, token: string) => {
  const steps = validateAndCapSteps(payload.steps || 0);
  const distance = payload.distanceKm !== undefined ? Number(payload.distanceKm) : (steps * 0.000762);
  const activeCalories = payload.activeCalories !== undefined ? Number(payload.activeCalories) : 0;

  const { snapshots: goalSnapshots, resolvedTz, localToday } = await resolveSyncGoalSnapshots(
    userId,
    [payload.date],
    payload.timeZone
  );
  const dayStepGoal = goalSnapshots.get(payload.date);

  const updateData: any = {
    user_id: userId,
    date: payload.date,
    steps,
    distance_km: distance,
    active_calories: activeCalories,
    ...(dayStepGoal ? { step_goal: dayStepGoal } : {}),
    source: payload.source || 'unknown',
    time_zone: payload.timeZone || 'UTC',
    synced_at: payload.syncedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const client = getUserSupabase(token);
  let { error } = await client
    .from('daily_steps')
    .upsert(updateData, { onConflict: 'user_id,date' });

  // Fallback if active_calories or step_goal column not yet migrated
  if (error && (isMissingColumnError(error, 'active_calories') || isMissingColumnError(error, 'step_goal'))) {
    if (isMissingColumnError(error, 'active_calories')) delete updateData.active_calories;
    if (isMissingColumnError(error, 'step_goal')) delete updateData.step_goal;
    const retry = await client
      .from('daily_steps')
      .upsert(updateData, { onConflict: 'user_id,date' });
    error = retry.error;
    if (error && (isMissingColumnError(error, 'active_calories') || isMissingColumnError(error, 'step_goal'))) {
      delete updateData.active_calories;
      delete updateData.step_goal;
      const retry2 = await client
        .from('daily_steps')
        .upsert(updateData, { onConflict: 'user_id,date' });
      error = retry2.error;
    }
  }

  if (error) {
    console.error('syncStepData error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to sync step data' };
  }

  // Only fire daily goal celebrations / reminders for the user's current local day
  if (payload.date === localToday) {
    handleStepSyncEvents(userId, payload.date, steps, resolvedTz).catch((err) => {
      console.warn('[healthService] Error processing step sync notification events:', err);
    });
  }

  // Asynchronously evaluate & award eligible achievements using historical per-day goals
  evaluateAndAwardAchievements(userId, resolvedTz).catch((err) => {
    console.warn('[healthService] Error evaluating achievements on step sync:', err);
  });

  // Asynchronously evaluate Sabi Level milestones
  checkAndAwardSabiLevelMilestones(userId).catch((err) => {
    console.warn('[healthService] Error evaluating Sabi Level milestones:', err);
  });

  return { message: 'Sync successful', syncedAt: updateData.synced_at };
};

export const syncStepDataBatch = async (
  userId: string,
  payloads: HealthSyncPayload[],
  token: string,
  platform?: string
) => {
  const latestTz = payloads[payloads.length - 1]?.timeZone;
  const { snapshots: goalSnapshots, resolvedTz, localToday } = await resolveSyncGoalSnapshots(
    userId,
    payloads.map((p) => p.date),
    latestTz
  );

  const records = payloads.map(payload => {
    const steps = validateAndCapSteps(payload.steps || 0);
    const distance = payload.distanceKm !== undefined ? Number(payload.distanceKm) : (steps * 0.000762);
    const activeCalories = payload.activeCalories !== undefined ? Number(payload.activeCalories) : 0;
    const dayStepGoal = goalSnapshots.get(payload.date);
    return {
      user_id: userId,
      date: payload.date,
      steps,
      distance_km: distance,
      active_calories: activeCalories,
      ...(dayStepGoal ? { step_goal: dayStepGoal } : {}),
      source: payload.source || platform || 'unknown',
      time_zone: payload.timeZone || 'UTC',
      synced_at: payload.syncedAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  const client = getUserSupabase(token);
  let { error } = await client
    .from('daily_steps')
    .upsert(records, { onConflict: 'user_id,date' });

  // Fallback if active_calories or step_goal column not yet migrated
  if (error && (isMissingColumnError(error, 'active_calories') || isMissingColumnError(error, 'step_goal'))) {
    const stripCols = (recs: any[], dropCal: boolean, dropGoal: boolean) =>
      recs.map((r) => {
        const copy = { ...r };
        if (dropCal) delete copy.active_calories;
        if (dropGoal) delete copy.step_goal;
        return copy;
      });
    const dropCal = isMissingColumnError(error, 'active_calories');
    const dropGoal = isMissingColumnError(error, 'step_goal');
    const retry = await client
      .from('daily_steps')
      .upsert(stripCols(records, dropCal, dropGoal), { onConflict: 'user_id,date' });
    error = retry.error;
    if (error && (isMissingColumnError(error, 'active_calories') || isMissingColumnError(error, 'step_goal'))) {
      const retry2 = await client
        .from('daily_steps')
        .upsert(stripCols(records, true, true), { onConflict: 'user_id,date' });
      error = retry2.error;
    }
  }

  if (error) {
    console.error('syncStepDataBatch error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to sync batch data' };
  }

  // Asynchronously evaluate business notification events (for localToday only) & achievements for synced activity
  if (records.length > 0) {
    const todayRecord = records.find((r) => r.date === localToday);
    if (todayRecord) {
      handleStepSyncEvents(userId, todayRecord.date, todayRecord.steps, resolvedTz).catch((err) => {
        console.warn('[healthService] Error processing batch step sync notification events:', err);
      });
    }
    evaluateAndAwardAchievements(userId, resolvedTz).catch((err) => {
      console.warn('[healthService] Error evaluating achievements on batch step sync:', err);
    });
  }

  // Asynchronously evaluate Sabi Level milestones
  checkAndAwardSabiLevelMilestones(userId).catch((err) => {
    console.warn('[healthService] Error evaluating batch Sabi Level milestones:', err);
  });

  return { message: 'Batch sync successful' };
};

export const getHealthHistory = async (userId: string, params: { startDate?: string, endDate?: string, limit?: number }, token: string) => {
  let query = getUserSupabase(token)
    .from('daily_steps')
    .select('date, steps, distance_km, active_calories, source, synced_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (params.startDate) query = query.gte('date', params.startDate);
  if (params.endDate) query = query.lte('date', params.endDate);
  if (params.limit) query = query.limit(params.limit);

  let rows: any[] | null = null;
  let queryError: any = null;

  const initialResult = await query;
  rows = initialResult.data;
  queryError = initialResult.error;

  if (queryError && (queryError.code === '42703' || queryError.message?.includes('active_calories'))) {
    let fallbackQuery = getUserSupabase(token)
      .from('daily_steps')
      .select('date, steps, distance_km, source, synced_at')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (params.startDate) fallbackQuery = fallbackQuery.gte('date', params.startDate);
    if (params.endDate) fallbackQuery = fallbackQuery.lte('date', params.endDate);
    if (params.limit) fallbackQuery = fallbackQuery.limit(params.limit);
    const retry = await fallbackQuery;
    rows = retry.data;
    queryError = retry.error;
  }

  if (queryError) {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve history' };
  }

  return {
    userId,
    data: (rows || []).map((r: any) => ({
      date: r.date,
      steps: r.steps,
      distanceKm: r.distance_km,
      activeCalories: r.active_calories !== null && r.active_calories !== undefined ? Number(r.active_calories) : 0,
      source: r.source,
      syncedAt: r.synced_at
    }))
  };
};

export const getHealthHistoryAll = async (userId: string, token: string): Promise<HealthHistoryAllResponse> => {
  const { data: profile } = await getUserSupabase(token).from('profiles').select('created_at').eq('id', userId).single();
  
  let rows: any[] | null = null;
  let queryError: any = null;

  const initialResult = await getUserSupabase(token)
    .from('daily_steps')
    .select('date, steps, distance_km, active_calories, synced_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  rows = initialResult.data;
  queryError = initialResult.error;

  if (queryError && (queryError.code === '42703' || queryError.message?.includes('active_calories'))) {
    const retry = await getUserSupabase(token)
      .from('daily_steps')
      .select('date, steps, distance_km, synced_at')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    rows = retry.data;
    queryError = retry.error;
  }

  if (queryError) {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve all history' };
  }

  const data = rows || [];

  return {
    onboardingStartDate: profile?.created_at,
    startDate: data.length > 0 ? data[data.length - 1].date : null,
    asOfDate: new Date().toISOString(),
    data: data.map((r: any) => ({
      date: r.date,
      steps: r.steps,
      distanceKm: r.distance_km,
      activeCalories: r.active_calories !== null && r.active_calories !== undefined ? Number(r.active_calories) : 0,
      lastSyncedAt: r.synced_at
    }))
  };
};

export const updateStepGoal = async (
  userId: string,
  stepGoal: number,
  token: string,
  timeZone?: string,
  effectiveDate?: string
) => {
  // Snapshot any legitimately earned longest streak under the existing goal BEFORE changing goals
  try {
    await getCurrentStreak(userId, timeZone);
  } catch {
    // Non-fatal: goal update must still proceed
  }

  return recordStepGoalChange(userId, stepGoal, {
    token,
    timeZone,
    effectiveDate,
  });
};

export const getTodaySteps = async (userId: string, token: string) => {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await getUserSupabase(token)
    .from('daily_steps')
    .select('date, steps, source')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve today steps' };
  }

  return data || { date: today, steps: 0, source: 'unknown' };
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getTodayInTimezone(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function calcChangePercent(current: number, previous: number): number {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }
  const change = ((current - previous) / previous) * 100;
  return Math.round(change * 10) / 10;
}

export const getWeeklyReport = async (
  userId: string,
  weekStartDate?: string,
  timezone: string = 'Africa/Lagos',
  deviceRegion?: string
): Promise<WeeklyReportData> => {
  // Fetch step goal, country, and preferences from user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('step_goal, preferences, country')
    .eq('id', userId)
    .maybeSingle();

  const userPrefs = mergeWithDefaultPreferences(profile?.preferences);
  const dailyGoalSteps = profile?.step_goal || 8000;

  let resolvedWeekStartDate = weekStartDate ? weekStartDate.trim() : '';
  if (!resolvedWeekStartDate) {
    const todayStr = getTodayInTimezone(timezone);
    resolvedWeekStartDate = resolveWeekStartDate(todayStr, userPrefs.startOfWeek);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedWeekStartDate)) {
      const err: any = new Error('weekStartDate must be in YYYY-MM-DD format');
      err.status = 400;
      throw err;
    }
    // Always align the week to the user's active startOfWeek preference
    resolvedWeekStartDate = resolveWeekStartDate(resolvedWeekStartDate, userPrefs.startOfWeek);
  }

  const startDateObj = new Date(resolvedWeekStartDate + 'T00:00:00Z');
  if (isNaN(startDateObj.getTime())) {
    const err: any = new Error('Invalid weekStartDate');
    err.status = 400;
    throw err;
  }

  const weekEndDate = addDays(resolvedWeekStartDate, 6);
  const priorWeekStartDate = addDays(resolvedWeekStartDate, -7);

  const todayStr = getTodayInTimezone(timezone);

  let isCurrentWeek = false;
  let daysElapsed = 7;

  if (todayStr >= resolvedWeekStartDate && todayStr <= weekEndDate) {
    isCurrentWeek = true;
    const diffMs = new Date(todayStr + 'T00:00:00Z').getTime() - startDateObj.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    daysElapsed = Math.min(7, Math.max(1, diffDays + 1));
  } else if (todayStr < resolvedWeekStartDate) {
    isCurrentWeek = false;
    daysElapsed = 0;
  } else {
    isCurrentWeek = false;
    daysElapsed = 7;
  }

  // Fetch daily_steps (including per-day goal snapshot) and step goal history for the reporting week
  const [goalHistory, currentStepsInitial] = await Promise.all([
    getStepGoalHistory(userId),
    supabase
      .from('daily_steps')
      .select('date, steps, distance_km, active_calories, step_goal')
      .eq('user_id', userId)
      .gte('date', resolvedWeekStartDate)
      .lte('date', weekEndDate),
  ]);

  let currentRecords: any[] | null = currentStepsInitial.data;
  let currentError: any = currentStepsInitial.error;

  if (currentError && isMissingColumnError(currentError, 'step_goal')) {
    const fallback = await supabase
      .from('daily_steps')
      .select('date, steps, distance_km, active_calories')
      .eq('user_id', userId)
      .gte('date', resolvedWeekStartDate)
      .lte('date', weekEndDate);
    currentRecords = fallback.data;
    currentError = fallback.error;
  }

  if (currentError) {
    console.error('getWeeklyReport currentRecords error:', currentError);
    throw { status: 500, error: 'server_error', message: 'Failed to fetch weekly records' };
  }

  const currentMap = new Map<
    string,
    { steps: number; distanceKm: number; activeCalories: number; stepGoal: number | null }
  >();
  for (const r of currentRecords ?? []) {
    currentMap.set(r.date, {
      steps: r.steps || 0,
      distanceKm: Number(r.distance_km || 0),
      activeCalories: Number(r.active_calories || 0),
      stepGoal: typeof r.step_goal === 'number' && r.step_goal > 0 ? Number(r.step_goal) : null,
    });
  }

  const dayOfWeekShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeekLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const dailyBreakdown: WeeklyReportDailyBreakdown[] = [];
  let bestDayIndex = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(resolvedWeekStartDate, i);
    const dayDate = new Date(date + 'T00:00:00Z');
    const dayIdx = dayDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const rec = currentMap.get(date) || {
      steps: 0,
      distanceKm: 0,
      activeCalories: 0,
      stepGoal: null,
    };
    const dayGoal = resolveGoalForDate(date, {
      daySnapshotGoal: rec.stepGoal,
      history: goalHistory,
      fallbackGoal: dailyGoalSteps,
    });
    const isGoalMet = rec.steps >= dayGoal;

    const dayItem: WeeklyReportDailyBreakdown = {
      date,
      dayOfWeek: dayOfWeekShort[dayIdx],
      steps: rec.steps,
      distanceKm: Math.round(rec.distanceKm * 10) / 10,
      activeCalories: Math.round(rec.activeCalories),
      stepGoal: dayGoal,
      isGoalMet,
    };

    dailyBreakdown.push(dayItem);

    if (rec.steps > dailyBreakdown[bestDayIndex].steps) {
      bestDayIndex = i;
    }
  }

  const totalSteps = dailyBreakdown.reduce((sum, d) => sum + d.steps, 0);
  const totalDistanceKm = Math.round(dailyBreakdown.reduce((sum, d) => sum + d.distanceKm, 0) * 10) / 10;
  const totalActiveCalories = Math.round(dailyBreakdown.reduce((sum, d) => sum + d.activeCalories, 0));
  const daysGoalAchieved = dailyBreakdown.filter(d => d.isGoalMet).length;

  const bestDayDate = new Date(dailyBreakdown[bestDayIndex].date + 'T00:00:00Z');
  const bestDayIdx = bestDayDate.getUTCDay();
  const bestDay: WeeklyReportBestDay = {
    date: dailyBreakdown[bestDayIndex].date,
    dayOfWeek: dayOfWeekLong[bestDayIdx],
    steps: dailyBreakdown[bestDayIndex].steps,
  };

  const dailyAverageSteps = daysElapsed > 0 ? Math.round(totalSteps / daysElapsed) : 0;

  // Comparison with prior week
  const compDays = isCurrentWeek ? Math.max(1, daysElapsed) : 7;
  const priorCompEnd = addDays(priorWeekStartDate, compDays - 1);

  const { data: priorRecords, error: priorError } = await supabase
    .from('daily_steps')
    .select('date, steps, distance_km, active_calories')
    .eq('user_id', userId)
    .gte('date', priorWeekStartDate)
    .lte('date', priorCompEnd);

  if (priorError) {
    console.error('getWeeklyReport priorRecords error:', priorError);
    throw { status: 500, error: 'server_error', message: 'Failed to fetch prior week records' };
  }

  let priorSteps = 0;
  let priorDistance = 0;
  let priorCalories = 0;
  let hasPriorRecords = false;

  for (const r of priorRecords ?? []) {
    hasPriorRecords = true;
    priorSteps += r.steps || 0;
    priorDistance += Number(r.distance_km || 0);
    priorCalories += Number(r.active_calories || 0);
  }

  const currentCompSlice = dailyBreakdown.slice(0, compDays);
  const currentCompSteps = currentCompSlice.reduce((sum, d) => sum + d.steps, 0);
  const currentCompDistance = currentCompSlice.reduce((sum, d) => sum + d.distanceKm, 0);
  const currentCompCalories = currentCompSlice.reduce((sum, d) => sum + d.activeCalories, 0);

  const hasPriorWeekBaseline = hasPriorRecords && (priorSteps > 0 || priorDistance > 0 || priorCalories > 0);

  const stepsChangePercent = calcChangePercent(currentCompSteps, priorSteps);
  const distanceChangePercent = calcChangePercent(currentCompDistance, priorDistance);
  const caloriesChangePercent = calcChangePercent(currentCompCalories, priorCalories);

  // Community Rank Calculation
  const { data: communityRows, error: commError } = await supabase
    .from('daily_steps')
    .select('user_id, steps')
    .gte('date', resolvedWeekStartDate)
    .lte('date', weekEndDate);

  if (commError) {
    console.error('getWeeklyReport communityRows error:', commError);
  }

  const userStepTotals = new Map<string, number>();
  for (const row of communityRows ?? []) {
    userStepTotals.set(row.user_id, (userStepTotals.get(row.user_id) || 0) + (row.steps || 0));
  }
  userStepTotals.set(userId, totalSteps);

  const allActiveUserSteps = Array.from(userStepTotals.values());
  const totalEligibleUsers = allActiveUserSteps.length;

  let topPercentage: number | null = null;
  if (totalEligibleUsers >= 2) {
    const usersWithFewerSteps = allActiveUserSteps.filter(s => s < totalSteps).length;
    const outperformedPercentile = (usersWithFewerSteps / totalEligibleUsers) * 100;
    topPercentage = Math.min(100, Math.max(1, Math.round(100 - outperformedPercentile)));
  }

  // Fetch badges earned during reporting week
  let badgesEarned: Array<{
    id: string;
    name: string;
    description?: string;
    earnedAt: string;
    category?: string;
    badgeIconUrl?: string;
  }> = [];

  try {
    const { data: achievements } = await supabase
      .from('user_achievements')
      .select('id, category, badge_key, earned_at, metadata')
      .eq('user_id', userId)
      .gte('earned_at', `${resolvedWeekStartDate}T00:00:00.000Z`)
      .lte('earned_at', `${weekEndDate}T23:59:59.999Z`);

    if (achievements) {
      badgesEarned = achievements.map((a: any) => ({
        id: a.id,
        name: a.metadata?.title || a.badge_key,
        description: a.metadata?.description || undefined,
        earnedAt: a.earned_at,
        category: a.category,
        badgeIconUrl: a.metadata?.badgeIconUrl || undefined,
      }));
    }
  } catch (err) {
    console.warn('[healthService] Error querying weekly badges earned:', err);
  }

  // Resolve distance equivalent from recorded distance in metres (never converted from steps)
  let distanceEquivalent = null;
  try {
    distanceEquivalent = await resolveWeeklyDistanceEquivalent({
      userId,
      weekStartDate: resolvedWeekStartDate,
      distanceMeters: Math.round(totalDistanceKm * 1000),
      profileCountry: profile?.country ?? null,
      deviceRegion: deviceRegion ?? null,
      periodLabel: 'this week',
    });
  } catch (err) {
    console.warn('[healthService] Error resolving weekly distance equivalent:', err);
  }

  return {
    reportingPeriod: {
      weekStartDate: resolvedWeekStartDate,
      weekEndDate,
      isCurrentWeek,
      daysElapsed,
      startOfWeek: userPrefs.startOfWeek,
    },
    summary: {
      totalSteps,
      totalDistanceKm,
      totalActiveCalories,
      dailyGoalSteps,
      daysGoalAchieved,
      distanceMeasuredIn: userPrefs.distanceUnit,
      energyMeasuredIn: userPrefs.energyUnit,
      startOfWeek: userPrefs.startOfWeek,
    },
    comparison: {
      stepsChangePercent,
      distanceChangePercent,
      caloriesChangePercent,
      hasPriorWeekBaseline,
    },
    communityRank: {
      topPercentage,
      totalEligibleUsers,
    },
    dailyBreakdown,
    highlights: {
      bestDay,
      dailyAverageSteps,
    },
    badgesEarned,
    distanceEquivalent,
  };
};

