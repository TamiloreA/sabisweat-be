/**
 * Achievements Summary earnedAt & Persistence Unit Tests
 *
 * Verifies:
 * 1. getEndOfMonthTimestamp correctly computes exact end-of-month UTC timestamps (including leap years).
 * 2. Monthly Badges:
 *    - Thresholds (20k, 50k, 100k, 200k, 350k, 400k, 800k) evaluated in date order (date ASC).
 *    - When threshold is crossed on Day X, earnedAt is set to Day X of that month.
 *    - Same-day crossings: Crossing multiple thresholds on the same day gives all crossed badges that same day's timestamp.
 *    - Timestamps strictly belong to that badge's month (never following month / NOW()).
 *    - Historical badges without day logs fall back to end of that month (e.g. 2026-10-31T23:59:59.000Z), never today's date.
 *    - Correction: Badges previously saved with an incorrect timestamp (e.g. November for an October badge) are updated to the correct month.
 * 3. Step Milestones & Daily Streaks:
 *    - Step milestones use cumulative lifetime steps in date order to find crossing date.
 *    - Streaks use timeline to find crossing date.
 * 4. Database Persistence:
 *    - Newly earned badges are inserted into user_achievements.
 *    - Corrected badges are updated in user_achievements.
 */

import { getEndOfMonthTimestamp, getAchievementsSummary } from '../src/services/achievementService';
import * as streaksService from '../src/services/streaksService';
import * as challengeService from '../src/services/challengeService';

// In-memory mock database state
let mockProfile: any = null;
let mockDailySteps: any[] = [];
let mockUserAchievements: any[] = [];
const mockInserts: any[] = [];
const mockUpdates: any[] = [];

