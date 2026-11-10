/**
 * Unit & Integration Tests for User Avatar & Streak Storage Image Resolution
 *
 * Requirements:
 * 1. User Avatars:
 *    - Valid avatarId resolves to correct image in avatar2 Storage bucket.
 *    - Different avatar IDs resolve to their respective images.
 *    - Missing avatar IDs are handled safely.
 *    - Unmapped avatar IDs fall back to existing profile photo (photo_url / photo_base64).
 *    - Uploaded/custom profile photos continue using their existing source.
 *    - Applicable notification events (join club request, club post, leaderboard overtake) use resolved avatar.
 *    - Post likes and comments strictly continue using post images, never user avatars.
 * 2. Streak Images:
 *    - Resolves streak events (daily_goal_completed, streak_at_risk, step_milestone_50).
 *    - Missing/unconfigured streak images safely omit the image (never generate broken 404 URLs).
 *    - Dispatches correctly without error when image is omitted.
 * 3. Notification Payload:
 *    - Payload structure and image conventions (imageUrl, richContent.image) are preserved.
 */

import {
  AVATAR_STORAGE_MAP,
  resolveAvatarIdToUrl,
  resolveUserAvatarUrl,
  resolveStreakNotificationImageUrl,
  SUPABASE_MEDIA_URL,
  AVATAR_BUCKET,
} from '../src/utils/avatarResolver';
import { notificationTemplates } from '../src/services/notificationTemplates';
import * as eventService from '../src/services/notificationEventService';
import * as dispatcher from '../src/services/notificationDispatcher';
import { supabase } from '../src/config/database';
import { PUSH_CATEGORIES } from '../src/models/notificationModel';

jest.mock('../src/services/notificationDispatcher', () => ({
  dispatchNotification: jest.fn().mockResolvedValue({
    inAppCreated: true,
    unreadCount: 1,
    pushAttempts: 1,
    pushTicketsCount: 1,
    emailSent: false,
    errors: [],
  }),
}));

