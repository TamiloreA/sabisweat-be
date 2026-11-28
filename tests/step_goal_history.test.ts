/**
 * Comprehensive Tests for Historical Step-Goal Preservation, Streaks & Achievements
 *
 * Covers:
 * - Scenario A: Lowering the goal (30 days at 10,000 -> lowered to 1,000; no retroactive streak awards)
 * - Scenario B: Increasing the goal (1,000 -> 10,000; prior hits & earned badges preserved)
 * - Scenario C: Existing streak (longest & current streak preserved & accurately evaluated)
 * - Scenario D: Multiple goal changes across dates & same-day deduplication (exact prompt table)
 * - Scenario E: Achievement recalculation & historical step reprocessing (no retroactive / duplicate awards)
 * - Scenario F: Current-day goal update (effective today, historical days unaffected)
 */

interface MockProfile {
  id: string;
  step_goal: number;
  finished_onboarded_at: string;
  created_at: string;
  life_happens_passes: number;
  last_free_pass_month: string | null;
  points_balance: number;
  longest_streak_days: number;
  steps_count: number;
  referral_code: string | null;
  preferences?: any;
  country?: string | null;
}

interface MockDailyStep {
  user_id: string;
  date: string;
  steps: number;
  distance_km: number;
  active_calories: number;
  step_goal?: number | null;
  source?: string;
  time_zone?: string;
  synced_at?: string;
  updated_at?: string;
}

interface MockGoalHistory {
  user_id: string;
  effective_date: string;
  step_goal: number;
  time_zone?: string;
  updated_at?: string;
}

interface MockAchievement {
  id: string;
  user_id: string;
  category: string;
  badge_key: string;
  earned_at: string | null;
  progress_value: number;
  target_value: number;
  month_period: string | null;
  metadata: Record<string, any>;
}

const db = {
  profiles: new Map<string, MockProfile>(),
  dailySteps: [] as MockDailyStep[],
  goalHistory: [] as MockGoalHistory[],
  redemptions: [] as Array<{ user_id: string; missed_date: string; source: string }>,
  achievements: [] as MockAchievement[],
  devices: [] as Array<{ user_id: string; timezone: string; is_active: boolean; last_seen_at: string }>,
};

let achIdSeq = 1;

function resetDb() {
  db.profiles.clear();
  db.dailySteps = [];
  db.goalHistory = [];
  db.redemptions = [];
  db.achievements = [];
  db.devices = [];
  achIdSeq = 1;
}

