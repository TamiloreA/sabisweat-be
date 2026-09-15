import { getUserSupabase } from '../config/database';

export interface HealthSyncPayload {
  date: string;
  source: string;
  steps: number;
  distanceKm?: number;
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
  const distance = payload.distanceKm || (steps * 0.000762); // Fallback estimate if not provided

  const updateData = {
    user_id: userId,
    date: payload.date,
    steps,
    distance_km: distance,
    source: payload.source || 'unknown',
    time_zone: payload.timeZone || 'UTC',
    synced_at: payload.syncedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await getUserSupabase(token)
    .from('daily_steps')
    .upsert(updateData, { onConflict: 'user_id,date' });

  if (error) {
    console.error('syncStepData error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to sync step data' };
  }

  return { message: 'Sync successful', syncedAt: updateData.synced_at };
};

export const syncStepDataBatch = async (userId: string, payloads: HealthSyncPayload[], token: string) => {
  const records = payloads.map(payload => {
    const steps = validateAndCapSteps(payload.steps || 0);
    const distance = payload.distanceKm || (steps * 0.000762);
    return {
      user_id: userId,
      date: payload.date,
      steps,
      distance_km: distance,
      source: payload.source || 'unknown',
      time_zone: payload.timeZone || 'UTC',
      synced_at: payload.syncedAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  const { error } = await getUserSupabase(token)
    .from('daily_steps')
    .upsert(records, { onConflict: 'user_id,date' });

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
