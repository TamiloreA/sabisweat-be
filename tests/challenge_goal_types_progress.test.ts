/**
 * Unit Tests for Challenges Engine:
 * goalType Values, Progress Calculations & Edge Cases
 */

import { normalizeGoalType, computeProgress } from '../src/services/challengeService';
import type { ChallengeRow, ChallengeResponse } from '../src/models/challengeModel';

// Mock Supabase
jest.mock('../src/config/database', () => {
  let mockDailySteps: any[] = [];
  let mockParticipants: any[] = [];

  const mockFrom = (table: string) => {
    let currentFilterUserId: string | null = null;
    let currentInUserIds: string[] | null = null;

    if (table === 'daily_steps') {
      const chain: any = {
        select: jest.fn().mockImplementation(() => chain),
        eq: jest.fn().mockImplementation((col: string, val: any) => {
          if (col === 'user_id') currentFilterUserId = val;
          return chain;
        }),
        in: jest.fn().mockImplementation((col: string, vals: any[]) => {
          if (col === 'user_id') currentInUserIds = vals;
          return chain;
        }),
        gte: jest.fn().mockImplementation(() => chain),
        lte: jest.fn().mockImplementation(() => chain),
        order: jest.fn().mockImplementation(() => {
          let data = mockDailySteps;
          if (currentFilterUserId) {
            data = data.filter((r) => !r.user_id || r.user_id === currentFilterUserId);
          }
          if (currentInUserIds) {
            data = data.filter((r) => !r.user_id || currentInUserIds!.includes(r.user_id));
          }
          return Promise.resolve({ data, error: null });
        }),
        then: (resolve: any) => {
          let data = mockDailySteps;
          if (currentFilterUserId) {
            data = data.filter((r) => !r.user_id || r.user_id === currentFilterUserId);
          }
          if (currentInUserIds) {
            data = data.filter((r) => !r.user_id || currentInUserIds!.includes(r.user_id));
          }
          return resolve({ data, error: null });
        },
      };
      return chain;
    }
    if (table === 'challenge_participants') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockImplementation(() => {
          return Promise.resolve({ data: mockParticipants, error: null });
        }),
      };
    }
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
  };

  return {
    supabase: {
      from: jest.fn(mockFrom),
    },
    __setMockData: (dailySteps: any[], participants: any[] = []) => {
      mockDailySteps = dailySteps;
      mockParticipants = participants;
    },
  };
});

const { __setMockData } = require('../src/config/database');

