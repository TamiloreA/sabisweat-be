/**
 * Sabi Level Milestones & Push-Only Notification Unit Tests
 *
 * Requirements verified:
 * 1. Milestone thresholds:
 *    - Starter: 0 (initial, no notification)
 *    - Mover: 1,000,000 verified lifetime steps
 *    - Strider: 2,000,000 verified lifetime steps
 *    - Champion: 3,000,000 verified lifetime steps
 *    - Legend: 4,000,000 verified lifetime steps
 * 2. Multi-threshold crossing in single reconciliation:
 *    - Awarded and dispatched in strictly ascending order (Mover -> Strider -> Champion -> Legend).
 * 3. Strict Push-Only Constraint:
 *    - ZERO records created in public.notifications.
 *    - Zero effect on user's unread notification count.
 *    - Expo push message omits badge count (does not alter or increment app icon badge).
 * 4. Exact Title, Body, and Deep Link Payload:
 *    - Title: "Level Up! 🎉"
 *    - Exact copy for Mover, Strider, Champion, Legend.
 *    - Deep link: { screen: "SabiLevel", params: { level: "<Level>" } }
 *    - Category: REWARD_EARNED, type: sabi_level_up
 * 5. Duplicate Prevention & Database Persistence:
 *    - Atomic insertion into public.user_achievements (uq_user_achievement_idx).
 *    - Profiles.sabi_level updated to highest rank reached without downgrades.
 *    - Repeated syncs after award do not re-dispatch notifications.
 *    - Concurrent unique constraint violations (code 23505) handled safely.
 * 6. Health sync integration:
 *    - syncStepData and syncStepDataBatch trigger milestone detection.
 */

import {
  checkAndAwardSabiLevelMilestones,
  getVerifiedLifetimeSteps,
  SABI_LEVEL_MILESTONES,
} from '../src/services/sabiLevelService';
import { notificationTemplates } from '../src/services/notificationTemplates';
import { dispatchNotification } from '../src/services/notificationDispatcher';
import { syncStepData, syncStepDataBatch } from '../src/services/healthService';
import * as dispatcherModule from '../src/services/notificationDispatcher';
import * as expoPushService from '../src/services/expoPushService';
import * as deviceService from '../src/services/deviceService';
import * as preferenceService from '../src/services/preferenceService';
import { PUSH_CATEGORIES } from '../src/models/notificationModel';

// Mock in-memory state
let mockProfile: any = null;
let mockDailySteps: any[] = [];
let mockUserAchievements: any[] = [];
let mockNotifications: any[] = [];
let mockDeliveryAttempts: any[] = [];
let mockUserDevices: any[] = [];

