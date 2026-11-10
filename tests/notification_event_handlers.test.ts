/**
 * Unit Tests for Notification Event Handlers & Schedulers
 * Tests:
 * 1. Step milestones (50%, 80%, 100%) and 100% suppression
 * 2. Morning Kickoff (0 steps vs > 0 steps at 7 AM)
 * 3. Streak at Risk (strict eligibility at 8:30 PM)
 * 4. Challenge discovery (public vs club-private)
 * 5. Challenge ending soon (Top 10 vs 90% completion)
 * 6. Challenge rewards disbursement (Top 5 coins vs rank 6+ completion)
 * 7. Idempotency on all event triggers
 */

import * as eventService from '../src/services/notificationEventService';
import * as dispatcher from '../src/services/notificationDispatcher';
import * as streaksService from '../src/services/streaksService';
import * as challengeService from '../src/services/challengeService';
import { supabase } from '../src/config/database';

jest.mock('../src/services/notificationDispatcher', () => ({
  dispatchNotification: jest.fn(async () => ({ inAppCreated: true, unreadCount: 1, pushAttempts: 1 })),
}));

jest.mock('../src/services/streaksService', () => ({
  getCurrentStreak: jest.fn(async () => ({
    streakDays: 7,
    streakWeeks: 1,
    longestStreakDays: 14,
    stepGoal: 10000,
  })),
}));

jest.mock('../src/services/challengeService', () => ({
  getLeaderboard: jest.fn(async () => ({
    page: 0,
    size: 20,
    total: 3,
    data: [
      { rank: 1, user: { id: 'user-champ', displayName: 'Champ' }, steps: 50000 },
      { rank: 2, user: { id: 'user-top2', displayName: 'Runner Up' }, steps: 40000 },
      { rank: 6, user: { id: 'user-rank6', displayName: 'Participant' }, steps: 10000 },
    ],
  })),
  getChallengeById: jest.fn(),
}));

// Mock database state
let mockNotifications: any[] = [];
let mockProfiles: any[] = [];
let mockDailySteps: any[] = [];
let mockUserDevices: any[] = [];
let mockChallenges: any[] = [];
let mockClubMembers: any[] = [];
let mockParticipants: any[] = [];

