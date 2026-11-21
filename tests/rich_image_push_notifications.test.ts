import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { supabase } from '../src/config/database';
import * as inboxService from '../src/services/inboxService';
import * as deviceService from '../src/services/deviceService';
import * as preferenceService from '../src/services/preferenceService';
import * as expoPushService from '../src/services/expoPushService';
import {
  dispatchNotification,
  isValidHttpsImageUrl,
  resolveRichPushImageUrl,
} from '../src/services/notificationDispatcher';
import {
  notificationTemplates,
  resolveChallengeNotificationImage,
} from '../src/services/notificationTemplates';
import { dispatchToUser, sendTestPush } from '../src/controllers/notificationAdminController';
import type { ExpoPushMessage } from '../src/models/notificationModel';

describe('Rich Image Push Notifications (Expo Push API)', () => {
  let capturedBodies: ExpoPushMessage[][] = [];
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    capturedBodies = [];
    jest.clearAllMocks();

    jest.spyOn(inboxService, 'createInAppNotification').mockResolvedValue({
      notification: {
        id: 'notif-1',
        userId: 'user-1',
        type: 'TEST',
        title: 't',
        description: 'b',
        read: false,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      isNew: true,
    });

    jest.spyOn(inboxService, 'getUnreadCount').mockResolvedValue({
      unreadCount: 3,
      badge: 3,
      updatedAt: new Date().toISOString(),
    });

    jest.spyOn(preferenceService, 'isPushCategoryEnabled').mockResolvedValue(true);

    jest.spyOn(deviceService, 'getActiveDevicesForUser').mockResolvedValue([
      {
        id: 'dev-ios-1',
        user_id: 'user-1',
        expo_push_token: 'ExponentPushToken[ios-test-token]',
        platform: 'ios',
        device_id: 'ios-1',
        device_name: 'iPhone',
        app_id: 'com.sabisweat.app',
        app_version: '1.0.0',
        expo_project_id: 'proj-1',
        environment: 'production',
        timezone: 'Africa/Lagos',
        locale: 'en',
        notifications_enabled: true,
        is_active: true,
        invalidated_at: null,
        invalidation_reason: null,
        last_seen_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'dev-android-1',
        user_id: 'user-1',
        expo_push_token: 'ExponentPushToken[android-test-token]',
        platform: 'android',
        device_id: 'and-1',
        device_name: 'Pixel',
        app_id: 'com.sabisweat.app',
        app_version: '1.0.0',
        expo_project_id: 'proj-1',
        environment: 'production',
        timezone: 'Africa/Lagos',
        locale: 'en',
        notifications_enabled: true,
        is_active: true,
        invalidated_at: null,
        invalidation_reason: null,
        last_seen_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    jest.spyOn(supabase, 'from').mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    } as any);

    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const parsed = JSON.parse(init.body) as ExpoPushMessage[];
      capturedBodies.push(parsed);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: parsed.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })),
        }),
      } as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates HTTPS-only URLs and rejects http:// and data:image/ URIs', () => {
    expect(isValidHttpsImageUrl('https://cdn.sabisweat.com/img.png')).toBe(true);
    expect(isValidHttpsImageUrl('http://cdn.sabisweat.com/img.png')).toBe(false);
    expect(isValidHttpsImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
    expect(isValidHttpsImageUrl('')).toBe(false);
    expect(isValidHttpsImageUrl(null)).toBe(false);
    expect(isValidHttpsImageUrl('not-a-url')).toBe(false);
  });

  it('prefers HTTPS hero_image_url over base64 hero_image_base64 in resolveChallengeNotificationImage', () => {
    expect(
      resolveChallengeNotificationImage({
        challenge_image: null,
        hero_image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        hero_image_url: 'https://auth.sabisweat.com/storage/v1/object/public/images/hero.jpg',
      })
    ).toBe('https://auth.sabisweat.com/storage/v1/object/public/images/hero.jpg');
  });

  const richTemplateCases: Array<{
    name: string;
    build: () => ReturnType<typeof notificationTemplates.clubAnnouncementCreated>;
    expectedImage: string;
  }> = [
    {
      name: 'clubAnnouncementCreated',
      expectedImage: 'https://cdn.sabisweat.com/club-logo.png',
      build: () =>
        notificationTemplates.clubAnnouncementCreated(
          'club-1',
          'Lagos Runners',
          'Sunday Run',
          'Meet at 6am sharp.',
          'https://cdn.sabisweat.com/club-logo.png'
        ),
    },
    {
      name: 'clubPostCreated',
      expectedImage: 'https://auth.sabisweat.com/storage/v1/object/public/avatar2/avatar.png',
      build: () =>
        notificationTemplates.clubPostCreated(
          'post-1',
          'club-1',
          'Morning 5K',
          'tunde',
          'Lagos Runners',
          'Great session today!',
          'https://auth.sabisweat.com/storage/v1/object/public/avatar2/avatar.png'
        ),
    },
    {
      name: 'joinClubRequest',
      expectedImage: 'https://auth.sabisweat.com/storage/v1/object/public/avatar2/requester.png',
      build: () =>
        notificationTemplates.joinClubRequest(
          'club-1',
          'amaka',
          'Lagos Runners',
          'https://auth.sabisweat.com/storage/v1/object/public/avatar2/requester.png'
        ),
    },
    {
      name: 'joinClubApproved',
      expectedImage: 'https://cdn.sabisweat.com/club-badge.png',
      build: () =>
        notificationTemplates.joinClubApproved(
          'club-1',
          'Lagos Runners',
          'https://cdn.sabisweat.com/club-badge.png'
        ),
    },
    {
      name: 'clubEventCreated',
      expectedImage: 'https://cdn.sabisweat.com/event-cover.jpg',
      build: () =>
        notificationTemplates.clubEventCreated(
          'evt-1',
          'club-1',
          'Saturday Trail Run',
          'Lagos Runners',
          'Nov 28',
          'https://cdn.sabisweat.com/event-cover.jpg'
        ),
    },
    {
      name: 'publicChallengeCreated',
      expectedImage: 'https://cdn.sabisweat.com/challenge-1.jpg',
      build: () =>
        notificationTemplates.publicChallengeCreated(
          'ch-1',
          '10K November',
          'Sabi Sweat',
          'https://cdn.sabisweat.com/challenge-1.jpg'
        ),
    },
    {
      name: 'clubChallengeCreated',
      expectedImage: 'https://cdn.sabisweat.com/challenge-2.jpg',
      build: () =>
        notificationTemplates.clubChallengeCreated(
          'ch-2',
          'Club Sprint',
          'Lagos Runners',
          'https://cdn.sabisweat.com/challenge-2.jpg'
        ),
    },
    {
      name: 'leaderboardOvertake',
      expectedImage: 'https://auth.sabisweat.com/storage/v1/object/public/avatar2/overtaker.png',
      build: () =>
        notificationTemplates.leaderboardOvertake(
          'ch-2',
          'Club Sprint',
          'Chidi',
          'https://auth.sabisweat.com/storage/v1/object/public/avatar2/overtaker.png'
        ),
    },
    {
      name: 'challengeCompletionChampion',
      expectedImage: 'https://cdn.sabisweat.com/champion.jpg',
      build: () =>
        notificationTemplates.challengeCompletionChampion(
          'ch-2',
          'Club Sprint',
          1000,
          'https://cdn.sabisweat.com/champion.jpg'
        ),
    },
    {
      name: 'challengeCompletionTop5',
      expectedImage: 'https://cdn.sabisweat.com/top5.jpg',
      build: () =>
        notificationTemplates.challengeCompletionTop5(
          'ch-2',
          'Club Sprint',
          3,
          300,
          'https://cdn.sabisweat.com/top5.jpg'
        ),
    },
    {
      name: 'challengeCompletionParticipant',
      expectedImage: 'https://cdn.sabisweat.com/participant.jpg',
      build: () =>
        notificationTemplates.challengeCompletionParticipant(
          'ch-2',
          'Club Sprint',
          'https://cdn.sabisweat.com/participant.jpg'
        ),
    },
    {
      name: 'challengeCompletionGoalMet',
      expectedImage: 'https://cdn.sabisweat.com/goal-met.jpg',
      build: () =>
        notificationTemplates.challengeCompletionGoalMet(
          'ch-2',
          'Club Sprint',
          'https://cdn.sabisweat.com/goal-met.jpg'
        ),
    },
    {
      name: 'challengeWinnerAnnouncement',
      expectedImage: 'https://cdn.sabisweat.com/winner.jpg',
      build: () =>
        notificationTemplates.challengeWinnerAnnouncement(
          'ch-2',
          'Club Sprint',
          'https://cdn.sabisweat.com/winner.jpg'
        ),
    },
    {
      name: 'challengeSubscribersAnnouncement',
      expectedImage: 'https://cdn.sabisweat.com/announced.jpg',
      build: () =>
        notificationTemplates.challengeSubscribersAnnouncement(
          'ch-2',
          'Club Sprint',
          'https://cdn.sabisweat.com/announced.jpg'
        ),
    },
    {
      name: 'postLike',
      expectedImage: 'https://cdn.sabisweat.com/post-photo.jpg',
      build: () =>
        notificationTemplates.postLike(
          'post-9',
          'bola',
          2,
          'https://cdn.sabisweat.com/post-photo.jpg'
        ),
    },
    {
      name: 'postComment',
      expectedImage: 'https://cdn.sabisweat.com/post-photo.jpg',
      build: () =>
        notificationTemplates.postComment(
          'post-9',
          'bola',
          'Awesome pace!',
          false,
          'https://cdn.sabisweat.com/post-photo.jpg'
        ),
    },
    {
      name: 'stepMilestone50',
      expectedImage: 'https://cdn.sabisweat.com/streak-50.png',
      build: () =>
        notificationTemplates.stepMilestone50(
          5000,
          'https://cdn.sabisweat.com/streak-50.png'
        ),
    },
    {
      name: 'dailyGoalCompleted',
      expectedImage: 'https://cdn.sabisweat.com/streak-100.png',
      build: () =>
        notificationTemplates.dailyGoalCompleted(
          10000,
          7,
          'https://cdn.sabisweat.com/streak-100.png'
        ),
    },
    {
      name: 'streakAtRisk',
      expectedImage: 'https://cdn.sabisweat.com/streak-risk.png',
      build: () =>
        notificationTemplates.streakAtRisk(
          7,
          1200,
          'https://cdn.sabisweat.com/streak-risk.png'
        ),
    },
  ];

  test.each(richTemplateCases)(
    'sends mutableContent: true and richContent.image for $name while preserving Android & metadata fields',
    async ({ build, expectedImage }) => {
      const tpl = build();
      await dispatchNotification({
        userId: 'user-1',
        type: tpl.category,
        title: tpl.title,
        body: tpl.body,
        imageUrl: tpl.imageUrl,
        data: tpl.data,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedBodies).toHaveLength(1);
      const sentMessages = capturedBodies[0];
      expect(sentMessages).toHaveLength(2);

      for (const msg of sentMessages) {
        expect(msg.mutableContent).toBe(true);
        expect(msg.richContent).toEqual({ image: expectedImage });
        expect(msg.data?.imageUrl).toBe(expectedImage);
        expect(msg.title).toBe(tpl.title);
        expect(msg.body).toBe(tpl.body);
        expect(msg.sound).toBe('default');
        expect(msg.priority).toBe('high');
        expect(msg.channelId).toBe('default');
        expect(msg.badge).toBe(3);
        expect(msg.data?.screen).toBe(tpl.data.screen);
        expect(msg.data?.params).toEqual(tpl.data.params);
        expect(msg.data?.notificationId).toBe('notif-1');
      }
    }
  );

  it('promotes HTTPS image URLs provided only inside data (e.g. scheduled notifications)', async () => {
    await dispatchNotification({
      userId: 'user-1',
      type: 'COMMUNITY_UPDATE',
      title: 'Scheduled Highlight',
      body: 'Check this out',
      data: {
        screen: 'PostDetail',
        params: { postId: 'p-1' },
        mediaUrl: 'https://cdn.sabisweat.com/scheduled-media.jpg',
      },
    });

    const msg = capturedBodies[0][0];
    expect(msg.mutableContent).toBe(true);
    expect(msg.richContent).toEqual({ image: 'https://cdn.sabisweat.com/scheduled-media.jpg' });
    expect(msg.data?.imageUrl).toBe('https://cdn.sabisweat.com/scheduled-media.jpg');
    expect(msg.data?.mediaUrl).toBe('https://cdn.sabisweat.com/scheduled-media.jpg');
  });

  it('does NOT add mutableContent or richContent to ordinary notifications without images', async () => {
    const ordinaryTemplates = [
      notificationTemplates.morningKickoff(0),
      notificationTemplates.stepMilestone80(2000),
      notificationTemplates.challengeEndingSoonMostSteps('ch-1', 'Sprint', 4),
      notificationTemplates.rewardRedeemed(500, 'Smoothie', 'FreshBar'),
      notificationTemplates.sabiLevelUp('Mover'),
    ];

    for (const tpl of ordinaryTemplates) {
      capturedBodies = [];
      await dispatchNotification({
        userId: 'user-1',
        type: tpl.category,
        title: tpl.title,
        body: tpl.body,
        imageUrl: tpl.imageUrl,
        data: tpl.data,
      });

      const msg = capturedBodies[0][0];
      expect(msg.mutableContent).toBeUndefined();
      expect(msg.richContent).toBeUndefined();
      expect(msg.data?.imageUrl).toBeUndefined();
      expect(msg.channelId).toBe('default');
      expect(msg.title).toBe(tpl.title);
      expect(msg.body).toBe(tpl.body);
    }
  });

  it('strips non-HTTPS and base64 data URIs instead of sending broken rich push payloads', async () => {
    await dispatchNotification({
      userId: 'user-1',
      type: 'CHALLENGE_UPDATE',
      title: 'Base64 Challenge',
      body: 'Body text',
      imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      data: {
        screen: 'ChallengeOverview',
        imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        image: 'http://insecure.example.com/pic.jpg',
      },
    });

    const msg = capturedBodies[0][0];
    expect(msg.mutableContent).toBeUndefined();
    expect(msg.richContent).toBeUndefined();
    expect(msg.data?.imageUrl).toBeUndefined();
    expect(msg.data?.image).toBeUndefined();
    expect(msg.data?.screen).toBe('ChallengeOverview');
  });

  it('supports rich images with mutableContent in sendTestPush and leaves plain test pushes untouched', async () => {
    const sendSpy = jest.spyOn(expoPushService, 'sendPushChunked');
    const jsonMock = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json: jsonMock }) } as unknown as Response;
    const next = jest.fn();

    await sendTestPush(
      {
        body: {
          token: 'ExponentPushToken[ios-test]',
          title: 'Rich Test',
          body: 'With image',
          richContent: { image: 'https://cdn.sabisweat.com/test.png' },
          data: { screen: 'HomeTab' },
        },
      } as Request,
      res,
      next
    );

    expect(sendSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExponentPushToken[ios-test]',
        mutableContent: true,
        richContent: { image: 'https://cdn.sabisweat.com/test.png' },
        data: { screen: 'HomeTab', imageUrl: 'https://cdn.sabisweat.com/test.png' },
      }),
    ]);

    sendSpy.mockClear();

    await sendTestPush(
      {
        body: {
          token: 'ExponentPushToken[ios-test]',
          title: 'Plain Test',
          body: 'No image',
          data: { screen: 'HomeTab' },
        },
      } as Request,
      res,
      next
    );

    const plainArg = sendSpy.mock.calls[0][0][0];
    expect(plainArg.mutableContent).toBeUndefined();
    expect(plainArg.richContent).toBeUndefined();
    expect(plainArg.data).toEqual({ screen: 'HomeTab' });
  });

  it('supports richContent.image and fcm_options.image in dispatchToUser', async () => {
    const jsonMock = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json: jsonMock }) } as unknown as Response;
    const next = jest.fn();

    await dispatchToUser(
      {
        body: {
          userId: 'user-1',
          title: 'Promo',
          body: 'Check it out',
          fcm_options: { image: 'https://cdn.sabisweat.com/fcm.jpg' },
        },
      } as Request,
      res,
      next
    );

    const msg = capturedBodies[0][0];
    expect(msg.mutableContent).toBe(true);
    expect(msg.richContent).toEqual({ image: 'https://cdn.sabisweat.com/fcm.jpg' });
    expect(msg.data?.imageUrl).toBe('https://cdn.sabisweat.com/fcm.jpg');
  });

  it('resolves all supported rich image payload key variants', () => {
    const url = 'https://cdn.sabisweat.com/pic.jpg';
    expect(resolveRichPushImageUrl({ richContent: { image: url } })).toBe(url);
    expect(resolveRichPushImageUrl({ imageUrl: url })).toBe(url);
    expect(resolveRichPushImageUrl({ image: url })).toBe(url);
    expect(resolveRichPushImageUrl({ image_url: url })).toBe(url);
    expect(resolveRichPushImageUrl({ mediaUrl: url })).toBe(url);
    expect(resolveRichPushImageUrl({ fcm_options: { image: url } })).toBe(url);
    expect(resolveRichPushImageUrl({ data: { image: url } })).toBe(url);
    expect(resolveRichPushImageUrl({ data: { imageUrl: url } })).toBe(url);
    expect(resolveRichPushImageUrl({ data: { image_url: url } })).toBe(url);
    expect(resolveRichPushImageUrl({ data: { mediaUrl: url } })).toBe(url);
  });

  it('ensures Supabase Edge Function notifications-dispatcher sets mutableContent and richContent.image conditionally', () => {
    const fnPath = path.resolve(
      __dirname,
      '../supabase/functions/notifications-dispatcher/index.ts'
    );
    const source = fs.readFileSync(fnPath, 'utf8');
    expect(source).toContain('mutableContent: true');
    expect(source).toContain('richContent: { image: richImageUrl }');
    expect(source).toContain('parsed.protocol === "https:"');
    expect(source).toContain('resolveRichPushImageUrl');
  });
});