function createQueryBuilder(table: string) {
  let filters: Array<(row: any) => boolean> = [];
  let orderSpec: { col: string; asc: boolean } | null = null;
  let limitVal: number | null = null;
  let pendingOp: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  let payload: any = null;
  let upsertOpts: any = null;

  const getTableRows = (): any[] => {
    switch (table) {
      case 'profiles':
        return Array.from(db.profiles.values());
      case 'daily_steps':
        return db.dailySteps;
      case 'user_step_goal_history':
        return db.goalHistory;
      case 'life_happens_redemptions':
        return db.redemptions;
      case 'user_achievements':
        return db.achievements;
      case 'user_devices':
        return db.devices;
      default:
        return [];
    }
  };

  const applyRead = () => {
    let rows = getTableRows().filter((r) => filters.every((fn) => fn(r)));
    if (orderSpec) {
      const { col, asc } = orderSpec;
      rows = [...rows].sort((a, b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    if (limitVal !== null) {
      rows = rows.slice(0, limitVal);
    }
    return rows.map((r) => ({ ...r }));
  };

  const execute = async () => {
    if (pendingOp === 'select') {
      return { data: applyRead(), error: null, count: applyRead().length };
    }

    if (pendingOp === 'update') {
      const rows = getTableRows().filter((r) => filters.every((fn) => fn(r)));
      for (const r of rows) {
        Object.assign(r, payload);
      }
      return { data: rows, error: null };
    }

    if (pendingOp === 'insert' || pendingOp === 'upsert') {
      const items = Array.isArray(payload) ? payload : [payload];
      if (table === 'user_step_goal_history') {
        for (const item of items) {
          const idx = db.goalHistory.findIndex(
            (h) => h.user_id === item.user_id && h.effective_date === item.effective_date
          );
          if (idx >= 0) {
            if (upsertOpts?.ignoreDuplicates) continue;
            db.goalHistory[idx] = { ...db.goalHistory[idx], ...item };
          } else {
            db.goalHistory.push({ ...item });
          }
        }
        return { data: items, error: null };
      }

      if (table === 'daily_steps') {
        for (const item of items) {
          const idx = db.dailySteps.findIndex(
            (d) => d.user_id === item.user_id && d.date === item.date
          );
          if (idx >= 0) {
            db.dailySteps[idx] = { ...db.dailySteps[idx], ...item };
          } else {
            db.dailySteps.push({
              distance_km: 0,
              active_calories: 0,
              ...item,
            });
          }
        }
        return { data: items, error: null };
      }

      if (table === 'user_achievements') {
        // Enforce unique constraint (user_id, category, badge_key, COALESCE(month_period, ''))
        for (const item of items) {
          const dup = db.achievements.some(
            (a) =>
              a.user_id === item.user_id &&
              a.category === item.category &&
              a.badge_key === item.badge_key &&
              (a.month_period || '') === (item.month_period || '')
          );
          if (dup) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
        }
        for (const item of items) {
          db.achievements.push({
            id: `ach-${achIdSeq++}`,
            ...item,
          });
        }
        return { data: items, error: null };
      }

      if (table === 'life_happens_redemptions') {
        for (const item of items) {
          db.redemptions.push({ ...item });
        }
        return { data: items, error: null };
      }

      return { data: items, error: null };
    }

    return { data: null, error: null };
  };

  const builder: any = {
    select: () => {
      if (pendingOp === 'select') pendingOp = 'select';
      return builder;
    },
    insert: (p: any) => {
      pendingOp = 'insert';
      payload = p;
      return builder;
    },
    upsert: (p: any, opts?: any) => {
      pendingOp = 'upsert';
      payload = p;
      upsertOpts = opts;
      return builder;
    },
    update: (p: any) => {
      pendingOp = 'update';
      payload = p;
      return builder;
    },
    eq: (col: string, val: any) => {
      filters.push((r) => r[col] === val);
      return builder;
    },
    neq: (col: string, val: any) => {
      filters.push((r) => r[col] !== val);
      return builder;
    },
    gte: (col: string, val: any) => {
      filters.push((r) => String(r[col]) >= String(val));
      return builder;
    },
    lte: (col: string, val: any) => {
      filters.push((r) => String(r[col]) <= String(val));
      return builder;
    },
    in: (col: string, vals: any[]) => {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    or: () => builder,
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderSpec = { col, asc: opts?.ascending !== false };
      return builder;
    },
    limit: (n: number) => {
      limitVal = n;
      return builder;
    },
    single: async () => {
      const res = await execute();
      const rows = Array.isArray(res.data) ? res.data : [];
      return { data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116', message: 'Not found' } };
    },
    maybeSingle: async () => {
      const res = await execute();
      const rows = Array.isArray(res.data) ? res.data : [];
      return { data: rows[0] ?? null, error: res.error };
    },
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  return builder;
}

jest.mock('../src/config/database', () => ({
  supabase: {
    from: (table: string) => createQueryBuilder(table),
  },
  getUserSupabase: () => ({
    from: (table: string) => createQueryBuilder(table),
  }),
}));

jest.mock('../src/services/challengeService', () => ({
  getCompletedChallenges: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/notificationEventService', () => ({
  handleStepSyncEvents: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/services/sabiLevelService', () => ({
  checkAndAwardSabiLevelMilestones: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/services/distanceEquivalentsService', () => ({
  resolveWeeklyDistanceEquivalent: jest.fn().mockResolvedValue(null),
}));

import {
  recordStepGoalChange,
  resolveGoalForDate,
} from '../src/services/stepGoalHistoryService';
import * as streaksService from '../src/services/streaksService';
import * as achievementService from '../src/services/achievementService';
import * as healthService from '../src/services/healthService';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Historical Step-Goal Preservation, Streaks & Achievements', () => {
  beforeEach(() => {
    resetDb();
    jest.clearAllMocks();
  });

  // ── Scenario A — Lowering the goal ────────────────────────────────────────
  it('Scenario A: lowering goal from 10,000 to 1,000 after 30 days does not rewrite history or award retroactive achievements', async () => {
    const userId = 'user-scenario-a';
    const startDate = '2026-10-01';
    const changeDate = '2026-10-31'; // Day 31

    // Legacy user with NO prior goal_history rows yet (pre-migration user)
    db.profiles.set(userId, {
      id: userId,
      step_goal: 10000,
      finished_onboarded_at: `${startDate}T08:00:00.000Z`,
      created_at: `${startDate}T08:00:00.000Z`,
      life_happens_passes: 2,
      last_free_pass_month: '2026-10',
      points_balance: 0,
      longest_streak_days: 0,
      steps_count: 150000,
      referral_code: null,
    });

    // 30 days of 5,000 steps each: missed 10,000 every day, would have hit 1,000 every day
    for (let i = 0; i < 30; i++) {
      db.dailySteps.push({
        user_id: userId,
        date: addDays(startDate, i),
        steps: 5000,
        distance_km: 3.8,
        active_calories: 200,
        step_goal: null, // pre-migration row without snapshot
      });
    }

    // User lowers goal from 10,000 -> 1,000 on Day 31
    await recordStepGoalChange(userId, 1000, {
      timeZone: 'Africa/Lagos',
      effectiveDate: changeDate,
    });

    // Day 31 has 1,500 steps (hits the new 1,000 goal)
    db.dailySteps.push({
      user_id: userId,
      date: changeDate,
      steps: 1500,
      distance_km: 1.1,
      active_calories: 60,
      step_goal: 1000,
    });

    // 1. Streak evaluation must keep Days 1-30 against 10,000 (not achieved) and Day 31 against 1,000 (achieved)
    const streak = await streaksService.getCurrentStreak(userId, 'Africa/Lagos', changeDate);
    expect(streak.stepGoal).toBe(1000);
    expect(streak.streakDays).toBe(1); // Only Day 31!
    expect(streak.longestStreakDays).toBe(1);
    expect(streak.hitDates).toEqual([changeDate]);
    expect(streak.missDates).toHaveLength(30);

    const day1 = streak.data.find((d) => d.day === startDate);
    expect(day1?.stepGoal).toBe(10000);
    expect(day1?.status).toBe('partial');

    // 2. Calendar for October preserves historical goals & statuses
    const calendar = await streaksService.getStreakCalendar(userId, '2026-10', 'Africa/Lagos', changeDate);
    expect(calendar.hitDates).toEqual([changeDate]);
    expect(calendar.missDates).toHaveLength(30);

    // 3. Weekly report for Oct 18-24 (under 10,000 goal) shows 0 days goal achieved
    const weekly = await healthService.getWeeklyReport(userId, '2026-10-18', 'Africa/Lagos');
    expect(weekly.summary.daysGoalAchieved).toBe(0);
    expect(weekly.dailyBreakdown.every((d) => d.stepGoal === 10000 && d.isGoalMet === false)).toBe(true);

    // 4. Achievements: NO retroactive streak badges (3/7/14/30) unlocked, and read does not insert into user_achievements
    const summary = await achievementService.getAchievementsSummary(userId, 'Africa/Lagos');
    const earnedStreaks = summary.dailyStreaks.items.filter((i) => i.earned);
    expect(earnedStreaks).toHaveLength(0);
    expect(db.achievements).toHaveLength(0);
  });

  // ── Scenario B — Increasing the goal ──────────────────────────────────────
  it('Scenario B: increasing goal from 1,000 to 10,000 preserves prior successful days and earned achievements', async () => {
    const userId = 'user-scenario-b';
    const startDate = '2026-10-01';
    const changeDate = '2026-10-08';

    db.profiles.set(userId, {
      id: userId,
      step_goal: 1000,
      finished_onboarded_at: `${startDate}T08:00:00.000Z`,
      created_at: `${startDate}T08:00:00.000Z`,
      life_happens_passes: 2,
      last_free_pass_month: '2026-10',
      points_balance: 0,
      longest_streak_days: 0,
      steps_count: 17500,
      referral_code: null,
    });
    db.goalHistory.push({ user_id: userId, effective_date: startDate, step_goal: 1000 });

    // 7 days of 2,500 steps each under the 1,000 goal
    for (let i = 0; i < 7; i++) {
      db.dailySteps.push({
        user_id: userId,
        date: addDays(startDate, i),
        steps: 2500,
        distance_km: 1.9,
        active_calories: 100,
        step_goal: 1000,
      });
    }

    // Legitimately award 3-day and 7-day streak badges on Day 7
    jest.spyOn(streaksService, 'getCurrentStreak').mockImplementationOnce((uid, tz) =>
      jest.requireActual('../src/services/streaksService').getCurrentStreak(uid, tz, '2026-10-07')
    );
    const beforeAward = await achievementService.evaluateAndAwardAchievements(userId, 'Africa/Lagos');
    expect(beforeAward.insertedCount).toBe(2); // streak_3 and streak_7
    const originalStreak7 = db.achievements.find((a) => a.badge_key === 'streak_7');
    expect(originalStreak7).toBeDefined();

    // User increases goal from 1,000 -> 10,000 on Day 8
    await recordStepGoalChange(userId, 10000, {
      timeZone: 'Africa/Lagos',
      effectiveDate: changeDate,
    });

    // Day 8 has 3,000 steps (not yet hitting 10,000, still in progress)
    db.dailySteps.push({
      user_id: userId,
      date: changeDate,
      steps: 3000,
      distance_km: 2.3,
      active_calories: 120,
      step_goal: 10000,
    });

    const streakAfter = await streaksService.getCurrentStreak(userId, 'Africa/Lagos', changeDate);
    expect(streakAfter.hitDates).toHaveLength(7); // Days 1-7 stay hit!
    expect(streakAfter.longestStreakDays).toBe(7);
    expect(streakAfter.streakDays).toBe(7); // Day 8 is pending today

    // Earned achievements remain permanently intact with original earnedAt
    jest.spyOn(streaksService, 'getCurrentStreak').mockImplementationOnce((uid, tz) =>
      jest.requireActual('../src/services/streaksService').getCurrentStreak(uid, tz, changeDate)
    );
    const summaryAfter = await achievementService.getAchievementsSummary(userId, 'Africa/Lagos');
    const streak3 = summaryAfter.dailyStreaks.items.find((i) => i.id === 'streak_3');
    const streak7 = summaryAfter.dailyStreaks.items.find((i) => i.id === 'streak_7');
    expect(streak3?.earned).toBe(true);
    expect(streak7?.earned).toBe(true);
    expect(streak7?.earnedAt).toBe(originalStreak7?.earned_at);
  });

  // ── Scenario C — Existing streak ──────────────────────────────────────────
  it('Scenario C: preserves longest streak and accurately computes current streak across a goal change', async () => {
    const userId = 'user-scenario-c';
    const startDate = '2026-10-01';

    db.profiles.set(userId, {
      id: userId,
      step_goal: 10000,
      finished_onboarded_at: `${startDate}T08:00:00.000Z`,
      created_at: `${startDate}T08:00:00.000Z`,
      life_happens_passes: 2,
      last_free_pass_month: '2026-10',
      points_balance: 0,
      longest_streak_days: 10, // Previously established 10-day longest streak
      steps_count: 150000,
      referral_code: null,
    });
    db.goalHistory.push({ user_id: userId, effective_date: startDate, step_goal: 10000 });

    // Days 1-10: hit (10-day longest streak)
    for (let i = 0; i < 10; i++) {
      db.dailySteps.push({
        user_id: userId,
        date: addDays(startDate, i),
        steps: 10500,
        distance_km: 8.0,
        active_calories: 400,
        step_goal: 10000,
      });
    }
    // Day 11: miss (2,000 < 10,000)
    db.dailySteps.push({
      user_id: userId,
      date: addDays(startDate, 10),
      steps: 2000,
      distance_km: 1.5,
      active_calories: 80,
      step_goal: 10000,
    });
    // Days 12-15: 4-day active streak under 10,000
    for (let i = 11; i < 15; i++) {
      db.dailySteps.push({
        user_id: userId,
        date: addDays(startDate, i),
        steps: 11000,
        distance_km: 8.4,
        active_calories: 420,
        step_goal: 10000,
      });
    }

    // Day 16: change goal to 6,000 and hit 6,500 steps
    const day16 = addDays(startDate, 15);
    await recordStepGoalChange(userId, 6000, {
      timeZone: 'Africa/Lagos',
      effectiveDate: day16,
    });
    db.dailySteps.push({
      user_id: userId,
      date: day16,
      steps: 6500,
      distance_km: 4.9,
      active_calories: 250,
      step_goal: 6000,
    });

    const streak = await streaksService.getCurrentStreak(userId, 'Africa/Lagos', day16);
    expect(streak.longestStreakDays).toBe(10); // Preserved!
    expect(streak.streakDays).toBe(5); // Days 12-15 (under 10k) + Day 16 (under 6k); Day 11 stays missed!
    expect(streak.missDates).toEqual([addDays(startDate, 10)]);
  });

  // ── Scenario D — Multiple goal changes (including exact prompt table) ─────
  it('Scenario D: handles multiple goal changes across dates and same-day updates without overlap', async () => {
    const userId = 'user-scenario-d';
    const d1 = '2026-10-01';
    const d2 = '2026-10-02';
    const d3 = '2026-10-03';
    const d4 = '2026-10-04';
    const d5 = '2026-10-05';
    const d6 = '2026-10-06';

    db.profiles.set(userId, {
      id: userId,
      step_goal: 10000,
      finished_onboarded_at: `${d1}T08:00:00.000Z`,
      created_at: `${d1}T08:00:00.000Z`,
      life_happens_passes: 2,
      last_free_pass_month: '2026-10',
      points_balance: 0,
      longest_streak_days: 0,
      steps_count: 0,
      referral_code: null,
    });
    db.goalHistory.push({ user_id: userId, effective_date: d1, step_goal: 10000 });

    // Prompt's exact table:
    // Day 1: 11,000 vs 10,000 -> Achieved
    // Day 2: 12,000 vs 10,000 -> Achieved
    // Day 3:  8,000 vs 10,000 -> Not achieved
    // Day 4:  1,500 vs  1,000 -> Achieved
    // Day 5:  2,000 vs  1,000 -> Achieved
    db.dailySteps.push(
      { user_id: userId, date: d1, steps: 11000, distance_km: 8.3, active_calories: 400 },
      { user_id: userId, date: d2, steps: 12000, distance_km: 9.1, active_calories: 440 },
      { user_id: userId, date: d3, steps: 8000, distance_km: 6.1, active_calories: 300 }
    );

    // Change goal to 1,000 on Day 4
    await recordStepGoalChange(userId, 1000, { timeZone: 'Africa/Lagos', effectiveDate: d4 });
    db.dailySteps.push(
      { user_id: userId, date: d4, steps: 1500, distance_km: 1.1, active_calories: 60 },
      { user_id: userId, date: d5, steps: 2000, distance_km: 1.5, active_calories: 80 }
    );

    // Multiple same-day changes on Day 6: 5,000 -> 8,000 -> 6,000
    await recordStepGoalChange(userId, 5000, { timeZone: 'Africa/Lagos', effectiveDate: d6 });
    await recordStepGoalChange(userId, 8000, { timeZone: 'Africa/Lagos', effectiveDate: d6 });
    await recordStepGoalChange(userId, 6000, { timeZone: 'Africa/Lagos', effectiveDate: d6 });
    db.dailySteps.push({ user_id: userId, date: d6, steps: 6500, distance_km: 4.9, active_calories: 250 });

    // Ensure no overlapping duplicate entries for Day 6
    expect(db.goalHistory.filter((h) => h.effective_date === d6)).toHaveLength(1);
    expect(db.goalHistory.find((h) => h.effective_date === d6)?.step_goal).toBe(6000);

    const streak = await streaksService.getCurrentStreak(userId, 'Africa/Lagos', d6);
    const byDay = new Map(streak.data.map((d) => [d.day, d]));

    expect(byDay.get(d1)).toMatchObject({ steps: 11000, stepGoal: 10000, status: 'hit' });
    expect(byDay.get(d2)).toMatchObject({ steps: 12000, stepGoal: 10000, status: 'hit' });
    expect(byDay.get(d3)).toMatchObject({ steps: 8000, stepGoal: 10000, status: 'partial' });
    expect(byDay.get(d4)).toMatchObject({ steps: 1500, stepGoal: 1000, status: 'hit' });
    expect(byDay.get(d5)).toMatchObject({ steps: 2000, stepGoal: 1000, status: 'hit' });
    expect(byDay.get(d6)).toMatchObject({ steps: 6500, stepGoal: 6000, status: 'hit' });
    expect(streak.streakDays).toBe(3); // Days 4, 5, 6
    expect(streak.longestStreakDays).toBe(3);
  });

  // ── Scenario E — Achievement recalculation & step reprocessing ────────────
  it('Scenario E: reprocessing historical steps after goal drop creates no retroactive or duplicate achievements', async () => {
    const userId = 'user-scenario-e';
    const d1 = '2026-10-01';
    const d2 = '2026-10-02';
    const d3 = '2026-10-03';
    const d4 = '2026-10-04';

    db.profiles.set(userId, {
      id: userId,
      step_goal: 10000,
      finished_onboarded_at: `${d1}T08:00:00.000Z`,
      created_at: `${d1}T08:00:00.000Z`,
      life_happens_passes: 2,
      last_free_pass_month: '2026-10',
      points_balance: 0,
      longest_streak_days: 0,
      steps_count: 210000,
      referral_code: null,
    });
    db.goalHistory.push({ user_id: userId, effective_date: d1, step_goal: 10000 });

    // Days 1-3: 4,000 steps each under 10,000 goal (missed daily goal, but cumulative lifetime steps >= 200k)
    db.dailySteps.push(
      { user_id: userId, date: d1, steps: 4000, distance_km: 3.0, active_calories: 150, step_goal: 10000 },
      { user_id: userId, date: d2, steps: 4000, distance_km: 3.0, active_calories: 150, step_goal: 10000 },
      { user_id: userId, date: d3, steps: 4000, distance_km: 3.0, active_calories: 150, step_goal: 10000 }
    );

    // Award cumulative 200k step milestone legitimately
    const firstEval = await achievementService.evaluateAndAwardAchievements(userId, 'Africa/Lagos');
    expect(db.achievements.some((a) => a.category === 'step_milestone' && a.badge_key === 'step_200k')).toBe(true);
    expect(db.achievements.some((a) => a.category === 'daily_streak')).toBe(false);
    const initialCount = db.achievements.length;
    expect(firstEval.insertedCount).toBe(initialCount);

    // Lower goal to 1,000 on Day 4
    await recordStepGoalChange(userId, 1000, { timeZone: 'Africa/Lagos', effectiveDate: d4 });

    // Re-sync historical Days 1-3 via syncStepDataBatch
    await healthService.syncStepDataBatch(
      userId,
      [
        { date: d1, steps: 4000, timeZone: 'Africa/Lagos' },
        { date: d2, steps: 4000, timeZone: 'Africa/Lagos' },
        { date: d3, steps: 4000, timeZone: 'Africa/Lagos' },
      ],
      'mock-token'
    );

    // Historical snapshots MUST remain 10,000 (not overwritten with 1,000!)
    expect(db.dailySteps.find((d) => d.date === d1)?.step_goal).toBe(10000);
    expect(db.dailySteps.find((d) => d.date === d2)?.step_goal).toBe(10000);
    expect(db.dailySteps.find((d) => d.date === d3)?.step_goal).toBe(10000);

    // Re-run achievement awarding twice: zero retroactive streak awards, zero duplicates!
    const rerun1 = await achievementService.evaluateAndAwardAchievements(userId, 'Africa/Lagos');
    const rerun2 = await achievementService.evaluateAndAwardAchievements(userId, 'Africa/Lagos');
    expect(rerun1.insertedCount).toBe(0);
    expect(rerun2.insertedCount).toBe(0);
    expect(db.achievements).toHaveLength(initialCount);
    expect(db.achievements.some((a) => a.category === 'daily_streak')).toBe(false);
  });

  // ── Scenario F — Current-day update ───────────────────────────────────────
  it('Scenario F: updating goal during the current day applies to today while leaving yesterday unaffected', async () => {
    const userId = 'user-scenario-f';
    const yesterday = '2026-11-26';
    const today = '2026-11-27';

    db.profiles.set(userId, {
      id: userId,
      step_goal: 10000,
      finished_onboarded_at: `${yesterday}T08:00:00.000Z`,
      created_at: `${yesterday}T08:00:00.000Z`,
      life_happens_passes: 2,
      last_free_pass_month: '2026-11',
      points_balance: 0,
      longest_streak_days: 0,
      steps_count: 10000,
      referral_code: null,
    });
    db.goalHistory.push({ user_id: userId, effective_date: yesterday, step_goal: 10000 });

    // Both yesterday and today already have 5,000 steps synced under 10,000 goal
    db.dailySteps.push(
      { user_id: userId, date: yesterday, steps: 5000, distance_km: 3.8, active_calories: 200, step_goal: 10000 },
      { user_id: userId, date: today, steps: 5000, distance_km: 3.8, active_calories: 200, step_goal: 10000 }
    );

    // During today, user updates their goal to 4,000
    await recordStepGoalChange(userId, 4000, {
      timeZone: 'Africa/Lagos',
      effectiveDate: today,
    });

    // Yesterday's snapshot stays 10,000; today's snapshot updates to 4,000
    expect(db.dailySteps.find((d) => d.date === yesterday)?.step_goal).toBe(10000);
    expect(db.dailySteps.find((d) => d.date === today)?.step_goal).toBe(4000);

    const streak = await streaksService.getCurrentStreak(userId, 'Africa/Lagos', today);
    const yesterdayRow = streak.data.find((d) => d.day === yesterday);
    const todayRow = streak.data.find((d) => d.day === today);

    expect(yesterdayRow).toMatchObject({ steps: 5000, stepGoal: 10000, status: 'partial' });
    expect(todayRow).toMatchObject({ steps: 5000, stepGoal: 4000, status: 'hit' });
    expect(streak.streakDays).toBe(1); // Only today
    expect(streak.stepGoal).toBe(4000);
  });

  // ── Pure resolver unit check ──────────────────────────────────────────────
  it('resolveGoalForDate prefers day snapshot, then latest effective_date <= date, then earliest history', () => {
    const history = [
      { effective_date: '2026-10-05', step_goal: 10000 },
      { effective_date: '2026-10-12', step_goal: 6000 },
      { effective_date: '2026-10-20', step_goal: 12000 },
    ];

    expect(resolveGoalForDate('2026-10-01', { history, fallbackGoal: 12000 })).toBe(10000);
    expect(resolveGoalForDate('2026-10-05', { history, fallbackGoal: 12000 })).toBe(10000);
    expect(resolveGoalForDate('2026-10-11', { history, fallbackGoal: 12000 })).toBe(10000);
    expect(resolveGoalForDate('2026-10-12', { history, fallbackGoal: 12000 })).toBe(6000);
    expect(resolveGoalForDate('2026-10-19', { history, fallbackGoal: 12000 })).toBe(6000);
    expect(resolveGoalForDate('2026-10-20', { history, fallbackGoal: 12000 })).toBe(12000);
    // Explicit day snapshot wins
    expect(resolveGoalForDate('2026-10-15', { daySnapshotGoal: 8500, history, fallbackGoal: 12000 })).toBe(8500);
  });
});
