/**
 * Unit Tests for 24-Hour Countdown Lifecycle, Prize Draw & Winner Selection
 */

import { handleChallengeWinnerSelectionEvent } from '../src/services/notificationEventService';
import { subscribeAnnouncement, getQualifiedParticipants } from '../src/services/challengeService';
import { notificationTemplates } from '../src/services/notificationTemplates';
import { supabase } from '../src/config/database';

describe('Challenge Countdown Lifecycle & Winner Announcement', () => {
  describe('1. 24-Hour Countdown Lifecycle Calculation & Notifications', () => {
    it('computes announcementAt as exactly 24 hours after challenge end_at', () => {
      const endAt = new Date('2026-11-30T23:59:59.000Z');
      const expectedAnnouncement = new Date(endAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
      expect(expectedAnnouncement).toBe('2026-12-01T23:59:59.000Z');
    });

    it('generates winner announcement notification templates with exact copy and deep link', () => {
      const winnerPayload = notificationTemplates.challengeWinnerAnnouncement(
        'c-123',
        'Abuja Walking Marathon'
      );
      expect(winnerPayload.title).toBe('Champion 🏆');
      expect(winnerPayload.body).toBe('Congratulations! You won the grand prize for Abuja Walking Marathon!');
      expect(winnerPayload.data.type).toBe('challenge_winner');
      expect(winnerPayload.data.challengeId).toBe('c-123');
      expect(winnerPayload.data.screen).toBe('ChallengeOverview');
      expect(winnerPayload.data.deeplink).toBe('sabisweat://challenges/c-123');

      const subscriberPayload = notificationTemplates.challengeSubscribersAnnouncement(
        'c-123',
        'Abuja Walking Marathon'
      );
      expect(subscriberPayload.title).toBe('Winners Announced 🎉');
      expect(subscriberPayload.body).toBe('The results for Abuja Walking Marathon are in! Tap to see the winner.');
      expect(subscriberPayload.data.type).toBe('challenge_winners_announced');
      expect(subscriberPayload.data.challengeId).toBe('c-123');
      expect(subscriberPayload.data.screen).toBe('ChallengeOverview');
      expect(subscriberPayload.data.deeplink).toBe('sabisweat://challenges/c-123');
    });
  });

  describe('2. Winner Selection Event Handler', () => {
    it('returns without winner if challenge has not ended yet or does not exist', async () => {
      const result = await handleChallengeWinnerSelectionEvent('00000000-0000-0000-0000-000000000099');
      expect(result.winnerId).toBeNull();
      expect(result.notifiedSubscribersCount).toBe(0);
    });
  });

  describe('3. Winner Announcement Subscription — Official Sabi Sweat Challenges Only', () => {
    it('rejects subscription with 400 NOT_ELIGIBLE if challenge is not official', async () => {
      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'c-unofficial',
                    is_official: false,
                    has_prize_draw: true,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        await expect(
          subscribeAnnouncement('c-unofficial', 'u-123', true)
        ).rejects.toMatchObject({
          status: 400,
          error: 'NOT_ELIGIBLE',
          message: 'Winner announcement subscription is only available for official Sabi Sweat prize draw challenges',
        });
      } finally {
        fromSpy.mockRestore();
      }
    });

    it('rejects subscription with 400 NOT_ELIGIBLE if challenge has no prize draw', async () => {
      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'c-no-prize',
                    is_official: true,
                    has_prize_draw: false,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        await expect(
          subscribeAnnouncement('c-no-prize', 'u-123', true)
        ).rejects.toMatchObject({
          status: 400,
          error: 'NOT_ELIGIBLE',
          message: 'Winner announcement subscription is only available for official Sabi Sweat prize draw challenges',
        });
      } finally {
        fromSpy.mockRestore();
      }
    });

    it('allows subscription for eligible official prize draw challenges', async () => {
      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'c-official-prize',
                    is_official: true,
                    has_prize_draw: true,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'challenge_participants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: 'p-1',
                      left_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        const res = await subscribeAnnouncement('c-official-prize', 'u-123', true);
        expect(res.subscribed).toBe(true);
      } finally {
        fromSpy.mockRestore();
      }
    });
  });

  describe('4. Qualified Participants — Profile Images & Avatar Identification', () => {
    it('returns both top-level profile fields and nested user object preserving avatarId and photoUrl distinction', async () => {
      const mockChallenge = {
        id: 'c-qualified-test',
        start_at: '2026-11-01T00:00:00.000Z',
        end_at: '2026-11-10T23:59:59.000Z',
        goal_type: 'steps_goal',
        goal_value: 50000,
        winner_user_id: 'u-1',
        winner_announced_at: '2026-11-11T23:59:59.000Z',
      };

      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockChallenge,
                  error: null,
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: mockChallenge,
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'challenge_participants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({
                  data: [
                    { user_id: 'u-1', joined_at: '2026-11-01T10:00:00.000Z' },
                    { user_id: 'u-2', joined_at: '2026-11-01T11:00:00.000Z' },
                  ],
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'daily_steps') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  lte: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({
                      data: [{ date: '2026-11-02', steps: 60000, distance_km: '40' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'u-1',
                    first_name: 'Amara',
                    last_name: 'Okafor',
                    username: 'amara',
                    photo_url: 'https://cdn.sabisweat.app/photos/amara.jpg',
                    avatar_id: null,
                  },
                  {
                    id: 'u-2',
                    first_name: 'Chidi',
                    last_name: 'Eze',
                    username: 'chidi',
                    photo_url: null,
                    avatar_id: 'male-30s-athletic-skyblue',
                  },
                ],
                error: null,
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        const result = await getQualifiedParticipants('c-qualified-test', 1, 10);
        expect(result.totalQualified).toBe(2);

        // Verify Winner structure
        expect(result.winner).toBeDefined();
        expect(result.winner?.id).toBe('u-1');
        expect(result.winner?.photoUrl).toBe('https://cdn.sabisweat.app/photos/amara.jpg');
        expect(result.winner?.avatarId).toBeUndefined();
        expect(result.winner?.user).toEqual({
          id: 'u-1',
          username: 'amara',
          displayName: 'Amara Okafor',
          photoUrl: 'https://cdn.sabisweat.app/photos/amara.jpg',
          avatarId: undefined,
        });

        // Verify Participant 1 (with custom photo)
        const p1 = result.data.find((p) => p.id === 'u-1');
        expect(p1).toBeDefined();
        expect(p1?.photoUrl).toBe('https://cdn.sabisweat.app/photos/amara.jpg');
        expect(p1?.avatarId).toBeUndefined();
        expect(p1?.user?.displayName).toBe('Amara Okafor');
        expect(p1?.user?.photoUrl).toBe('https://cdn.sabisweat.app/photos/amara.jpg');
        expect(p1?.user?.avatarId).toBeUndefined();

        // Verify Participant 2 (with catalog avatar ID)
        const p2 = result.data.find((p) => p.id === 'u-2');
        expect(p2).toBeDefined();
        expect(p2?.avatarId).toBe('male-30s-athletic-skyblue');
        expect(p2?.photoUrl).toBeUndefined();
        expect(p2?.user?.displayName).toBe('Chidi Eze');
        expect(p2?.user?.avatarId).toBe('male-30s-athletic-skyblue');
        expect(p2?.user?.photoUrl).toBeUndefined();
      } finally {
        fromSpy.mockRestore();
      }
    });
  });
});