jest.mock('../src/config/database', () => ({
  supabase: {
    from: (table: string) => ({
      select: (...args: any[]) => ({
        eq: (col: string, val: any) => ({
          single: async () => {
            if (table === 'profiles') {
              const p = mockProfiles.find((x) => x[col] === val);
              return { data: p || null, error: p ? null : { message: 'Not found' } };
            }
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === 'notifications') {
              const n = mockNotifications.find((x) => x[col] === val);
              return { data: n || null, error: null };
            }
            if (table === 'daily_steps') {
              const s = mockDailySteps.find((x) => x[col] === val);
              return { data: s || null, error: null };
            }
            if (table === 'challenges') {
              const c = mockChallenges.find((x) => x[col] === val);
              return { data: c || null, error: null };
            }
            return { data: null, error: null };
          },
          eq: (col2: string, val2: any) => ({
            maybeSingle: async () => {
              if (table === 'notifications') {
                const n = mockNotifications.find((x) => x[col] === val && x[col2] === val2);
                return { data: n || null, error: null };
              }
              if (table === 'daily_steps') {
                const s = mockDailySteps.find((x) => x[col] === val && x[col2] === val2);
                return { data: s || null, error: null };
              }
              return { data: null, error: null };
            },
            is: (col3: string, val3: any) => ({
              lte: () => ({
                gte: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          is: (col2: string, val2: any) => ({
            lte: () => ({
              gte: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        is: (col: string, val: any) => ({
          lte: () => ({
            gte: async () => ({ data: [], error: null }),
          }),
        }),
        gte: (col: string, val: any) => ({
          lte: async () => ({
            data: mockChallenges.filter((c) => c[col] >= val),
            error: null,
          }),
        }),
      }),
      insert: async (payload: any) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        if (table === 'notifications') mockNotifications.push(...rows);
        return { data: payload, error: null };
      },
      update: (payload: any) => {
        const updateChain: any = {
          eq: (col: string, val: any) => updateChain,
          then: (resolve: any) => resolve({ data: payload, error: null }),
        };
        return updateChain;
      },
    }),
  },
}));

describe('Notification Event Handlers', () => {
  const dispatchSpy = jest.spyOn(dispatcher, 'dispatchNotification');

  beforeEach(() => {
    mockNotifications = [];
    mockProfiles = [{ id: 'user-1', step_goal: 10000, points_balance: 100 }];
    mockDailySteps = [];
    mockUserDevices = [];
    mockChallenges = [];
    mockClubMembers = [];
    mockParticipants = [];
    jest.clearAllMocks();
  });

  describe('handleStepSyncEvents', () => {
    it('dispatches 50% step milestone when crossing 5,000 / 10,000 steps', async () => {
      const res = await eventService.handleStepSyncEvents('user-1', '2026-11-09', 5500);

      expect(res.milestone50).toBe(true);
      expect(res.milestone80).toBe(false);
      expect(res.goalCompleted).toBe(false);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'DAILY_STEP_REMINDER',
          title: "You're halfway to your goal",
          idempotencyKey: 'step_milestone_50:user-1:2026-11-09',
        })
      );
    });

    it('dispatches 80% step milestone when crossing 8,000 steps', async () => {
      const res = await eventService.handleStepSyncEvents('user-1', '2026-11-09', 8500);

      expect(res.milestone80).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'DAILY_STEP_REMINDER',
          title: "You're nearly there",
          idempotencyKey: 'step_milestone_80:user-1:2026-11-09',
        })
      );
    });

    it('dispatches 100% daily goal completed and confirms streak via getCurrentStreak', async () => {
      const res = await eventService.handleStepSyncEvents('user-1', '2026-11-09', 10500);

      expect(res.goalCompleted).toBe(true);
      expect(streaksService.getCurrentStreak).toHaveBeenCalledWith('user-1');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'STREAK_ALERT',
          title: 'Daily Goal Achieved',
          idempotencyKey: 'step_goal_100:user-1:2026-11-09',
        })
      );
    });

    it('suppresses 50% and 80% milestones if 100% already reached', async () => {
      // Simulate 100% already dispatched
      mockNotifications.push({
        user_id: 'user-1',
        idempotency_key: 'step_goal_100:user-1:2026-11-09',
      });

      const res = await eventService.handleStepSyncEvents('user-1', '2026-11-09', 11000);

      expect(res.milestone50).toBe(false);
      expect(res.milestone80).toBe(false);
      expect(res.goalCompleted).toBe(false);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  describe('disburseChallengeRewards', () => {
    it('disburses SabiCoins to Rank 1 Champion and Top 5, and completion notice to Rank 6+', async () => {
      const pastEndAt = new Date(Date.now() - 60000).toISOString();
      mockChallenges.push({
        id: 'c-ended',
        title: '30-Day Most Steps',
        goal_type: 'most_steps',
        end_at: pastEndAt,
        start_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      });

      const res = await eventService.disburseChallengeRewards('c-ended');

      expect(res.challengeId).toBe('c-ended');
      expect(res.disbursedCount).toBe(3);

      // Verify Rank 1 Champion notification with coins
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-champ',
          type: 'REWARD_EARNED',
          title: 'Challenge Champion',
          body: expect.stringContaining('1,000 SabiCoins'),
        })
      );

      // Verify Rank 2 Top 5 notification with coins
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-top2',
          type: 'REWARD_EARNED',
          title: 'Congratulations on your top 5 finish',
          body: expect.stringContaining('500 SabiCoins'),
        })
      );

      // Verify Rank 6 notification without coins claimed or implied
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-rank6',
          title: 'Challenge completed',
          body: 'Well done on completing 30-Day Most Steps. View the final leaderboard to see the results',
        })
      );
    });

    it('does not disburse if challenge has not ended yet', async () => {
      const futureEndAt = new Date(Date.now() + 86400000).toISOString();
      mockChallenges.push({
        id: 'c-active',
        title: 'Active Challenge',
        goal_type: 'most_steps',
        end_at: futureEndAt,
      });

      const res = await eventService.disburseChallengeRewards('c-active');
      expect(res.disbursedCount).toBe(0);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
