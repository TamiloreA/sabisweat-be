import { supabase } from '../config/database';
import {
  CurrentStreakResponse,
  PassBalanceResponse,
  PurchasePassResponse,
  RedeemPassResponse,
  StreakCalendarResponse,
  StreakDayData,
  StreakStatus,
} from '../models/streaksModel';

const PROFILES_TABLE = 'profiles';
const DAILY_STEPS_TABLE = 'daily_steps';
const REDEMPTIONS_TABLE = 'life_happens_redemptions';

/** Points cost to buy an extra Life Happens Pass. */
export const LIFE_HAPPENS_PASS_COST = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function statusFor(steps: number, goal: number): StreakStatus {
  if (steps >= goal) return 'hit';
  if (steps > 0) return 'partial';
  return 'miss';
}

interface ProfileRow {
  step_goal: number | null;
  finished_onboarded_at: string | null;
  created_at: string;
  life_happens_passes: number;
  last_free_pass_month: string | null;
  points_balance: number | null;
}

async function getProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('step_goal, finished_onboarded_at, created_at, life_happens_passes, last_free_pass_month, points_balance')
    .eq('id', userId)
    .single();
  if (error || !data) throw new Error('Profile not found');
  return data as ProfileRow;
}

async function getStepsMap(userId: string, from: string, to: string): Promise<Map<string, { steps: number; distanceKm: number }>> {
  const { data, error } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('date, steps, distance_km')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;

  const map = new Map<string, { steps: number; distanceKm: number }>();
  for (const row of data ?? []) {
    map.set(row.date, { steps: row.steps ?? 0, distanceKm: Number(row.distance_km ?? 0) });
  }
  return map;
}

async function getRedeemedDates(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from(REDEMPTIONS_TABLE)
    .select('missed_date')
    .eq('user_id', userId);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.missed_date));
}

/**
 * Grants the 1 free monthly pass if the current month hasn't been granted yet.
 * Returns the up-to-date pass count.
 */
async function ensureMonthlyPass(profile: ProfileRow, userId: string): Promise<number> {
  const month = currentMonthStr();
  if (profile.last_free_pass_month === month) {
    return profile.life_happens_passes;
  }

  const nextPasses = profile.life_happens_passes + 1;
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({ life_happens_passes: nextPasses, last_free_pass_month: month })
    .eq('id', userId);

  if (error) throw error;
  return nextPasses;
}

export async function getPassBalance(userId: string): Promise<PassBalanceResponse> {
  const profile = await getProfile(userId);
  const passes = await ensureMonthlyPass(profile, userId);
  return { passes };
}

export async function getCurrentStreak(userId: string): Promise<CurrentStreakResponse> {
  const profile = await getProfile(userId);
  const stepGoal = profile.step_goal ?? 10000;
  const today = todayStr();
  const windowStart = (profile.finished_onboarded_at ?? profile.created_at).slice(0, 10);
  const start = windowStart > today ? today : windowStart;

  const [stepsMap, redeemed] = await Promise.all([
    getStepsMap(userId, start, today),
    getRedeemedDates(userId),
  ]);

  const dates = eachDate(start, today);
  const data: StreakDayData[] = dates.map((day) => {
    const steps = stepsMap.get(day)?.steps ?? 0;
    return { day, steps, status: statusFor(steps, stepGoal) };
  });

  const hitDates: string[] = [];
  const missDates: string[] = [];
  const restoredDates: string[] = [];

  for (const day of dates) {
    const status = data.find((d) => d.day === day)!.status;
    const isRestored = redeemed.has(day);
    if (isRestored) {
      restoredDates.push(day);
    } else if (status === 'hit') {
      hitDates.push(day);
    } else if (day !== today) {
      // Today is still in progress — never count it as a miss
      missDates.push(day);
    }
  }

  // Longest streak: longest run of hits, where a restored day keeps the
  // chain alive but does not add to the count.
  let longestStreakDays = 0;
  let running = 0;
  for (const day of data) {
    const isRestored = redeemed.has(day.day);
    const isHit = day.status === 'hit';
    const isPendingToday = day.day === today && !isHit && !isRestored;

    if (isPendingToday) continue;
    if (isHit) {
      running += 1;
      if (running > longestStreakDays) longestStreakDays = running;
    } else if (isRestored) {
      // preserved, not earned — chain continues
    } else {
      running = 0;
    }
  }

  // Current streak: walk backwards from today, stop at the first true miss.
  let streakDays = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const day = data[i];
    const isRestored = redeemed.has(day.day);
    const isHit = day.status === 'hit';
    const isPendingToday = day.day === today && !isHit && !isRestored;

    if (isPendingToday) continue;
    if (isHit) {
      streakDays += 1;
      continue;
    }
    if (isRestored) continue; // preserved, doesn't increment
    break; // true miss ends the current streak
  }

  const passes = await ensureMonthlyPass(profile, userId);

  return {
    asOfDate: today,
    windowStartDate: start,
    windowEndDate: today,
    stepGoal,
    streakDays,
    streakWeeks: Math.floor(streakDays / 7),
    longestStreakDays,
    streakHitCount: hitDates.length,
    streakMissCount: missDates.length,
    hitDates,
    missDates,
    restoredDates,
    lifeHappensPasses: passes,
    data,
  };
}

