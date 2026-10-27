import { getUserSupabase, supabase } from '../config/database';
import {
  WeeklyReportData,
  WeeklyReportDailyBreakdown,
  WeeklyReportBestDay,
} from '../models/healthModel';

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

export const syncStepData = async (userId: string, payload: HealthSyncPayload, token: string) => {
  const steps = validateAndCapSteps(payload.steps || 0);
  const distance = payload.distanceKm !== undefined ? Number(payload.distanceKm) : (steps * 0.000762);
  const activeCalories = payload.activeCalories !== undefined ? Number(payload.activeCalories) : 0;

  const updateData: any = {
    user_id: userId,
    date: payload.date,
    steps,
    distance_km: distance,
    active_calories: activeCalories,
    source: payload.source || 'unknown',
    time_zone: payload.timeZone || 'UTC',
    synced_at: payload.syncedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const client = getUserSupabase(token);
  let { error } = await client
    .from('daily_steps')
    .upsert(updateData, { onConflict: 'user_id,date' });

  // Fallback if active_calories column not yet migrated
  if (error && (error.code === '42703' || error.message?.includes('active_calories'))) {
    delete updateData.active_calories;
    const retry = await client
      .from('daily_steps')
      .upsert(updateData, { onConflict: 'user_id,date' });
    error = retry.error;
  }

  if (error) {
    console.error('syncStepData error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to sync step data' };
  }

  return { message: 'Sync successful', syncedAt: updateData.synced_at };
};

export const syncStepDataBatch = async (
  userId: string,
  payloads: HealthSyncPayload[],
  token: string,
  platform?: string
) => {
  const records = payloads.map(payload => {
    const steps = validateAndCapSteps(payload.steps || 0);
    const distance = payload.distanceKm !== undefined ? Number(payload.distanceKm) : (steps * 0.000762);
    const activeCalories = payload.activeCalories !== undefined ? Number(payload.activeCalories) : 0;
    return {
      user_id: userId,
      date: payload.date,
      steps,
      distance_km: distance,
      active_calories: activeCalories,
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

  // Fallback if active_calories column not yet migrated
  if (error && (error.code === '42703' || error.message?.includes('active_calories'))) {
    const fallbackRecords = records.map(r => {
      const { active_calories, ...rest } = r;
      return rest;
    });
    const retry = await client
      .from('daily_steps')
      .upsert(fallbackRecords, { onConflict: 'user_id,date' });
    error = retry.error;
  }

  if (error) {
    console.error('syncStepDataBatch error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to sync batch data' };
  }

  return { message: 'Batch sync successful' };
};

export const getHealthHistory = async (userId: string, params: { startDate?: string, endDate?: string, limit?: number }, token: string) => {
  let query = getUserSupabase(token)
    .from('daily_steps')
    .select('date, steps, distance_km, source, synced_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (params.startDate) query = query.gte('date', params.startDate);
  if (params.endDate) query = query.lte('date', params.endDate);
  if (params.limit) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve history' };
  }

  return {
    userId,
    data: data.map(r => ({
      date: r.date,
      steps: r.steps,
      distanceKm: r.distance_km,
      source: r.source,
      syncedAt: r.synced_at
    }))
  };
};

export const getHealthHistoryAll = async (userId: string, token: string) => {
  const { data: profile } = await getUserSupabase(token).from('profiles').select('created_at').eq('id', userId).single();
  
  const { data, error } = await getUserSupabase(token)
    .from('daily_steps')
    .select('date, steps, distance_km, synced_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve all history' };
  }

  return {
    onboardingStartDate: profile?.created_at,
    startDate: data.length > 0 ? data[data.length - 1].date : null,
    asOfDate: new Date().toISOString(),
    data: data.map(r => ({
      date: r.date,
      steps: r.steps,
      distanceKm: r.distance_km,
      lastSyncedAt: r.synced_at
    }))
  };
};

export const updateStepGoal = async (userId: string, stepGoal: number, token: string) => {
  const { error } = await getUserSupabase(token)
    .from('profiles')
    .update({ step_goal: stepGoal })
    .eq('id', userId);

  if (error) {
    throw { status: 500, error: 'server_error', message: 'Failed to update step goal' };
  }

  return { stepGoal, updatedAt: new Date().toISOString() };
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
  weekStartDate: string,
  timezone: string = 'Africa/Lagos'
): Promise<WeeklyReportData> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    const err: any = new Error('weekStartDate must be in YYYY-MM-DD format');
    err.status = 400;
    throw err;
  }

  const startDateObj = new Date(weekStartDate + 'T00:00:00Z');
  if (isNaN(startDateObj.getTime())) {
    const err: any = new Error('Invalid weekStartDate');
    err.status = 400;
    throw err;
  }

  const weekEndDate = addDays(weekStartDate, 6);
  const priorWeekStartDate = addDays(weekStartDate, -7);

  const todayStr = getTodayInTimezone(timezone);

  let isCurrentWeek = false;
  let daysElapsed = 7;

  if (todayStr >= weekStartDate && todayStr <= weekEndDate) {
    isCurrentWeek = true;
    const diffMs = new Date(todayStr + 'T00:00:00Z').getTime() - startDateObj.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    daysElapsed = Math.min(7, Math.max(1, diffDays + 1));
  } else if (todayStr < weekStartDate) {
    isCurrentWeek = false;
    daysElapsed = 0;
  } else {
    isCurrentWeek = false;
    daysElapsed = 7;
  }

  // Fetch step goal from user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('step_goal')
    .eq('id', userId)
    .maybeSingle();

  const dailyGoalSteps = profile?.step_goal || 8000;

  // Fetch daily_steps for the reporting week
  const { data: currentRecords, error: currentError } = await supabase
    .from('daily_steps')
    .select('date, steps, distance_km, active_calories')
    .eq('user_id', userId)
    .gte('date', weekStartDate)
    .lte('date', weekEndDate);

  if (currentError) {
    console.error('getWeeklyReport currentRecords error:', currentError);
    throw { status: 500, error: 'server_error', message: 'Failed to fetch weekly records' };
  }

  const currentMap = new Map<string, { steps: number; distanceKm: number; activeCalories: number }>();
  for (const r of currentRecords ?? []) {
    currentMap.set(r.date, {
      steps: r.steps || 0,
      distanceKm: Number(r.distance_km || 0),
      activeCalories: Number(r.active_calories || 0),
    });
  }

  const dayOfWeekShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeekLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const dailyBreakdown: WeeklyReportDailyBreakdown[] = [];
  let bestDayIndex = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStartDate, i);
    const rec = currentMap.get(date) || { steps: 0, distanceKm: 0, activeCalories: 0 };
    const isGoalMet = rec.steps >= dailyGoalSteps;

    const dayItem: WeeklyReportDailyBreakdown = {
      date,
      dayOfWeek: dayOfWeekShort[i],
      steps: rec.steps,
      distanceKm: Math.round(rec.distanceKm * 10) / 10,
      activeCalories: Math.round(rec.activeCalories),
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

  const bestDay: WeeklyReportBestDay = {
    date: dailyBreakdown[bestDayIndex].date,
    dayOfWeek: dayOfWeekLong[bestDayIndex],
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
    .gte('date', weekStartDate)
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

  return {
    reportingPeriod: {
      weekStartDate,
      weekEndDate,
      isCurrentWeek,
      daysElapsed,
    },
    summary: {
      totalSteps,
      totalDistanceKm,
      totalActiveCalories,
      dailyGoalSteps,
      daysGoalAchieved,
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
  };
};