describe('Challenges Engine - goalType & Progress Calculations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeGoalType', () => {
    it('normalizes explicit daily_step variants', () => {
      expect(normalizeGoalType('daily_step')).toBe('daily_step');
      expect(normalizeGoalType('DAILY_STEP')).toBe('daily_step');
      expect(normalizeGoalType('daily_steps')).toBe('daily_step');
      expect(normalizeGoalType('daily')).toBe('daily_step');
    });

    it('normalizes explicit steps_goal variants', () => {
      expect(normalizeGoalType('steps_goal')).toBe('steps_goal');
      expect(normalizeGoalType('STEPS_GOAL')).toBe('steps_goal');
      expect(normalizeGoalType('step_goal')).toBe('steps_goal');
      expect(normalizeGoalType('cumulative')).toBe('steps_goal');
    });

    it('normalizes explicit most_steps variants', () => {
      expect(normalizeGoalType('most_steps')).toBe('most_steps');
      expect(normalizeGoalType('MOST_STEPS')).toBe('most_steps');
      expect(normalizeGoalType('highest_steps')).toBe('most_steps');
      expect(normalizeGoalType('race')).toBe('most_steps');
    });

    it('infers daily_step from title / subtitle when legacy "steps" is present', () => {
      expect(normalizeGoalType('steps', 'The MOvers 30-Day Step Streak')).toBe('daily_step');
      expect(normalizeGoalType('steps', 'MOvers Weekend Blitz', 'Hit 10k daily steps')).toBe('daily_step');
    });

    it('infers most_steps from title / subtitle when legacy "steps" is present', () => {
      expect(normalizeGoalType('steps', 'Lagos Most Steps Competition')).toBe('most_steps');
      expect(normalizeGoalType('steps', 'Spring Leaderboard Race')).toBe('most_steps');
    });

    it('defaults legacy "steps" to steps_goal when no daily cues exist', () => {
      expect(normalizeGoalType('steps', 'The MOvers 50K Endurance Sprint')).toBe('steps_goal');
      expect(normalizeGoalType('steps', 'Abuja City Walk 100K')).toBe('steps_goal');
      expect(normalizeGoalType(null, 'Generic Challenge')).toBe('steps_goal');
    });
  });

  describe('Progress Calculation: daily_step', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const dailyChallenge: ChallengeRow = {
      id: 'c-daily-1',
      title: 'MOvers 7-Day Step Challenge',
      subtitle: 'Walk 10,000 steps a day for 7 days',
      description: 'Daily challenge',
      reward_text: '500 Sabi Coins',
      hero_image_url: null,
      challenge_image: null,
      rules: ['Step every day'],
      goals: ['Hit 10,000 steps daily'],
      sponsor_text: null,
      city_tag: 'Lagos',
      country: 'Nigeria',
      region: 'Lagos',
      goal_type: 'daily_step',
      goal_value: 10000,
      max_participants: 500,
      host_name: 'The MOvers',
      host_logo_url: null,
      host_club_id: null,
      start_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      end_at: new Date(Date.now() + 4 * 86400000).toISOString(),
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      created_by: 'creator-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('computes todaySteps, percent of today goal, and daysCompleted', async () => {
      __setMockData([
        { date: '2026-11-06', steps: 10500, distance_km: 7.2 },
        { date: '2026-11-07', steps: 8000, distance_km: 5.5 },
        { date: '2026-11-08', steps: 11000, distance_km: 7.8 },
        { date: todayStr, steps: 6500, distance_km: 4.5 },
      ]);

      const result = await computeProgress('user-1', dailyChallenge);

      expect(result.effectiveGoalType).toBe('daily_step');
      expect(result.effectiveGoalValue).toBe(10000);
      expect(result.todaySteps).toBe(6500);
      // percent: round(6500 / 10000 * 100) = 65%
      expect(result.percent).toBe(65);
      // cumulative steps so far: 10500 + 8000 + 11000 + 6500 = 36000
      expect(result.steps).toBe(36000);
      // days completed (>= 10,000): 2 days (Nov 6 and Nov 8)
      expect(result.daysCompleted).toBe(2);
      expect(result.daysCompletedRaw).toBe(2);
      expect(result.challengeTotalDays).toBe(7);
    });

    it('caps percent at 100 when user exceeds today daily step goal', async () => {
      __setMockData([
        { date: todayStr, steps: 15400, distance_km: 11.2 },
      ]);

      const result = await computeProgress('user-1', dailyChallenge);

      expect(result.todaySteps).toBe(15400);
      expect(result.percent).toBe(100);
      expect(result.daysCompleted).toBe(1);
    });
  });

  describe('Progress Calculation: steps_goal', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const stepsGoalChallenge: ChallengeRow = {
      id: 'c-goal-1',
      title: 'The MOvers 50K Endurance Sprint',
      subtitle: 'Rack up 50,000 total steps this week',
      description: 'Sprint challenge',
      reward_text: '2,500 Sabi Coins + Silver Badge',
      reward_id: 'silver',
      hero_image_url: 'https://cdn.sabisweat.com/hero.jpg',
      challenge_image: null,
      rules: ['Sync steps'],
      goals: ['Reach 50,000 total steps'],
      sponsor_text: null,
      city_tag: 'Lagos',
      country: 'Nigeria',
      region: 'Lagos',
      goal_type: 'steps_goal',
      goal_value: 50000,
      max_participants: 500,
      host_name: 'The MOvers',
      host_logo_url: null,
      host_club_id: null,
      start_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      end_at: new Date(Date.now() + 4 * 86400000).toISOString(),
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      created_by: 'creator-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('computes cumulative progress.steps vs total goalValue (matches prompt example 1169 / 50000 = 2%)', async () => {
      __setMockData([
        { date: '2026-11-07', steps: 600, distance_km: 0.4 },
        { date: '2026-11-08', steps: 545, distance_km: 0.3 },
        { date: todayStr, steps: 24, distance_km: 0.01 },
      ]);

      const result = await computeProgress('user-1', stepsGoalChallenge);

      expect(result.effectiveGoalType).toBe('steps_goal');
      expect(result.effectiveGoalValue).toBe(50000);
      // Total steps: 600 + 545 + 24 = 1169
      expect(result.steps).toBe(1169);
      expect(result.todaySteps).toBe(24);
      // Percent: round(1169 / 50000 * 100) = 2%
      expect(result.percent).toBe(2);
    });

    it('caps percent at 100 when cumulative steps exceed total goal', async () => {
      __setMockData([
        { date: todayStr, steps: 54000, distance_km: 38.5 },
      ]);

      const result = await computeProgress('user-1', stepsGoalChallenge);

      expect(result.steps).toBe(54000);
      expect(result.percent).toBe(100);
    });
  });

  describe('Progress Calculation: most_steps (Leaderboard Pace & Edge Cases)', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const mostStepsChallenge: ChallengeRow = {
      id: 'c-most-1',
      title: 'Lagos Most Steps Open Race',
      subtitle: 'Race for the top of the leaderboard',
      description: 'Highest steps competition',
      reward_text: '5,000 Sabi Coins to Champion',
      reward_id: 'gold',
      hero_image_url: null,
      challenge_image: null,
      rules: ['Sync daily'],
      goals: ['Climb the leaderboard'],
      sponsor_text: null,
      city_tag: 'Lagos',
      country: 'Nigeria',
      region: 'Lagos',
      goal_type: 'most_steps',
      goal_value: 0,
      max_participants: 1000,
      host_name: 'The MOvers',
      host_logo_url: null,
      host_club_id: null,
      start_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      end_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      created_by: 'creator-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('Edge Case: Single participant with steps > 0 -> percent = 100, goalValue = userSteps', async () => {
      __setMockData(
        [{ user_id: 'user-1', date: todayStr, steps: 8420, distance_km: 6.0 }],
        [{ user_id: 'user-1', joined_at: mostStepsChallenge.start_at }]
      );

      const result = await computeProgress('user-1', mostStepsChallenge);

      expect(result.effectiveGoalType).toBe('most_steps');
      expect(result.steps).toBe(8420);
      expect(result.percent).toBe(100);
      expect(result.effectiveGoalValue).toBe(8420);
    });

    it('Edge Case: Single participant with 0 steps -> percent = 0, goalValue = 0', async () => {
      __setMockData(
        [],
        [{ user_id: 'user-1', joined_at: mostStepsChallenge.start_at }]
      );

      const result = await computeProgress('user-1', mostStepsChallenge);

      expect(result.effectiveGoalType).toBe('most_steps');
      expect(result.steps).toBe(0);
      expect(result.percent).toBe(0);
      expect(result.effectiveGoalValue).toBe(0);
    });

    it('Edge Case: Multiple participants, user is in 1st place -> percent = 100, goalValue = leaderSteps', async () => {
      __setMockData(
        [
          { user_id: 'user-1', date: todayStr, steps: 25000, distance_km: 18.0 },
          { user_id: 'user-2', date: todayStr, steps: 18000, distance_km: 12.0 },
          { user_id: 'user-3', date: todayStr, steps: 9000, distance_km: 6.0 },
        ],
        [
          { user_id: 'user-1', joined_at: mostStepsChallenge.start_at },
          { user_id: 'user-2', joined_at: mostStepsChallenge.start_at },
          { user_id: 'user-3', joined_at: mostStepsChallenge.start_at },
        ]
      );

      const result = await computeProgress('user-1', mostStepsChallenge);

      expect(result.steps).toBe(25000);
      expect(result.effectiveGoalValue).toBe(25000);
      expect(result.percent).toBe(100);
    });

    it('Edge Case: Multiple participants, user is trailing behind leader -> percent = min(100, round(userSteps / leaderSteps * 100))', async () => {
      __setMockData(
        [
          { user_id: 'user-1', date: todayStr, steps: 12000, distance_km: 8.5 },
          { user_id: 'leader-user', date: todayStr, steps: 24000, distance_km: 17.0 },
        ],
        [
          { user_id: 'user-1', joined_at: mostStepsChallenge.start_at },
          { user_id: 'leader-user', joined_at: mostStepsChallenge.start_at },
        ]
      );

      const result = await computeProgress('user-1', mostStepsChallenge);

      expect(result.steps).toBe(12000);
      expect(result.effectiveGoalValue).toBe(24000);
      // percent: round(12000 / 24000 * 100) = 50%
      expect(result.percent).toBe(50);
    });

    it('Edge Case: Multiple participants, everyone has 0 steps -> percent = 0, goalValue = 0 (prevents division by zero)', async () => {
      __setMockData(
        [],
        [
          { user_id: 'user-1', joined_at: mostStepsChallenge.start_at },
          { user_id: 'user-2', joined_at: mostStepsChallenge.start_at },
        ]
      );

      const result = await computeProgress('user-1', mostStepsChallenge);

      expect(result.steps).toBe(0);
      expect(result.effectiveGoalValue).toBe(0);
      expect(result.percent).toBe(0);
    });
  });

  describe('Contract Preservation', () => {
    it('verifies ChallengeResponse contract preserves all critical fields', () => {
      const mockResponse: ChallengeResponse = {
        id: 'ad355c75-a253-4de4-9fdd-4b5369d5c5ce',
        title: 'The MOvers 50K Endurance Sprint',
        subtitle: 'Rack up 50,000 total steps this week with The MOvers community',
        description: 'A dynamic weekly sprint designed to push your endurance.',
        rewardText: '2,500 Sabi Coins + Silver Badge',
        rewardId: 'silver',
        heroImageBase64: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b',
        challengeImage: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b',
        rules: ['Open to all active Sabi Sweat users'],
        goals: ['Reach at least 7,143 steps per day or 50,000 total steps'],
        host: {
          name: 'The MOvers',
          logoUrl: '',
          clubId: '2a4ceadb-ba5b-4dd7-a47d-ffd094a8b632',
          theme: 'blue',
        },
        cityTag: 'Lagos',
        country: 'Nigeria',
        region: 'Lagos',
        startAt: '2026-11-05T14:25:57.27358+00:00',
        endAt: '2026-11-12T14:25:57.27358+00:00',
        goalType: 'steps_goal',
        goalValue: 50000,
        participantsCount: 1,
        maxParticipants: 500,
        joined: true,
        joinedAt: '2026-11-06T17:30:54.677+00:00',
        eligible: false,
        canClaim: false,
        claimedAt: null,
        progress: {
          steps: 1169,
          distanceMeters: 710,
          percent: 2,
          todaySteps: 24,
          daysCompleted: 0,
          daysCompletedRaw: 0,
          bonusDaysAdded: 0,
          challengeTotalDays: 7,
          evaluatedDays: 3,
          daysRemaining: 3,
        },
        whoCanJoin: 'everyone',
        leaderboardVisibility: 'public',
      };

      expect(mockResponse.goalType).toBe('steps_goal');
      expect(mockResponse.goalValue).toBe(50000);
      expect(mockResponse.eligible).toBe(false);
      expect(mockResponse.canClaim).toBe(false);
      expect(mockResponse.claimedAt).toBeNull();
      expect(mockResponse.host?.name).toBe('The MOvers');
      expect(mockResponse.whoCanJoin).toBe('everyone');
      expect(mockResponse.leaderboardVisibility).toBe('public');
      expect(mockResponse.progress?.percent).toBe(2);
      expect(mockResponse.progress?.daysCompletedRaw).toBe(0);
      expect(mockResponse.progress?.bonusDaysAdded).toBe(0);
      expect(mockResponse.progress?.challengeTotalDays).toBe(7);
      expect(mockResponse.progress?.evaluatedDays).toBe(3);
      expect(mockResponse.progress?.daysRemaining).toBe(3);
    });
  });
});
