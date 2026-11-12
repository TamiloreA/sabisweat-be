/**
 * Unit & Integration Tests for Community & Clubs Engine Push Notifications
 * - Recipient filtering matrix (announcements, admin posts, regular posts)
 * - Self-notification exclusions (author, self-like, self-comment, requester)
 * - Image selection logic & strict fallbacks
 * - Like batching and anti-spam grouping
 * - Join request recipient targeting & unread badge-count handling
 * - Club notification preference updating endpoint
 */

import { notificationTemplates } from '../src/services/notificationTemplates';
import * as eventService from '../src/services/notificationEventService';
import * as communityService from '../src/services/communityService';
import * as dispatcher from '../src/services/notificationDispatcher';
import { supabase } from '../src/config/database';
import { PUSH_CATEGORIES } from '../src/models/notificationModel';

// Mock dependencies
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

describe('Community & Clubs Engine Notifications', () => {
  const dispatchSpy = dispatcher.dispatchNotification as jest.MockedFunction<typeof dispatcher.dispatchNotification>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Notification Templates Copy & Formatting', () => {
    it('formats Club Announcement with primary club name title and no trailing full stop', () => {
      const t = notificationTemplates.clubAnnouncementCreated(
        'club-1',
        'Lagos Movers Club',
        'Weekend Meetup',
        'We are meeting at the park this Saturday at 7 AM. Bring your running shoes.',
        'https://cdn.sabisweat.app/club.jpg'
      );

      expect(t.category).toBe(PUSH_CATEGORIES.COMMUNITY_UPDATE);
      expect(t.title).toBe('Lagos Movers Club shared a new announcement');
      expect(t.body).toBe('We are meeting at the park this Saturday at 7 AM. Bring your running shoes');
      expect(t.body.endsWith('.')).toBe(false);
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/club.jpg');
      expect(t.data.screen).toBe('ClubAnnouncement');
      expect(t.data.params.clubId).toBe('club-1');
    });

    it('falls back to Announcement Title when club name is unavailable', () => {
      const t = notificationTemplates.clubAnnouncementCreated(
        'club-1',
        null,
        'Important Safety Notice',
        'Please stay hydrated during marathon training.'
      );

      expect(t.title).toBe('Important Safety Notice');
      expect(t.body).toBe('Please stay hydrated during marathon training');
      expect(t.imageUrl).toBeUndefined();
    });

    it('formats Standard Club Post using post title if present', () => {
      const t = notificationTemplates.clubPostCreated(
        'post-1',
        'club-1',
        'Morning 10K Complete',
        'Chidi',
        'Lagos Movers',
        'Just finished a refreshing 10K around Lekki Phase 1.',
        'https://cdn.sabisweat.app/chidi.jpg'
      );

      expect(t.title).toBe('Morning 10K Complete');
      expect(t.body).toBe('Just finished a refreshing 10K around Lekki Phase 1');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/chidi.jpg');
      expect(t.data.screen).toBe('PostDetail');
      expect(t.data.params.postId).toBe('post-1');
      expect(t.data.params.clubId).toBe('club-1');
    });

    it('formats Standard Club Post using [Author Name] in [Club Name] when post has no title', () => {
      const t = notificationTemplates.clubPostCreated(
        'post-2',
        'club-1',
        '',
        'Amaka Okoye',
        'Lagos Movers',
        'Hit my daily 10,000 steps goal before lunchtime.'
      );

      expect(t.title).toBe('Amaka Okoye in Lagos Movers');
      expect(t.body).toBe('Hit my daily 10,000 steps goal before lunchtime');
    });

    it('formats Join Club Request notification', () => {
      const t = notificationTemplates.joinClubRequest(
        'club-1',
        'Babatunde',
        'Eko Runners',
        'https://cdn.sabisweat.app/babatunde.jpg'
      );

      expect(t.category).toBe(PUSH_CATEGORIES.COMMUNITY_UPDATE);
      expect(t.title).toBe('New Member Request');
      expect(t.body).toBe('Babatunde requested to join Eko Runners');
      expect(t.data.type).toBe('community_club_join_request');
      expect(t.data.screen).toBe('JoinClubRequest');
      expect(t.data.params.clubId).toBe('club-1');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/babatunde.jpg');
    });

    it('formats Join Club Request Approved notification', () => {
      const t = notificationTemplates.joinClubApproved(
        'club-1',
        'Eko Runners',
        'https://cdn.sabisweat.app/eko.jpg'
      );

      expect(t.category).toBe(PUSH_CATEGORIES.COMMUNITY_UPDATE);
      expect(t.title).toBe('Welcome to Eko Runners');
      expect(t.body).toBe('Your request to join has been approved. Start moving with the club');
      expect(t.data.screen).toBe('ClubDetail');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/eko.jpg');
    });

    it('formats Club Event Scheduled notification', () => {
      const t = notificationTemplates.clubEventCreated(
        'event-1',
        'club-1',
        'Lekki Saturday 5K Walk',
        'Lagos Movers',
        'Nov 15',
        'https://cdn.sabisweat.app/event.jpg'
      );

      expect(t.title).toBe('Lekki Saturday 5K Walk');
      expect(t.body).toBe('New event scheduled in Lagos Movers on Nov 15');
      expect(t.data.screen).toBe('ClubEventDetail');
      expect(t.data.params.eventId).toBe('event-1');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/event.jpg');
    });

    it('formats Single Like notification with latest post image and NO avatar fallback', () => {
      const t = notificationTemplates.postLike(
        'post-1',
        'David',
        0,
        'https://cdn.sabisweat.app/post-img-latest.jpg'
      );

      expect(t.category).toBe(PUSH_CATEGORIES.COMMUNITY_UPDATE);
      expect(t.title).toBe('Post');
      expect(t.body).toBe('David liked your post');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/post-img-latest.jpg');
      expect(t.data.screen).toBe('PostDetail');
      expect(t.data.params.postId).toBe('post-1');
    });

    it('formats Grouped Likes notification (2+ people) with latest post image', () => {
      const t = notificationTemplates.postLike(
        'post-1',
        'David',
        2,
        'https://cdn.sabisweat.app/post-img-latest.jpg'
      );

      expect(t.title).toBe('Post');
      expect(t.body).toBe('David and 2 others liked your post');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/post-img-latest.jpg');
    });

    it('formats Post Comment (top-level) with latest post image', () => {
      const t = notificationTemplates.postComment(
        'post-1',
        'Sarah',
        'Great pace! Keep it up.',
        false,
        'https://cdn.sabisweat.app/post-img.jpg'
      );

      expect(t.title).toBe('Sarah commented on your post');
      expect(t.body).toBe('Great pace! Keep it up');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/post-img.jpg');
    });

    it('formats Post Reply (nested comment) with latest post image', () => {
      const t = notificationTemplates.postComment(
        'post-1',
        'Emeka',
        'Thanks Sarah, appreciate the encouragement.',
        true,
        'https://cdn.sabisweat.app/post-img.jpg'
      );

      expect(t.title).toBe('Emeka replied to your comment');
      expect(t.body).toBe('Thanks Sarah, appreciate the encouragement');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/post-img.jpg');
    });
  });

  describe('Event Handlers & Recipient Filtering Matrix', () => {
    it('filters announcement recipients: only members with announcements, admin_posts, all_posts (excludes author & off)', async () => {
      // Mock announcement
      const mockAnnouncement = {
        id: 'ann-1',
        club_id: 'club-1',
        title: 'Track Closure',
        content: 'The National Stadium track will be closed for maintenance tomorrow morning.',
        image_url: null,
        created_by: 'admin-author',
      };

      // Mock club
      const mockClub = {
        id: 'club-1',
        name: 'Strikers Club',
        profile_image_url: 'https://cdn.sabisweat.app/strikers.png',
        created_by: 'owner-id',
      };

      // Mock members with various preferences
      const mockMembers = [
        { user_id: 'admin-author', notification_preference: 'all_posts' }, // AUTHOR -> MUST EXCLUDE
        { user_id: 'member-all', notification_preference: 'all_posts' },    // MUST INCLUDE
        { user_id: 'member-ann', notification_preference: 'announcements' }, // MUST INCLUDE
        { user_id: 'member-adm', notification_preference: 'admin_posts' },  // MUST INCLUDE
        { user_id: 'member-off', notification_preference: 'off' },          // MUST EXCLUDE
      ];

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'club_announcements') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockAnnouncement, error: null }),
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
              eq: () => Promise.resolve({ data: mockMembers, error: null }),
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

      const res = await eventService.handleClubAnnouncementEvent('ann-1');

      expect(res.notifiedCount).toBe(3);
      // Verify author was excluded
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-author' }));
      // Verify member with 'off' was excluded
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-off' }));
      // Verify eligible members received notification
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-all' }));
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-ann' }));
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-adm' }));
    });

    it('filters regular member post: only members with all_posts receive it (admin_posts & off excluded)', async () => {
      const mockPost = {
        id: 'post-reg',
        club_id: 'club-1',
        title: 'My 5K Run',
        description: 'Felt great today',
        images_url: ['https://cdn.sabisweat.app/pic1.jpg', 'https://cdn.sabisweat.app/pic2-latest.jpg'],
        author_id: 'reg-author',
      };

      const mockClub = {
        id: 'club-1',
        name: 'Strikers Club',
        profile_image_url: 'https://cdn.sabisweat.app/strikers.png',
        created_by: 'owner-id',
      };

      const mockMembers = [
        { user_id: 'reg-author', notification_preference: 'all_posts' },   // AUTHOR -> EXCLUDE
        { user_id: 'member-all', notification_preference: 'all_posts' },   // INCLUDE
        { user_id: 'member-adm', notification_preference: 'admin_posts' }, // REGULAR POST -> EXCLUDE
        { user_id: 'member-ann', notification_preference: 'announcements' },// REGULAR POST -> EXCLUDE
        { user_id: 'member-off', notification_preference: 'off' },         // EXCLUDE
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
              eq: (_col: string, val: string) => {
                // Author role check
                if (val === 'club-1') {
                  return {
                    eq: (_c2: string, uVal: string) => ({
                      maybeSingle: () => Promise.resolve({ data: { role: 'member' }, error: null }),
                    }),
                    // Member list query
                    then: (resolve: any) => resolve({ data: mockMembers, error: null }),
                  };
                }
                return Promise.resolve({ data: mockMembers, error: null });
              },
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: { first_name: 'Regular', last_name: 'Runner', username: 'regrunner', photo_url: 'https://cdn.sabisweat.app/reg.jpg' },
                  error: null,
                }),
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

      const res = await eventService.handleClubPostEvent('post-reg');

      expect(res.notifiedCount).toBe(1);
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-all' }));
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-adm' }));
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-ann' }));
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-off' }));
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'reg-author' }));
    });

    it('never notifies self-likes on posts', async () => {
      const mockPost = {
        id: 'post-10',
        author_id: 'user-author',
        images_url: ['https://cdn.sabisweat.app/post.jpg'],
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
        return {} as any;
      });

      // User likes their own post
      await eventService.handlePostLikeEvent('post-10', 'user-author');

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('groups multiple likes into a single notification using the latest post image (no avatar fallback)', async () => {
      const mockPost = {
        id: 'post-20',
        author_id: 'post-author',
        images_url: ['https://cdn.sabisweat.app/img1.jpg', 'https://cdn.sabisweat.app/img2-latest.jpg'],
      };

      const mockLikes = [
        { user_id: 'liker-3', created_at: '2026-11-10T10:00:00Z' },
        { user_id: 'liker-2', created_at: '2026-11-10T09:59:00Z' },
        { user_id: 'liker-1', created_at: '2026-11-10T09:58:00Z' },
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
        if (table === 'community_likes') {
          return {
            select: () => ({
              eq: () => ({
                neq: () => ({
                  order: () => Promise.resolve({ data: mockLikes, error: null }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: { first_name: 'David', last_name: 'O', username: 'davido' },
                  error: null,
                }),
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

      await eventService.handlePostLikeEvent('post-20', 'liker-3');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'post-author',
          title: 'Post',
          body: 'davido and 2 others liked your post',
          // Must use latest post image!
          imageUrl: 'https://cdn.sabisweat.app/img2-latest.jpg',
        })
      );
    });

    it('notifies post author on top-level comment and parent author on nested reply (never notifies self)', async () => {
      // 1. Top-level comment
      const mockTopComment = {
        id: 'comm-1',
        post_id: 'post-30',
        user_id: 'commenter-1',
        text: 'Awesome run!',
        parent_id: null,
      };

      const mockPost = {
        id: 'post-30',
        author_id: 'author-30',
        images_url: ['https://cdn.sabisweat.app/post-img.jpg'],
      };

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'community_comments') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockTopComment, error: null }),
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
                maybeSingle: () => Promise.resolve({
                  data: { first_name: 'Sarah', last_name: 'K', username: 'sarahk' },
                  error: null,
                }),
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

      await eventService.handlePostCommentEvent('comm-1');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'author-30',
          title: 'Sarah K commented on your post',
          body: 'Awesome run!',
          imageUrl: 'https://cdn.sabisweat.app/post-img.jpg',
        })
      );

      // 2. Nested reply
      jest.clearAllMocks();
      const mockNestedReply = {
        id: 'comm-2',
        post_id: 'post-30',
        user_id: 'replier-1',
        text: 'I agree with Sarah!',
        parent_id: 'comm-1',
      };

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'community_comments') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: () => {
                  if (val === 'comm-2') return Promise.resolve({ data: mockNestedReply, error: null });
                  if (val === 'comm-1') return Promise.resolve({ data: mockTopComment, error: null });
                  return Promise.resolve({ data: null, error: null });
                },
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
                maybeSingle: () => Promise.resolve({
                  data: { first_name: 'Tunde', last_name: 'M', username: 'tundem' },
                  error: null,
                }),
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

      await eventService.handlePostCommentEvent('comm-2');

      // Notifies parent comment author (commenter-1), NOT the post author!
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'commenter-1',
          title: 'Tunde M replied to your comment',
          body: 'I agree with Sarah!',
        })
      );
    });

    it('notifies Club Admins and Owner on join request with type community_club_join_request', async () => {
      const mockClub = {
        id: 'club-private',
        name: 'VIP Striders',
        profile_image_url: 'https://cdn.sabisweat.app/vip.png',
        created_by: 'owner-vip',
      };

      const mockAdmins = [
        { user_id: 'admin-1' },
        { user_id: 'admin-2' },
      ];

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
                maybeSingle: () => Promise.resolve({
                  data: { first_name: 'Hope', last_name: 'Ade', username: 'hopeade', photo_url: 'https://cdn.sabisweat.app/hope.jpg' },
                  error: null,
                }),
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

      const res = await eventService.handleJoinClubRequestEvent('club-private', 'hope-user-id');

      // Notifies owner-vip, admin-1, and admin-2 = 3
      expect(res.notifiedCount).toBe(3);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-vip',
          type: 'community_club_join_request',
          title: 'New Member Request',
          body: 'Hope Ade requested to join VIP Striders',
        })
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          type: 'community_club_join_request',
        })
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-2',
          type: 'community_club_join_request',
        })
      );
      // Requester must NOT be notified
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'hope-user-id' }));
    });
  });

  describe('updateClubNotificationPreference service method', () => {
    it('updates preference successfully for an active club member', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'club_members') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { user_id: 'user-1', role: 'member' }, error: null }),
                }),
              }),
            }),
            update: (_val: any) => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await communityService.updateClubNotificationPreference('club-1', 'user-1', 'announcements');

      expect(res.success).toBe(true);
      expect(res.clubId).toBe('club-1');
      expect(res.notificationPreference).toBe('announcements');
    });

    it('rejects invalid preference values', async () => {
      await expect(
        communityService.updateClubNotificationPreference('club-1', 'user-1', 'invalid_preference')
      ).rejects.toThrow('Invalid notification preference');
    });

    it('rejects users who are not members of the club', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'club_members') {
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

      await expect(
        communityService.updateClubNotificationPreference('club-1', 'non-member', 'all_posts')
      ).rejects.toThrow('User is not a member of this club');
    });
  });
});