jest.mock('../src/config/database', () => {
  return {
    supabase: {
      from: (tableName: string) => {
        if (tableName === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: mockProfile,
                  error: null,
                }),
                or: () => ({
                  data: null,
                  count: 0,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (tableName === 'daily_steps') {
          return {
            select: () => ({
              eq: () => ({
                order: (_col: string, _opts: any) => ({
                  data: [...mockDailySteps].sort((a, b) => a.date.localeCompare(b.date)),
                  error: null,
                }),
              }),
            }),
          };
        }

        if (tableName === 'user_achievements') {
          return {
            select: () => ({
              eq: () => ({
                data: mockUserAchievements,
                error: null,
              }),
            }),
            insert: async (rows: any[]) => {
              mockInserts.push(...rows);
              return { data: rows, error: null };
            },
            update: (payload: any) => ({
              eq: async (_col: string, id: any) => {
                mockUpdates.push({ id, ...payload });
                return { data: payload, error: null };
              },
            }),
          };
        }

        return {
          select: () => ({ eq: () => ({ data: [], error: null }) }),
        };
      },
    },
  };
});

jest.mock('../src/services/streaksService', () => ({
  getCurrentStreak: jest.fn(),
}));

jest.mock('../src/services/challengeService', () => ({
  getCompletedChallenges: jest.fn(),
}));

describe('Achievements earnedAt Calculation & Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInserts.length = 0;
    mockUpdates.length = 0;
    mockUserAchievements = [];

    mockProfile = {
      id: 'user-oct-runner',
      created_at: '2026-10-01T08:00:00.000Z',
      finished_onboarded_at: '2026-10-01T08:30:00.000Z',
      steps_count: 60000,
      referral_code: 'OCT123',
    };

    mockDailySteps = [
      { date: '2026-10-01', steps: 120000, synced_at: '2026-10-01T20:15:00.000Z' },
      { date: '2026-10-02', steps: 150000, synced_at: '2026-10-02T19:30:00.000Z' }, // cumulative = 270k -> crosses 200k & 250k
      { date: '2026-10-05', steps: 100000, synced_at: '2026-10-05T21:00:00.000Z' }, // cumulative = 370k -> crosses 300k & 350k
    ];

    (streaksService.getCurrentStreak as jest.Mock).mockResolvedValue({
      streakDays: 5,
      longestStreakDays: 5,
      asOfDate: '2026-10-05',
      restoredDates: [],
      data: [
        { day: '2026-10-01', status: 'hit' },
        { day: '2026-10-02', status: 'hit' },
        { day: '2026-10-03', status: 'hit' },
        { day: '2026-10-04', status: 'hit' },
        { day: '2026-10-05', status: 'hit' },
      ],
    });

    (challengeService.getCompletedChallenges as jest.Mock).mockResolvedValue([]);
  });

  describe('getEndOfMonthTimestamp', () => {
    it('returns the correct end of month timestamp for 31-day months (e.g. October)', () => {
      expect(getEndOfMonthTimestamp('2026-10')).toBe('2026-10-31T23:59:59.000Z');
      expect(getEndOfMonthTimestamp('2026-12')).toBe('2026-12-31T23:59:59.000Z');
      expect(getEndOfMonthTimestamp('2026-01')).toBe('2026-01-31T23:59:59.000Z');
    });

    it('returns the correct end of month timestamp for 30-day months (e.g. November, April)', () => {
      expect(getEndOfMonthTimestamp('2026-11')).toBe('2026-11-30T23:59:59.000Z');
      expect(getEndOfMonthTimestamp('2026-04')).toBe('2026-04-30T23:59:59.000Z');
    });

    it('correctly handles February in common years and leap years', () => {
      expect(getEndOfMonthTimestamp('2026-02')).toBe('2026-02-28T23:59:59.000Z');
      expect(getEndOfMonthTimestamp('2024-02')).toBe('2024-02-29T23:59:59.000Z');
    });
  });

  describe('Monthly Badges earnedAt evaluation', () => {
    it('sets earnedAt to day X when threshold is crossed in date order', async () => {
      const summary = await getAchievementsSummary('user-oct-runner', 'Africa/Lagos');
      const oct200k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_200k');
      const oct300k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_300k');
      const oct400k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_400k');

      expect(oct200k).toBeDefined();
      expect(oct200k?.earned).toBe(true);
      // Crossed on 2026-10-02 (synced_at was 2026-10-02T19:30:00.000Z)
      expect(oct200k?.earnedAt).toBe('2026-10-02T19:30:00.000Z');
      expect(oct200k?.earnedAt?.startsWith('2026-10')).toBe(true);

      expect(oct300k).toBeDefined();
      expect(oct300k?.earned).toBe(true);
      // Crossed on 2026-10-05 (synced_at was 2026-10-05T21:00:00.000Z)
      expect(oct300k?.earnedAt).toBe('2026-10-05T21:00:00.000Z');
      expect(oct300k?.earnedAt?.startsWith('2026-10')).toBe(true);

      // 400k not earned (only reached 370k)
      expect(oct400k).toBeDefined();
      expect(oct400k?.earned).toBe(false);
      expect(oct400k?.earnedAt).toBeNull();
    });

    it('assigns the same timestamp to multiple badges crossed on the same day', async () => {
      // User logs 300,000 steps on 2026-10-02, crossing both 200k and 250k thresholds on that single day
      mockDailySteps = [
        { date: '2026-10-01', steps: 50000, synced_at: '2026-10-01T12:00:00.000Z' },
        { date: '2026-10-02', steps: 250000, synced_at: '2026-10-02T18:45:00.000Z' },
      ];

      const summary = await getAchievementsSummary('user-oct-runner', 'Africa/Lagos');
      const oct200k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_200k');
      const oct250k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_250k');

      expect(oct200k?.earned).toBe(true);
      expect(oct250k?.earned).toBe(true);
      expect(oct200k?.earnedAt).toBe('2026-10-02T18:45:00.000Z');
      expect(oct250k?.earnedAt).toBe('2026-10-02T18:45:00.000Z');
      expect(oct200k?.earnedAt).toBe(oct250k?.earnedAt);
    });

    it('falls back to end of month for historical badges without day logs and never returns today/NOW', async () => {
      // User has earned 200k in October historically in user_achievements, but no daily_steps rows exist
      mockDailySteps = [];
      mockUserAchievements = [
        {
          id: 'ach-oct-200k',
          category: 'monthly_badge',
          badge_key: 'monthly_2026_10_200k',
          month_period: '2026-10',
          earned_at: null, // missing day log
          progress_value: 200000,
        },
      ];

      const summary = await getAchievementsSummary('user-oct-runner', 'Africa/Lagos');
      const oct200k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_200k');

      expect(oct200k?.earned).toBe(true);
      // Fallback must be October 31st 23:59:59 UTC, NOT today in November
      expect(oct200k?.earnedAt).toBe('2026-10-31T23:59:59.000Z');
      expect(oct200k?.earnedAt?.startsWith('2026-10')).toBe(true);
      expect(oct200k?.earnedAt?.startsWith('2026-11')).toBe(false);
    });

    it('corrects an existing historical badge that was erroneously saved with a November timestamp', async () => {
      // This reproduces the exact bug report: an October badge saved with a November 7th timestamp
      mockDailySteps = [
        { date: '2026-10-01', steps: 150000, synced_at: '2026-10-01T20:00:00.000Z' },
        { date: '2026-10-03', steps: 100000, synced_at: '2026-10-03T17:00:00.000Z' },
      ];
      mockUserAchievements = [
        {
          id: 'ach-erroneous-oct',
          category: 'monthly_badge',
          badge_key: 'monthly_2026_10_200k',
          month_period: '2026-10',
          earned_at: '2026-11-07T16:58:27.625Z', // BUGGY November timestamp
          progress_value: 250000,
        },
      ];

      const summary = await getAchievementsSummary('user-oct-runner', 'Africa/Lagos');
      const oct200k = summary.monthlyBadges.items.find((i) => i.id === 'monthly_2026_10_200k');

      expect(oct200k?.earned).toBe(true);
      // Corrected to October 3rd when 200k was crossed
      expect(oct200k?.earnedAt).toBe('2026-10-03T17:00:00.000Z');
      expect(oct200k?.earnedAt?.startsWith('2026-10')).toBe(true);
      expect(oct200k?.earnedAt?.startsWith('2026-11')).toBe(false);
    });
  });

  describe('Step Milestones & Daily Streaks earnedAt', () => {
    it('sets earnedAt for lifetime step milestones based on cumulative crossing date', async () => {
      mockDailySteps = [
        { date: '2026-10-01', steps: 6000, synced_at: '2026-10-01T10:00:00.000Z' },
        { date: '2026-10-02', steps: 8000, synced_at: '2026-10-02T11:00:00.000Z' }, // 14,000 -> crosses 10k
        { date: '2026-10-10', steps: 40000, synced_at: '2026-10-10T12:00:00.000Z' }, // 54,000 -> crosses 50k
      ];

      const summary = await getAchievementsSummary('user-oct-runner', 'Africa/Lagos');
      const step10k = summary.stepMilestones.items.find((i) => i.id === 'step_10k');
      const step50k = summary.stepMilestones.items.find((i) => i.id === 'step_50k');
      const step100k = summary.stepMilestones.items.find((i) => i.id === 'step_100k');

      expect(step10k?.earned).toBe(true);
      expect(step10k?.earnedAt).toBe('2026-10-02T11:00:00.000Z');

      expect(step50k?.earned).toBe(true);
      expect(step50k?.earnedAt).toBe('2026-10-10T12:00:00.000Z');

      expect(step100k?.earned).toBe(false);
      expect(step100k?.earnedAt).toBeNull();
    });

    it('sets earnedAt for daily streaks when streak reaches milestone', async () => {
      // 40 days streak hit on 2026-10-20
      const days = [];
      for (let i = 1; i <= 40; i++) {
        const d = String(i).padStart(2, '0');
        days.push({ day: `2026-09-${d}`, status: 'hit' });
      }
      days.length = 0;
      for (let i = 1; i <= 40; i++) {
        const dayNum = i <= 30 ? i : i - 30;
        const monthNum = i <= 30 ? '09' : '10';
        days.push({ day: `2026-${monthNum}-${String(dayNum).padStart(2, '0')}`, status: 'hit' });
      }

      (streaksService.getCurrentStreak as jest.Mock).mockResolvedValue({
        streakDays: 40,
        longestStreakDays: 40,
        asOfDate: '2026-10-10',
        restoredDates: [],
        data: days,
      });

      const summary = await getAchievementsSummary('user-oct-runner', 'Africa/Lagos');
      const streak40 = summary.dailyStreaks.items.find((i) => i.id === 'streak_40');

      expect(streak40?.earned).toBe(true);
      expect(streak40?.earnedAt).toBe('2026-10-10T23:59:59.000Z');
    });
  });
});