jest.mock('../src/config/database', () => {
  return {
    supabase: {
      from: (table: string) => ({
        select: (...args: any[]) => ({
          eq: (col: string, val: any) => ({
            single: async () => {
              if (table === 'profiles') {
                return { data: mockProfile, error: mockProfile ? null : { message: 'Not found' } };
              }
              return { data: null, error: null };
            },
            maybeSingle: async () => {
              if (table === 'profiles') return { data: mockProfile, error: null };
              if (table === 'notifications') {
                const n = mockNotifications.find((x) => x[col] === val);
                return { data: n || null, error: null };
              }
              return { data: null, error: null };
            },
            eq: (col2: string, val2: any) => ({
              eq: (col3: string, val3: any) => ({
                maybeSingle: async () => {
                  if (table === 'user_achievements') {
                    const row = mockUserAchievements.find(
                      (x) => x[col] === val && x[col2] === val2 && x[col3] === val3
                    );
                    return { data: row || null, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
              maybeSingle: async () => {
                if (table === 'user_achievements') {
                  const row = mockUserAchievements.find(
                    (x) => x[col] === val && x[col2] === val2
                  );
                  return { data: row || null, error: null };
                }
                return { data: null, error: null };
              },
            }),
            data: table === 'daily_steps'
              ? mockDailySteps.filter((x) => x[col] === val)
              : table === 'user_achievements'
              ? mockUserAchievements.filter((x) => x[col] === val)
              : [],
            error: null,
            then: (resolve: any) => {
              if (table === 'daily_steps') {
                return resolve({
                  data: mockDailySteps.filter((x) => x[col] === val),
                  error: null,
                });
              }
              if (table === 'user_achievements') {
                return resolve({
                  data: mockUserAchievements.filter((x) => x[col] === val),
                  error: null,
                });
              }
              if (table === 'user_devices') {
                return resolve({
                  data: mockUserDevices.filter((x) => x[col] === val),
                  error: null,
                });
              }
              return resolve({ data: [], error: null });
            },
          }),
          order: () => ({
            data: mockDailySteps,
            error: null,
          }),
        }),
        insert: (payload: any) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === 'user_achievements') {
            for (const r of rows) {
              const duplicate = mockUserAchievements.find(
                (x) =>
                  x.user_id === r.user_id &&
                  x.category === r.category &&
                  x.badge_key === r.badge_key
              );
              if (duplicate) {
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: null,
                      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                    }),
                  }),
                };
              }
              const newRow = { id: `ach-${Date.now()}-${Math.random()}`, ...r };
              mockUserAchievements.push(newRow);
            }
          }
          if (table === 'notifications') {
            mockNotifications.push(...rows);
          }
          if (table === 'notification_delivery_attempts') {
            mockDeliveryAttempts.push(...rows);
          }
          return {
            select: () => ({
              maybeSingle: async () => ({ data: rows[0], error: null }),
              single: async () => ({ data: rows[0], error: null }),
            }),
          };
        },
        update: (payload: any) => ({
          eq: (col: string, val: any) => ({
            eq: (col2: string, val2: any) => ({
              eq: async (col3: string, val3: any) => {
                if (table === 'user_achievements') {
                  const item = mockUserAchievements.find(
                    (x) => x[col] === val && x[col2] === val2 && x[col3] === val3
                  );
                  if (item) Object.assign(item, payload);
                }
                return { data: payload, error: null };
              },
            }),
            then: (resolve: any) => {
              if (table === 'profiles' && mockProfile && mockProfile[col] === val) {
                Object.assign(mockProfile, payload);
              }
              return resolve({ data: payload, error: null });
            },
          }),
        }),
        upsert: (payload: any) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === 'daily_steps') {
            for (const r of rows) {
              const idx = mockDailySteps.findIndex(
                (x) => x.user_id === r.user_id && x.date === r.date
              );
              if (idx >= 0) mockDailySteps[idx] = { ...mockDailySteps[idx], ...r };
              else mockDailySteps.push(r);
            }
          }
          return {
            select: () => ({
              single: async () => ({ data: rows[0], error: null }),
            }),
            error: null,
          };
        },
      }),
    },
    getUserSupabase: () => ({
      from: (table: string) => ({
        upsert: async (payload: any) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === 'daily_steps') {
            for (const r of rows) {
              const idx = mockDailySteps.findIndex(
                (x) => x.user_id === r.user_id && x.date === r.date
              );
              if (idx >= 0) mockDailySteps[idx] = { ...mockDailySteps[idx], ...r };
              else mockDailySteps.push(r);
            }
          }
          return { data: rows, error: null };
        },
      }),
    }),
  };
});

