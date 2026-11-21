import { supabase } from '../src/config/database';
import * as dispatcher from '../src/services/notificationDispatcher';
import * as preferenceService from '../src/services/preferenceService';
import {
  classifyStepBand,
  computeStepMetrics,
  getEligibleStepVariations,
  renderStepCopyVariation,
  selectLeastRecentlyShownVariation,
  STEP_COPY_VARIATIONS,
} from '../src/services/stepNotificationCopy';
import {
  evaluateAndSendStepReminder,
  evaluateStepReminderDecision,
  evaluateStepSyncReminder,
  getCheckInSlotForHour,
  isStepRowFresh,
  isWithinQuietHours,
  processStepCheckInJob,
  type StepReminderHistory,
} from '../src/services/stepNotificationService';

function emptyHistory(): StepReminderHistory {
  return { todaySends: [], lastShownAtByKey: new Map() };
}

describe('Sabi Sweat Step Notifications', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Progress band classification & metrics (unrounded ratio, ceil halfway, floor %)', () => {
    it('classifies every boundary for an 8,000-step goal accurately', () => {
      expect(classifyStepBand(null, 8000)).toBe('unknown');
      expect(classifyStepBand(0, 8000)).toBe('zero');
      expect(classifyStepBand(1, 8000)).toBe('below_half');
      expect(classifyStepBand(3999, 8000)).toBe('below_half');
      expect(classifyStepBand(4000, 8000)).toBe('halfway');
      expect(classifyStepBand(7199, 8000)).toBe('halfway');
      expect(classifyStepBand(7200, 8000)).toBe('near_goal');
      expect(classifyStepBand(7999, 8000)).toBe('near_goal');
      expect(classifyStepBand(8000, 8000)).toBe('completed');
      expect(classifyStepBand(9500, 8000)).toBe('completed');
    });

    it('rounds halfway UP and displayed percentage DOWN while classifying on unrounded ratio', () => {
      const m1 = computeStepMetrics(3750, 7501);
      expect(m1.half).toBe(3751);
      expect(m1.toHalf).toBe(1);
      expect(classifyStepBand(3750, 7501)).toBe('below_half');
      expect(classifyStepBand(3751, 7501)).toBe('halfway');

      // 7,199 / 8,000 = 89.9875% -> floored to 89%, still in halfway band
      const m2 = computeStepMetrics(7199, 8000);
      expect(m2.percent).toBe(89);
      expect(m2.remaining).toBe(801);
      expect(classifyStepBand(7199, 8000)).toBe('halfway');
    });
  });

  describe('2. Copy pools, personalisation, missing-name comma removal & singular/plural', () => {
    it('renders "1 step to halfway" singular at 3,999 / 8,000', () => {
      const v = STEP_COPY_VARIATIONS.find((x) => x.key === 'afternoon_below_half_1')!;
      const rendered = renderStepCopyVariation(v, {
        steps: 3999,
        goal: 8000,
        firstName: 'Debbie',
        locale: 'en-US',
      });
      expect(rendered.title).toBe('1 step to halfway');
      expect(rendered.body).toBe('You’ve logged 3,999 so far today.');
    });

    it('renders singular "1 step" on near-goal copy when 1 step remains', () => {
      const v = STEP_COPY_VARIATIONS.find((x) => x.key === 'near_goal_1')!;
      const rendered = renderStepCopyVariation(v, {
        steps: 7999,
        goal: 8000,
        locale: 'en-US',
      });
      expect(rendered.title).toBe('1 step to close your ring');
      expect(rendered.body).toBe('You’ve logged 7,999. Bring it home.');
    });

    it('removes both {name} and its comma cleanly when first name is absent', () => {
      const cases: Array<{ key: string; expectedTitle: string; expectedBody: string }> = [
        {
          key: 'afternoon_zero_4',
          expectedTitle: 'Ready?',
          expectedBody: 'Pick a spot nearby and walk there. The first step counts.',
        },
        {
          key: 'afternoon_below_half_3',
          expectedTitle: 'Halfway is 4,000 steps',
          expectedBody: 'You’re 400 away.',
        },
        {
          key: 'afternoon_halfway_3',
          expectedTitle: 'Look at that ring',
          expectedBody: 'You’re 62% of the way there.',
        },
        {
          key: 'morning_zero_2',
          expectedTitle: 'Find your pace',
          expectedBody: 'Where will your first walk take you?',
        },
        {
          key: 'evening_started_2',
          expectedTitle: 'Your evening total',
          expectedBody: '5,000 steps so far. Choose where you go next.',
        },
        {
          key: 'near_goal_2',
          expectedTitle: 'Nearly there',
          expectedBody: 'Just 150 steps between you and a closed ring.',
        },
      ];

      for (const c of cases) {
        const variation = STEP_COPY_VARIATIONS.find((x) => x.key === c.key)!;
        const steps =
          c.key === 'afternoon_below_half_3'
            ? 3600
            : c.key === 'near_goal_2'
              ? 7850
              : c.key.includes('zero')
                ? 0
                : 5000;
        const rendered = renderStepCopyVariation(variation, {
          steps,
          goal: 8000,
          firstName: '   ',
          locale: 'en-US',
        });
        expect(rendered.title).toBe(c.expectedTitle);
        expect(rendered.body).toBe(c.expectedBody);
      }
    });

    it('includes preferred first name with comma when provided', () => {
      const v = STEP_COPY_VARIATIONS.find((x) => x.key === 'afternoon_zero_4')!;
      expect(
        renderStepCopyVariation(v, { steps: 0, goal: 8000, firstName: 'Debbie' }).title
      ).toBe('Ready, Debbie?');

      const v2 = STEP_COPY_VARIATIONS.find((x) => x.key === 'evening_started_2')!;
      expect(
        renderStepCopyVariation(v2, { steps: 5000, goal: 8000, firstName: 'Debbie' }).body
      ).toBe('5,000 steps so far, Debbie. Choose where you go next.');
    });

    it('formats numbers according to member locale', () => {
      const v = STEP_COPY_VARIATIONS.find((x) => x.key === 'afternoon_halfway_1')!;
      const renderedDe = renderStepCopyVariation(v, {
        steps: 5200,
        goal: 8000,
        locale: 'de-DE',
      });
      expect(renderedDe.body).toBe('You’ve covered 5.200 of your 8.000 steps.');
    });

    it('excludes afternoon-specific copy in morning and includes time-neutral zero options in morning & evening', () => {
      const morningZeroKeys = getEligibleStepVariations('morning', 'zero').map((v) => v.key);
      expect(morningZeroKeys).toContain('morning_zero_1');
      expect(morningZeroKeys).toContain('morning_zero_2');
      expect(morningZeroKeys).toContain('afternoon_zero_1');
      expect(morningZeroKeys).toContain('afternoon_zero_3');
      expect(morningZeroKeys).toContain('afternoon_zero_4');
      expect(morningZeroKeys).not.toContain('afternoon_zero_2'); // mentions "afternoon"

      const eveningZeroKeys = getEligibleStepVariations('evening', 'zero').map((v) => v.key);
      expect(eveningZeroKeys).toEqual([
        'evening_any_4',
        'afternoon_zero_1',
        'afternoon_zero_3',
        'afternoon_zero_4',
      ]);

      const eveningStartedKeys = getEligibleStepVariations('evening', 'halfway').map((v) => v.key);
      expect(eveningStartedKeys).toEqual([
        'evening_started_1',
        'evening_started_2',
        'evening_started_3',
        'evening_any_4',
      ]);
    });

    it('rotates variations by least recently shown per member', () => {
      const pool = getEligibleStepVariations('afternoon', 'below_half');
      const map = new Map<string, number>();

      // First pass: picks unseen in order
      const pick1 = selectLeastRecentlyShownVariation(pool, map);
      expect(pick1.key).toBe('afternoon_below_half_1');
      map.set(pick1.key, 1000);

      const pick2 = selectLeastRecentlyShownVariation(pool, map);
      expect(pick2.key).toBe('afternoon_below_half_2');
      map.set(pick2.key, 2000);

      const pick3 = selectLeastRecentlyShownVariation(pool, map);
      expect(pick3.key).toBe('afternoon_below_half_3');
      map.set(pick3.key, 3000);

      const pick4 = selectLeastRecentlyShownVariation(pool, map);
      expect(pick4.key).toBe('afternoon_below_half_4');
      map.set(pick4.key, 4000);

      // Fifth pass: all seen -> picks oldest (afternoon_below_half_1 at t=1000)
      const pick5 = selectLeastRecentlyShownVariation(pool, map);
      expect(pick5.key).toBe('afternoon_below_half_1');
    });
  });

  describe('3. Debbie afternoon scenario & sending rules', () => {
    it('executes the exact Debbie timeline: 14:00 (3,600) -> 18:20 (7,850) -> 19:00 silent', () => {
      const t1400 = new Date('2026-11-21T14:00:00Z').getTime();
      const t1820 = new Date('2026-11-21T18:20:00Z').getTime();
      const t1900 = new Date('2026-11-21T19:00:00Z').getTime();

      const history = emptyHistory();

      // 14:00 check-in at 3,600 / 8,000 -> "400 steps to halfway"
      const d1 = evaluateStepReminderDecision({
        trigger: 'checkin',
        slot: 'afternoon',
        steps: 3600,
        goal: 8000,
        nowMs: t1400,
        history,
        firstName: 'Debbie',
        locale: 'en-US',
      });
      expect(d1.shouldSend).toBe(true);
      if (d1.shouldSend) {
        expect(d1.band).toBe('below_half');
        expect(d1.rendered.title).toBe('400 steps to halfway');
        history.todaySends.push({
          dispatchId: 'd1',
          localDate: '2026-11-21',
          slot: 'afternoon',
          band: d1.band,
          variationKey: d1.rendered.key,
          stepCount: 3600,
          goal: 8000,
          sentAtMs: t1400,
        });
        history.lastShownAtByKey.set(d1.rendered.key, t1400);
      }

      // 18:20 sync reaches 7,850 (4h20m later) -> "150 steps to close your ring"
      const d2 = evaluateStepReminderDecision({
        trigger: 'sync',
        slot: 'any',
        steps: 7850,
        goal: 8000,
        nowMs: t1820,
        history,
        firstName: 'Debbie',
        locale: 'en-US',
      });
      expect(d2.shouldSend).toBe(true);
      if (d2.shouldSend) {
        expect(d2.band).toBe('near_goal');
        expect(d2.rendered.title).toBe('150 steps to close your ring');
        history.todaySends.push({
          dispatchId: 'd2',
          localDate: '2026-11-21',
          slot: 'sync',
          band: d2.band,
          variationKey: d2.rendered.key,
          stepCount: 7850,
          goal: 8000,
          sentAtMs: t1820,
        });
      }

      // 19:00 evening check-in stays silent
      const d3 = evaluateStepReminderDecision({
        trigger: 'checkin',
        slot: 'evening',
        steps: 7900,
        goal: 8000,
        nowMs: t1900,
        history,
        firstName: 'Debbie',
        locale: 'en-US',
      });
      expect(d3.shouldSend).toBe(false);
    });

    it('skips the second reminder if Debbie syncs straight to 8,000', () => {
      const t1400 = new Date('2026-11-21T14:00:00Z').getTime();
      const t1820 = new Date('2026-11-21T18:20:00Z').getTime();

      const history: StepReminderHistory = {
        todaySends: [
          {
            dispatchId: 'd1',
            localDate: '2026-11-21',
            slot: 'afternoon',
            band: 'below_half',
            variationKey: 'afternoon_below_half_1',
            stepCount: 3600,
            goal: 8000,
            sentAtMs: t1400,
          },
        ],
        lastShownAtByKey: new Map([['afternoon_below_half_1', t1400]]),
      };

      const d = evaluateStepReminderDecision({
        trigger: 'sync',
        slot: 'any',
        steps: 8000,
        goal: 8000,
        nowMs: t1820,
        history,
      });
      expect(d).toEqual({ shouldSend: false, reason: 'goal_completed' });
    });

    it('enforces 3-hour spacing, 2/day cap, unchanged-count skip, near-goal priority & suppression', () => {
      const t0900 = new Date('2026-11-21T09:00:00Z').getTime();
      const t1100 = new Date('2026-11-21T11:00:00Z').getTime(); // 2h after 09:00
      const t1400 = new Date('2026-11-21T14:00:00Z').getTime(); // 5h after 09:00
      const t1900 = new Date('2026-11-21T19:00:00Z').getTime();

      const history: StepReminderHistory = {
        todaySends: [
          {
            dispatchId: 'm1',
            localDate: '2026-11-21',
            slot: 'morning',
            band: 'below_half',
            variationKey: 'morning_started_1',
            stepCount: 1500,
            goal: 8000,
            sentAtMs: t0900,
          },
        ],
        lastShownAtByKey: new Map([['morning_started_1', t0900]]),
      };

      // Near-goal reached only 2 hours after 09:00 -> deferred due to 3h spacing
      expect(
        evaluateStepReminderDecision({
          trigger: 'sync',
          slot: 'any',
          steps: 7400,
          goal: 8000,
          nowMs: t1100,
          history,
        })
      ).toEqual({ shouldSend: false, reason: 'min_spacing_not_met' });

      // Afternoon check-in at unchanged step count (1,500) -> skipped
      expect(
        evaluateStepReminderDecision({
          trigger: 'checkin',
          slot: 'afternoon',
          steps: 1500,
          goal: 8000,
          nowMs: t1400,
          history,
        })
      ).toEqual({ shouldSend: false, reason: 'unchanged_step_count' });

      // Afternoon check-in at 7,400 (5h later) -> near-goal copy takes priority over afternoon copy
      const nearAtAfternoon = evaluateStepReminderDecision({
        trigger: 'checkin',
        slot: 'afternoon',
        steps: 7400,
        goal: 8000,
        nowMs: t1400,
        history,
      });
      expect(nearAtAfternoon.shouldSend).toBe(true);
      if (nearAtAfternoon.shouldSend) {
        expect(nearAtAfternoon.band).toBe('near_goal');
        expect(nearAtAfternoon.rendered.key).toMatch(/^near_goal_/);
      }

      // If 2 reminders already sent (even without near-goal), 19:00 is capped
      const cappedHistory: StepReminderHistory = {
        todaySends: [
          ...history.todaySends,
          {
            dispatchId: 'a1',
            localDate: '2026-11-21',
            slot: 'afternoon',
            band: 'halfway',
            variationKey: 'afternoon_halfway_1',
            stepCount: 5000,
            goal: 8000,
            sentAtMs: t1400,
          },
        ],
        lastShownAtByKey: new Map(),
      };
      expect(
        evaluateStepReminderDecision({
          trigger: 'checkin',
          slot: 'evening',
          steps: 7600,
          goal: 8000,
          nowMs: t1900,
          history: cappedHistory,
        })
      ).toEqual({ shouldSend: false, reason: 'daily_cap_reached' });
    });

    it('checks quiet hours (overnight and daytime) and freshness window accurately', () => {
      expect(isWithinQuietHours(23, 0, { enabled: true, start: '22:00', end: '07:00' })).toBe(true);
      expect(isWithinQuietHours(6, 30, { enabled: true, start: '22:00', end: '07:00' })).toBe(true);
      expect(isWithinQuietHours(9, 0, { enabled: true, start: '22:00', end: '07:00' })).toBe(false);
      expect(isWithinQuietHours(14, 0, { enabled: true, start: '13:00', end: '15:00' })).toBe(true);
      expect(isWithinQuietHours(14, 0, { enabled: false, start: '13:00', end: '15:00' })).toBe(false);

      const now = new Date('2026-11-21T14:00:00Z');
      expect(isStepRowFresh({ steps: 0, synced_at: '2026-11-21T13:30:00Z' }, now)).toBe(true);
      expect(isStepRowFresh({ steps: 0, synced_at: '2026-11-21T09:00:00Z' }, now)).toBe(false);
      expect(isStepRowFresh(null, now)).toBe(false);

      expect(getCheckInSlotForHour(9)).toBe('morning');
      expect(getCheckInSlotForHour(14)).toBe('afternoon');
      expect(getCheckInSlotForHour(19)).toBe('evening');
      expect(getCheckInSlotForHour(7)).toBeNull();
    });
  });

  describe('4. Pre-delivery recheck, push_only delivery, and cron execution', () => {
    it('aborts send if pre-delivery recheck shows member reached 100% right before dispatch', async () => {
      jest.spyOn(preferenceService, 'isPushCategoryEnabled').mockResolvedValue(true);
      jest.spyOn(preferenceService, 'getPreferences').mockResolvedValue({
        categories: { DAILY_STEP_REMINDER: true },
        emailCategories: {},
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        dailyCap: 10,
      });

      const dispatchSpy = jest.spyOn(dispatcher, 'dispatchNotification').mockResolvedValue({
        inAppCreated: false,
        unreadCount: 0,
        pushAttempts: 1,
        pushTicketsCount: 1,
        emailSent: false,
      });

      let stepQueryCount = 0;
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { first_name: 'Debbie', step_goal: 8000 },
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
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockImplementation(async () => {
                    stepQueryCount++;
                    // First read: 7,850 (near_goal). Pre-delivery recheck: 8,050 (completed!)
                    return {
                      data: {
                        steps: stepQueryCount === 1 ? 7850 : 8050,
                        synced_at: '2026-11-21T13:55:00Z',
                      },
                      error: null,
                    };
                  }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'notification_delivery_attempts') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const outcome = await evaluateAndSendStepReminder({
        userId: 'u-debbie',
        trigger: 'checkin',
        slot: 'afternoon',
        localDateStr: '2026-11-21',
        localHour: 14,
        localMinute: 0,
        locale: 'en-US',
        now: new Date('2026-11-21T14:00:00Z'),
      });

      expect(outcome).toEqual({ sent: false, reason: 'goal_completed' });
      expect(stepQueryCount).toBe(2);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('dispatches push_only reminder with HomeTab navigation and stepReminderMeta', async () => {
      jest.spyOn(preferenceService, 'isPushCategoryEnabled').mockResolvedValue(true);
      jest.spyOn(preferenceService, 'getPreferences').mockResolvedValue({
        categories: { DAILY_STEP_REMINDER: true },
        emailCategories: {},
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        dailyCap: 10,
      });

      const dispatchSpy = jest.spyOn(dispatcher, 'dispatchNotification').mockResolvedValue({
        inAppCreated: false,
        unreadCount: 0,
        pushAttempts: 1,
        pushTicketsCount: 1,
        emailSent: false,
      });

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'user_devices') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  data: [{ user_id: 'u-1', timezone: 'UTC', locale: 'en-GB' }],
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { first_name: 'Debbie', step_goal: 8000 },
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
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { steps: 3600, synced_at: '2026-11-21T13:50:00Z' },
                    error: null,
                  }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'notification_delivery_attempts') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const jobRes = await processStepCheckInJob(new Date('2026-11-21T14:05:00Z'));
      expect(jobRes).toEqual({ evaluated: 1, sent: 1 });
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          type: 'DAILY_STEP_REMINDER',
          title: '400 steps to halfway',
          body: 'You’ve logged 3,600 so far today.',
          channel: 'push_only',
          data: expect.objectContaining({
            screen: 'HomeTab',
            band: 'below_half',
            variationKey: 'afternoon_below_half_1',
            stepReminderMeta: expect.objectContaining({
              localDate: '2026-11-21',
              slot: 'afternoon',
              band: 'below_half',
              variationKey: 'afternoon_below_half_1',
              stepCount: 3600,
              goal: 8000,
            }),
          }),
        })
      );
    });

    it('skips historical backfill syncs in evaluateStepSyncReminder', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [{ timezone: 'UTC', locale: 'en-US' }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await evaluateStepSyncReminder(
        'u-1',
        '2026-11-20',
        7850,
        'UTC',
        new Date('2026-11-21T18:20:00Z')
      );
      expect(res).toEqual({ sent: false, reason: 'not_today' });
    });
  });
});