export async function getStreakCalendar(userId: string, month: string): Promise<StreakCalendarResponse> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('month must be in YYYY-MM format');
  }

  const profile = await getProfile(userId);
  const stepGoal = profile.step_goal ?? 10000;
  const today = todayStr();

  const start = `${month}-01`;
  const nextMonth = month.slice(5) === '12'
    ? `${Number(month.slice(0, 4)) + 1}-01-01`
    : `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, '0')}-01`;
  const end = addDays(nextMonth, -1);
  const cappedEnd = end > today ? today : end;

  const [stepsMap, redeemed] = await Promise.all([
    getStepsMap(userId, start, cappedEnd),
    getRedeemedDates(userId),
  ]);

  const dates = cappedEnd >= start ? eachDate(start, cappedEnd) : [];
  const data = dates.map((day) => {
    const entry = stepsMap.get(day);
    const steps = entry?.steps ?? 0;
    return {
      day,
      steps,
      distanceKm: entry?.distanceKm ?? 0,
      status: statusFor(steps, stepGoal),
    };
  });

  const hitDates = data.filter((d) => d.status === 'hit').map((d) => d.day);
  const restoredDates = dates.filter((d) => redeemed.has(d));
  const missDates = data
    .filter((d) => d.status !== 'hit' && d.day !== today && !redeemed.has(d.day))
    .map((d) => d.day);

  return {
    month,
    stepGoal,
    streakHitCount: hitDates.length,
    streakMissCount: missDates.length,
    hitDates,
    missDates,
    restoredDates,
    data,
  };
}

export async function redeemPass(userId: string, date: string): Promise<RedeemPassResponse> {
  if (!DATE_RE.test(date)) {
    throw new Error('date must be YYYY-MM-DD');
  }

  const today = todayStr();
  if (date >= today) {
    throw new Error('You can only use a pass on a past day');
  }

  const profile = await getProfile(userId);
  const stepGoal = profile.step_goal ?? 10000;
  const onboarding = (profile.finished_onboarded_at ?? profile.created_at).slice(0, 10);
  if (date < onboarding) {
    throw new Error('That date is before you joined');
  }

  const [stepsMap, redeemed] = await Promise.all([
    getStepsMap(userId, date, date),
    getRedeemedDates(userId),
  ]);

  if (redeemed.has(date)) {
    throw new Error('You already used a pass on that day');
  }

  const steps = stepsMap.get(date)?.steps ?? 0;
  if (steps >= stepGoal) {
    throw new Error('That day already hit your goal — no pass needed');
  }

  const passes = await ensureMonthlyPass(profile, userId);
  if (passes <= 0) {
    throw new Error('No Life Happens Passes left');
  }

  const { error: insertError } = await supabase
    .from(REDEMPTIONS_TABLE)
    .insert({ user_id: userId, missed_date: date, source: 'free' });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from(PROFILES_TABLE)
    .update({ life_happens_passes: passes - 1 })
    .eq('id', userId);
  if (updateError) throw updateError;

  return { redeemed: true, date, passes: passes - 1 };
}

export async function purchasePass(userId: string): Promise<PurchasePassResponse> {
  const profile = await getProfile(userId);
  const balance = profile.points_balance ?? 0;

  if (balance < LIFE_HAPPENS_PASS_COST) {
    throw new Error(`Not enough points — a pass costs ${LIFE_HAPPENS_PASS_COST}`);
  }

  const nextPasses = profile.life_happens_passes + 1;
  const nextBalance = balance - LIFE_HAPPENS_PASS_COST;

  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({ life_happens_passes: nextPasses, points_balance: nextBalance })
    .eq('id', userId);

  if (error) throw error;

  return { purchased: true, passes: nextPasses, pointsBalance: nextBalance };
}