describe('Sabi Level Milestones & Push-Only Notifications', () => {
  const userId = 'user-sabi-123';

  beforeEach(() => {
    mockProfile = {
      id: userId,
      sabi_level: 'Starter',
      steps_count: 0,
      step_goal: 10000,
    };
    mockDailySteps = [];
    mockUserAchievements = [];
    mockNotifications = [];
    mockDeliveryAttempts = [];
    mockUserDevices = [
      {
        id: 'dev-1',
        user_id: userId,
        expo_push_token: 'ExponentPushToken[device-token-abc]',
        platform: 'ios',
        is_active: true,
        notifications_enabled: true,
      },
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Template Copy & Payload Contract', () => {
    it('generates exact title and copy for Mover milestone', () => {
      const template = notificationTemplates.sabiLevelUp('Mover');
      expect(template.title).toBe('Level Up! 🎉');
      expect(template.body).toBe(
        "Congratulations! You've reached Mover. You've built momentum and made movement a regular part of your routine. Keep it going!"
      );
      expect(template.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(template.data).toEqual({
        screen: 'SabiLevel',
        params: { level: 'Mover' },
      });
    });

    it('generates exact title and copy for Strider milestone', () => {
      const template = notificationTemplates.sabiLevelUp('Strider');
      expect(template.title).toBe('Level Up! 🎉');
      expect(template.body).toBe(
        "Incredible work! You've reached Strider. Your consistency has made movement a meaningful part of your everyday lifestyle!"
      );
      expect(template.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(template.data).toEqual({
        screen: 'SabiLevel',
        params: { level: 'Strider' },
      });
    });

    it('generates exact title and copy for Champion milestone', () => {
      const template = notificationTemplates.sabiLevelUp('Champion');
      expect(template.title).toBe('Level Up! 🎉');
      expect(template.body).toBe(
        "You're now a Champion! Your discipline, dedication, and commitment to your goals have brought you this far. Keep pushing forward!"
      );
      expect(template.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(template.data).toEqual({
        screen: 'SabiLevel',
        params: { level: 'Champion' },
      });
    });

    it('generates exact title and copy for Legend milestone', () => {
      const template = notificationTemplates.sabiLevelUp('Legend');
      expect(template.title).toBe('Level Up! 🎉');
      expect(template.body).toBe(
        "Legendary! You've reached the highest Sabi Level. You've built a lifestyle driven by movement, discipline, and continuous progress. You've earned this!"
      );
      expect(template.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(template.data).toEqual({
        screen: 'SabiLevel',
        params: { level: 'Legend' },
      });
    });
  });

  describe('Threshold Milestone Detection', () => {
    it('does not trigger any milestone notification for Starter (< 1,000,000 steps)', async () => {
      mockDailySteps = [
        { user_id: userId, date: '2026-11-01', steps: 400000 },
        { user_id: userId, date: '2026-11-02', steps: 550000 },
      ]; // Total 950,000

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.lifetimeSteps).toBe(950000);
      expect(result.awardedLevels).toEqual([]);
      expect(result.highestLevel).toBe('Starter');
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(mockUserAchievements.length).toBe(0);
    });

    it('detects and awards Mover when crossing 1,000,000 steps', async () => {
      mockDailySteps = [
        { user_id: userId, date: '2026-11-01', steps: 950000 },
        { user_id: userId, date: '2026-11-02', steps: 70000 },
      ]; // Total 1,020,000

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.lifetimeSteps).toBe(1020000);
      expect(result.awardedLevels).toEqual(['Mover']);
      expect(result.highestLevel).toBe('Mover');

      // Verify persistence in user_achievements
      expect(mockUserAchievements.length).toBe(1);
      expect(mockUserAchievements[0].badge_key).toBe('sabi_level_mover');
      expect(mockUserAchievements[0].category).toBe('sabi_level');
      expect(mockUserAchievements[0].target_value).toBe(1000000);

      // Verify profile update
      expect(mockProfile.sabi_level).toBe('Mover');
      expect(mockProfile.steps_count).toBe(1020000);

      // Verify push dispatch
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'sabi_level_up',
          title: 'Level Up! 🎉',
          body: "Congratulations! You've reached Mover. You've built momentum and made movement a regular part of your routine. Keep it going!",
          channel: 'push_only',
          data: {
            screen: 'SabiLevel',
            params: { level: 'Mover' },
          },
        })
      );
    });

    it('detects and awards Strider when crossing 2,000,000 steps', async () => {
      // User was already Mover
      mockProfile.sabi_level = 'Mover';
      mockUserAchievements.push({
        id: 'ach-mover',
        user_id: userId,
        category: 'sabi_level',
        badge_key: 'sabi_level_mover',
        target_value: 1000000,
        progress_value: 1020000,
      });

      mockDailySteps = [
        { user_id: userId, date: '2026-11-01', steps: 1950000 },
        { user_id: userId, date: '2026-11-02', steps: 60000 },
      ]; // Total 2,010,000

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.lifetimeSteps).toBe(2010000);
      expect(result.awardedLevels).toEqual(['Strider']);
      expect(result.highestLevel).toBe('Strider');
      expect(mockProfile.sabi_level).toBe('Strider');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'sabi_level_up',
          title: 'Level Up! 🎉',
          body: "Incredible work! You've reached Strider. Your consistency has made movement a meaningful part of your everyday lifestyle!",
          channel: 'push_only',
        })
      );
    });

    it('detects and awards Champion when crossing 3,000,000 steps', async () => {
      mockProfile.sabi_level = 'Strider';
      mockUserAchievements.push(
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_mover' },
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_strider' }
      );

      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 3050000 }];

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.awardedLevels).toEqual(['Champion']);
      expect(result.highestLevel).toBe('Champion');
      expect(mockProfile.sabi_level).toBe('Champion');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'sabi_level_up',
          title: 'Level Up! 🎉',
          body: "You're now a Champion! Your discipline, dedication, and commitment to your goals have brought you this far. Keep pushing forward!",
          channel: 'push_only',
        })
      );
    });

    it('detects and awards Legend when crossing 4,000,000 steps', async () => {
      mockProfile.sabi_level = 'Champion';
      mockUserAchievements.push(
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_mover' },
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_strider' },
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_champion' }
      );

      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 4100000 }];

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.awardedLevels).toEqual(['Legend']);
      expect(result.highestLevel).toBe('Legend');
      expect(mockProfile.sabi_level).toBe('Legend');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'sabi_level_up',
          title: 'Level Up! 🎉',
          body: "Legendary! You've reached the highest Sabi Level. You've built a lifestyle driven by movement, discipline, and continuous progress. You've earned this!",
          channel: 'push_only',
        })
      );
    });
  });

  describe('Multi-Milestone Crossing in Strictly Ascending Order', () => {
    it('dispatches Mover then Strider in order when crossing both thresholds in one sync', async () => {
      // User was Starter, jumps from 900,000 to 2,150,000 steps
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 2150000 }];

      const calls: string[] = [];
      jest.spyOn(dispatcherModule, 'dispatchNotification').mockImplementation(async (input) => {
        calls.push(input.data?.params?.level);
        return {
          inAppCreated: false,
          unreadCount: 0,
          pushAttempts: 1,
          pushTicketsCount: 1,
          emailSent: false,
        };
      });

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.awardedLevels).toEqual(['Mover', 'Strider']);
      expect(calls).toEqual(['Mover', 'Strider']);
      expect(result.highestLevel).toBe('Strider');
      expect(mockProfile.sabi_level).toBe('Strider');

      // Confirm both are persisted in user_achievements
      expect(mockUserAchievements.some((a) => a.badge_key === 'sabi_level_mover')).toBe(true);
      expect(mockUserAchievements.some((a) => a.badge_key === 'sabi_level_strider')).toBe(true);
    });

    it('dispatches Mover -> Strider -> Champion -> Legend in order when jumping from 0 to 4,200,000 steps', async () => {
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 4200000 }];

      const calls: string[] = [];
      jest.spyOn(dispatcherModule, 'dispatchNotification').mockImplementation(async (input) => {
        calls.push(input.data?.params?.level);
        return {
          inAppCreated: false,
          unreadCount: 0,
          pushAttempts: 1,
          pushTicketsCount: 1,
          emailSent: false,
        };
      });

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.awardedLevels).toEqual(['Mover', 'Strider', 'Champion', 'Legend']);
      expect(calls).toEqual(['Mover', 'Strider', 'Champion', 'Legend']);
      expect(result.highestLevel).toBe('Legend');
      expect(mockProfile.sabi_level).toBe('Legend');
    });
  });

  describe('Strict Push-Only Constraint & Inbox Exemption', () => {
    it('never inserts records into public.notifications and does not increment unread or badge count', async () => {
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 1100000 }];

      const sendPushSpy = jest.spyOn(expoPushService, 'sendPushChunked').mockResolvedValue([
        { message: {} as any, ticket: { status: 'ok', id: 'tick-123' } },
      ]);
      jest.spyOn(deviceService, 'getActiveDevicesForUser').mockResolvedValue(mockUserDevices as any);

      // Execute dispatch directly through notificationDispatcher with channel: 'push_only'
      const dispatchResult = await dispatchNotification({
        userId,
        type: 'sabi_level_up',
        title: 'Level Up! 🎉',
        body: "Congratulations! You've reached Mover. You've built momentum and made movement a regular part of your routine. Keep it going!",
        channel: 'push_only',
        data: {
          screen: 'SabiLevel',
          params: { level: 'Mover' },
        },
      });

      // 1. inAppCreated must be false
      expect(dispatchResult.inAppCreated).toBe(false);
      expect(dispatchResult.notificationId).toBeUndefined();

      // 2. ZERO rows created in public.notifications
      expect(mockNotifications.length).toBe(0);

      // 3. Unread count not altered
      expect(dispatchResult.unreadCount).toBe(0);

      // 4. Push message sent without modifying badge count (badge is undefined)
      expect(sendPushSpy).toHaveBeenCalledTimes(1);
      const pushMessages = sendPushSpy.mock.calls[0][0];
      expect(pushMessages.length).toBe(1);
      expect(pushMessages[0].badge).toBeUndefined(); // Crucial: badge must NOT be set/incremented
      expect(pushMessages[0].title).toBe('Level Up! 🎉');
      expect(pushMessages[0].data).toEqual(
        expect.objectContaining({
          screen: 'SabiLevel',
          params: { level: 'Mover' },
          type: 'sabi_level_up',
        })
      );
    });
  });

  describe('Duplicate Prevention, Idempotency & Concurrency', () => {
    it('does not re-dispatch push notification on repeated syncs after a level has been awarded', async () => {
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 1200000 }];

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      // First sync: award Mover
      const firstResult = await checkAndAwardSabiLevelMilestones(userId);
      expect(firstResult.awardedLevels).toEqual(['Mover']);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      dispatchSpy.mockClear();

      // Second sync with additional steps (still within Mover tier, e.g. 1,300,000)
      mockDailySteps[0].steps = 1300000;
      const secondResult = await checkAndAwardSabiLevelMilestones(userId);

      expect(secondResult.awardedLevels).toEqual([]); // No new awards
      expect(secondResult.highestLevel).toBe('Mover');
      expect(dispatchSpy).not.toHaveBeenCalled(); // No duplicate notification!
    });

    it('safely handles concurrent insert duplicate error (code 23505) without throwing or sending duplicate push', async () => {
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 1050000 }];

      // Pre-seed user_achievements to trigger simulated duplicate unique constraint in mock
      mockUserAchievements.push({
        id: 'ach-pre-existing',
        user_id: userId,
        category: 'sabi_level',
        badge_key: 'sabi_level_mover',
        target_value: 1000000,
      });

      const dispatchSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.awardedLevels).toEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not downgrade level if step recalculation yields lower steps', async () => {
      mockProfile.sabi_level = 'Champion';
      mockUserAchievements.push(
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_mover' },
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_strider' },
        { user_id: userId, category: 'sabi_level', badge_key: 'sabi_level_champion' }
      );

      // Recalculated steps are lower
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 2500000 }];

      const result = await checkAndAwardSabiLevelMilestones(userId);

      expect(result.awardedLevels).toEqual([]);
      expect(result.highestLevel).toBe('Champion');
      expect(mockProfile.sabi_level).toBe('Champion'); // Preserved without downgrade
    });
  });

  describe('Integration with Health Sync Flow', () => {
    it('triggers Sabi Level milestone check upon syncStepData', async () => {
      mockDailySteps = [{ user_id: userId, date: '2026-11-01', steps: 990000 }];

      const checkSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      await syncStepData(
        userId,
        { date: '2026-11-02', steps: 25000 }, // Crosses 1,000,000 threshold
        'test-token'
      );

      // Wait brief microtask tick for async fire-and-forget
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(checkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'sabi_level_up',
          title: 'Level Up! 🎉',
          body: expect.stringContaining("You've reached Mover"),
          channel: 'push_only',
        })
      );
    });

    it('triggers Sabi Level milestone check upon syncStepDataBatch', async () => {
      // Pre-seed 900,000 verified steps across past days (under MAX_STEPS_PER_DAY)
      mockDailySteps = [
        { user_id: userId, date: '2026-10-25', steps: 90000 },
        { user_id: userId, date: '2026-10-26', steps: 90000 },
        { user_id: userId, date: '2026-10-27', steps: 90000 },
        { user_id: userId, date: '2026-10-28', steps: 90000 },
        { user_id: userId, date: '2026-10-29', steps: 90000 },
        { user_id: userId, date: '2026-10-30', steps: 90000 },
        { user_id: userId, date: '2026-10-31', steps: 90000 },
        { user_id: userId, date: '2026-11-01', steps: 90000 },
        { user_id: userId, date: '2026-11-02', steps: 90000 },
        { user_id: userId, date: '2026-11-03', steps: 90000 },
      ]; // Total 900,000

      const checkSpy = jest.spyOn(dispatcherModule, 'dispatchNotification');

      await syncStepDataBatch(
        userId,
        [
          { date: '2026-11-04', steps: 60000 },
          { date: '2026-11-05', steps: 60000 }, // Total becomes 1,020,000
        ],
        'test-token'
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(checkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'sabi_level_up',
          title: 'Level Up! 🎉',
          body: expect.stringContaining("You've reached Mover"),
          channel: 'push_only',
        })
      );
    });
  });
});