describe('User Avatar & Streak Storage Image Resolver', () => {
  const dispatchSpy = dispatcher.dispatchNotification as jest.MockedFunction<typeof dispatcher.dispatchNotification>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Dictionary & URL Resolution', () => {
    it('contains all 51 mobile avatar catalogue mappings', () => {
      const keys = Object.keys(AVATAR_STORAGE_MAP);
      expect(keys.length).toBe(51);
    });

    it('resolves valid avatarId to fully qualified Supabase Storage URL', () => {
      const avatarId = 'female-teen-straightsize-sunyellow-longbraidsponytail-blacksabisweattee';
      const url = resolveAvatarIdToUrl(avatarId);

      expect(url).toBeDefined();
      expect(url).toContain('https://auth.sabisweat.com/storage/v1/object/public/avatar2/');
      expect(url).toContain('Female-Teen-StraightSize-SunYellow-LongBraidsPonytail-BlackSabiSweatTee.png');
    });

    it('properly URI-encodes filenames with spaces and special characters', () => {
      const avatarId = 'female-20s-athletic-mintgreen-highnaturalpuff-blackrunningvest';
      const url = resolveAvatarIdToUrl(avatarId);

      expect(url).toBeDefined();
      // Filename in storage: "Female-20s-Athletic-Mint green- HighNaturalPuff- BlackRunningVest.png"
      expect(url).toContain(encodeURIComponent('Female-20s-Athletic-Mint green- HighNaturalPuff- BlackRunningVest.png'));
      expect(url).not.toContain(' ');
    });

    it('resolves different avatar IDs to distinct, respective image URLs', () => {
      const id1 = 'male-30s-athletic-skyblue-buzzcutandshortbeard-deepgreensleevelesstop';
      const id2 = 'male-60s-medium-pink-greycurlyhairandmoustache-whitepoloactivewear';

      const url1 = resolveAvatarIdToUrl(id1);
      const url2 = resolveAvatarIdToUrl(id2);

      expect(url1).toBeDefined();
      expect(url2).toBeDefined();
      expect(url1).not.toBe(url2);
      expect(url1).toContain('Male-30s-Athletic-SkyBlue-BuzzCutAndShortBeard-DeepGreenSleevelessTop.png');
      expect(url2).toContain('Male-60s-Medium-Pink-GreyCurlyHairAndMoustache-WhitePoloActiveWear.png');
    });

    it('handles case-insensitivity and trimmed whitespace in avatarId', () => {
      const raw = '  Female-Teen-StraightSize-SunYellow-LongBraidsPonytail-BlackSabiSweatTee  ';
      const url = resolveAvatarIdToUrl(raw);

      expect(url).toBeDefined();
      expect(url).toContain('Female-Teen-StraightSize-SunYellow-LongBraidsPonytail-BlackSabiSweatTee.png');
    });

    it('returns undefined for non-existent or invalid avatar IDs', () => {
      expect(resolveAvatarIdToUrl('non-existent-avatar-id')).toBeUndefined();
      expect(resolveAvatarIdToUrl(null)).toBeUndefined();
      expect(resolveAvatarIdToUrl(undefined)).toBeUndefined();
      expect(resolveAvatarIdToUrl('')).toBeUndefined();
      expect(resolveAvatarIdToUrl('   ')).toBeUndefined();
    });
  });

  describe('2. User Avatar Fallback Hierarchy', () => {
    it('prioritizes predefined avatar_id over uploaded photo_url', () => {
      const profile = {
        avatar_id: 'male-20s-muscular-sunyellow-closecroppedcurlyhair-sleevelessvest',
        photo_url: 'https://cdn.example.com/custom-photo.jpg',
      };

      const resolved = resolveUserAvatarUrl(profile);
      expect(resolved).toBeDefined();
      expect(resolved).toContain('Male-20s-Muscular-SunYellow-CloseCroppedCurlyHair-SleevelessVest.png');
      expect(resolved).not.toContain('custom-photo.jpg');
    });

    it('falls back to photo_url if avatar_id is missing or unmapped', () => {
      const profile1 = {
        avatar_id: null,
        photo_url: 'https://cdn.example.com/custom-uploaded-photo.jpg',
      };
      expect(resolveUserAvatarUrl(profile1)).toBe('https://cdn.example.com/custom-uploaded-photo.jpg');

      const profile2 = {
        avatar_id: 'unknown-legacy-id',
        photo_url: 'https://cdn.example.com/custom-uploaded-photo.jpg',
      };
      expect(resolveUserAvatarUrl(profile2)).toBe('https://cdn.example.com/custom-uploaded-photo.jpg');
    });

    it('falls back to photo_base64 / data:image if photo_url is missing', () => {
      const profile = {
        avatar_id: null,
        photo_url: null,
        photo_base64: 'https://cdn.example.com/photo-base.jpg',
      };
      expect(resolveUserAvatarUrl(profile)).toBe('https://cdn.example.com/photo-base.jpg');
    });

    it('safely omits the image (returns undefined) when neither avatarId nor custom photo exists', () => {
      expect(resolveUserAvatarUrl(null)).toBeUndefined();
      expect(resolveUserAvatarUrl({})).toBeUndefined();
      expect(resolveUserAvatarUrl({ avatar_id: null, photo_url: null })).toBeUndefined();
      expect(resolveUserAvatarUrl({ avatar_id: '', photo_url: 'invalid-url' })).toBeUndefined();
    });
  });

  describe('3. Streak Notification Images Resolution', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns undefined (safe omit) when no streak image is configured or available', () => {
      delete process.env.CDN_STREAK_FLAME_CELEBRATION;
      delete process.env.CDN_STREAK_FLAME_URGENT;
      delete process.env.CDN_STREAK_FLAME_ACTIVE;
      delete process.env.STREAK_STORAGE_BASE_URL;

      expect(resolveStreakNotificationImageUrl('daily_goal_completed', 10)).toBeUndefined();
      expect(resolveStreakNotificationImageUrl('streak_at_risk', 5)).toBeUndefined();
      expect(resolveStreakNotificationImageUrl('step_milestone_50')).toBeUndefined();
      expect(resolveStreakNotificationImageUrl('unknown_streak_event')).toBeUndefined();
    });

    it('uses configured CDN or env URLs when available for streak events', () => {
      process.env.CDN_STREAK_FLAME_CELEBRATION = 'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-celebration.png';
      process.env.CDN_STREAK_FLAME_URGENT = 'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-urgent.png';
      process.env.CDN_STREAK_FLAME_ACTIVE = 'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-active.png';

      expect(resolveStreakNotificationImageUrl('daily_goal_completed', 7)).toBe(
        'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-celebration.png'
      );
      expect(resolveStreakNotificationImageUrl('streak_at_risk', 3)).toBe(
        'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-urgent.png'
      );
      expect(resolveStreakNotificationImageUrl('step_milestone_50')).toBe(
        'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-active.png'
      );
    });

    it('supports STREAK_STORAGE_BASE_URL override for Storage-hosted streak images', () => {
      delete process.env.CDN_STREAK_FLAME_CELEBRATION;
      process.env.STREAK_STORAGE_BASE_URL = 'https://auth.sabisweat.com/storage/v1/object/public/streaks';

      expect(resolveStreakNotificationImageUrl('daily_goal_completed')).toBe(
        'https://auth.sabisweat.com/storage/v1/object/public/streaks/daily_goal_completed.png'
      );
    });
  });

  describe('4. Notification Events Avatar Integration', () => {
    it('uses resolved avatar in handleJoinClubRequestEvent for admin notifications', async () => {
      const mockClub = {
        id: 'club-req-1',
        name: 'Ikoyi Striders',
        profile_image_url: 'https://cdn.sabisweat.app/ikoyi.png',
        created_by: 'owner-ikoyi',
      };

      const mockRequester = {
        id: 'req-user-1',
        first_name: 'Dapo',
        last_name: 'Ade',
        username: 'dapo',
        avatar_id: 'male-teen-athletic-skyblue-short-curlyfade-whitesporttee',
        photo_url: null,
      };

      const mockAdmins = [{ user_id: 'admin-1' }];

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockClub, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockRequester, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'club_members') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: mockAdmins, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'notifications') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await eventService.handleJoinClubRequestEvent('club-req-1', 'req-user-1');
      expect(res.notifiedCount).toBeGreaterThan(0);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'community_club_join_request',
          title: 'New Member Request',
          body: 'Dapo Ade requested to join Ikoyi Striders',
          imageUrl: expect.stringContaining('Male-Teen-Athletic-SkyBlue-Short-CurlyFade-WhiteSportTee.png'),
        })
      );
    });

    it('uses resolved author avatar in handleClubPostEvent', async () => {
      const mockPost = {
        id: 'post-author-test',
        club_id: 'club-post-1',
        title: 'Morning 5K',
        description: 'Great run this morning',
        images_url: [],
        author_id: 'author-101',
      };

      const mockClub = {
        id: 'club-post-1',
        name: 'Victoria Island Runners',
        profile_image_url: 'https://cdn.sabisweat.app/vi-club.png',
        created_by: 'owner-vi',
      };

      const mockAuthor = {
        id: 'author-101',
        first_name: 'Zainab',
        last_name: 'Bello',
        username: 'zainab',
        avatar_id: 'female-30s-curvy-coral-naturalcurls-activewear',
        photo_url: null,
      };

      const mockMembers = [
        { user_id: 'member-202', notification_preference: 'all_posts' },
      ];

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'posts' || table === 'community_posts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockPost, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'clubs') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockClub, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'club_members') {
          return {
            select: () => ({
              eq: () => {
                const chain: any = {
                  maybeSingle: () => Promise.resolve({ data: { role: 'member' }, error: null }),
                  eq: () => chain,
                  then: (resolve: any) => resolve({ data: mockMembers, error: null }),
                };
                return chain;
              },
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockAuthor, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'notifications') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await eventService.handleClubPostEvent('post-author-test');
      expect(res.notifiedCount).toBe(1);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'member-202',
          title: 'Morning 5K',
          body: 'Great run this morning',
          imageUrl: expect.stringContaining('Female-30s-Curvy-Coral-NaturalCurls-ActiveWear.png'),
        })
      );
    });

    it('uses resolved overtaker avatar in handleLeaderboardOvertakeEvent', async () => {
      const mockOvertaker = {
        first_name: 'Kunle',
        last_name: 'Afolabi',
        username: 'kunle',
        avatar_id: 'male-40sto50s-straightsize-coral-shortwavyhairandmoustache-activeweartop',
        photo_url: null,
      };

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'notifications') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: mockOvertaker, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      await eventService.handleLeaderboardOvertakeEvent(
        'c-overtake-1',
        'Lagos 100K Walk',
        'overtaken-user-1',
        'overtaker-user-2'
      );

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'overtaken-user-1',
          type: PUSH_CATEGORIES.CHALLENGE_UPDATE,
          title: 'Your leaderboard position has changed',
          body: 'Kunle Afolabi has moved ahead of you in Lagos 100K Walk. Check the leaderboard to see the latest standings',
          imageUrl: expect.stringContaining('Male-40sTo50s-StraightSize-Coral-ShortWavyHairAndMoustache-ActiveWearTop.png'),
        })
      );
    });

    it('strictly preserves post image for likes and NEVER falls back to user avatar', async () => {
      const mockPost = {
        id: 'post-like-test',
        author_id: 'post-owner',
        images_url: ['https://cdn.sabisweat.app/original-post-image.jpg'],
      };

      const mockLiker = {
        first_name: 'Liker',
        last_name: 'User',
        username: 'liker',
        avatar_id: 'female-60s-curvy-skyblue-shortsilverafro-whitezipupjacket',
      };

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'posts' || table === 'community_posts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockPost, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'community_likes') {
          return {
            select: () => ({
              eq: () => ({
                neq: () => ({
                  order: () => Promise.resolve({
                    data: [{ user_id: 'liker-1', created_at: '2026-11-10T12:00:00Z' }],
                    error: null,
                  }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockLiker, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'notifications') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      await eventService.handlePostLikeEvent('post-like-test', 'liker-1');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'post-owner',
          title: 'Post',
          body: 'Liker User liked your post',
          // MUST be post image, NEVER liker avatar!
          imageUrl: 'https://cdn.sabisweat.app/original-post-image.jpg',
        })
      );
    });

    it('strictly preserves post image for comments and replies', async () => {
      const mockComment = {
        id: 'comment-test-1',
        post_id: 'post-comment-target',
        user_id: 'commenter-1',
        text: 'Awesome progress!',
        parent_id: null,
      };

      const mockPost = {
        id: 'post-comment-target',
        author_id: 'target-author',
        images_url: ['https://cdn.sabisweat.app/post-banner.jpg'],
      };

      const mockCommenter = {
        first_name: 'Bisi',
        last_name: 'O',
        username: 'bisio',
        avatar_id: 'female-teen-slim-mintgreen-twobraidedpigtails-sabisweat-shirt-07',
      };

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'community_comments') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockComment, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'posts' || table === 'community_posts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockPost, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockCommenter, error: null }),
              }),
            }),
          } as any;
        }
        if (table === 'notifications') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      await eventService.handlePostCommentEvent('comment-test-1');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'target-author',
          title: 'Bisi O commented on your post',
          body: 'Awesome progress!',
          // MUST be post image, NEVER commenter avatar!
          imageUrl: 'https://cdn.sabisweat.app/post-banner.jpg',
        })
      );
    });
  });

  describe('5. Streak Notifications Payload Delivery', () => {
    it('dispatches dailyGoalCompleted notification with valid payload and streak days', () => {
      const template = notificationTemplates.dailyGoalCompleted(
        10000,
        14,
        'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-celebration.png'
      );

      expect(template.category).toBe(PUSH_CATEGORIES.STREAK_ALERT);
      expect(template.title).toBe('Daily Goal Achieved');
      expect(template.body).toBe("You've reached 10,000 step goal and kept your 14-day streak going 🥳");
      expect(template.imageUrl).toBe('https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-celebration.png');
      expect(template.data.imageUrl).toBe('https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-celebration.png');
      expect(template.data.screen).toBe('HomeTab');
    });

    it('dispatches streakAtRisk notification with valid payload and verbatim copy', () => {
      const template = notificationTemplates.streakAtRisk(
        7,
        2500,
        'https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-urgent.png'
      );

      expect(template.category).toBe(PUSH_CATEGORIES.STREAK_ALERT);
      expect(template.title).toBe('Streak at risk');
      expect(template.body).toBe('Your 7-day streak is still within reach. Complete 2,500 more steps before midnight to keep it going');
      expect(template.imageUrl).toBe('https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-urgent.png');
      expect(template.data.imageUrl).toBe('https://auth.sabisweat.com/storage/v1/object/public/streaks/flame-urgent.png');
      expect(template.data.screen).toBe('HomeTab');
    });

    it('sends cleanly without image when streak image is omitted', () => {
      const template = notificationTemplates.streakAtRisk(7, 2500, undefined);
      expect(template.imageUrl).toBeUndefined();
      expect(template.data.imageUrl).toBeUndefined();
      expect(template.title).toBe('Streak at risk');
      expect(template.body).toBe('Your 7-day streak is still within reach. Complete 2,500 more steps before midnight to keep it going');
    });
  });
});
