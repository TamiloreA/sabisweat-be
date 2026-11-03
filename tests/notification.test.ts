/**
 * Unit & Integration Tests for Notification Infrastructure V2
 */

import { isExpoPushToken } from '../src/services/deviceService';
import { normalizeCategoryKey } from '../src/services/preferenceService';
import { emailTemplates } from '../src/services/resendEmailService';
import { PUSH_CATEGORIES, EMAIL_CATEGORIES } from '../src/models/notificationModel';

describe('Notification Infrastructure V2', () => {
  describe('Expo Push Token Validation', () => {
    it('validates ExponentPushToken format', () => {
      expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
      expect(isExpoPushToken('ExpoPushToken[1234567890abcdef]')).toBe(true);
    });

    it('rejects invalid push tokens', () => {
      expect(isExpoPushToken('')).toBe(false);
      expect(isExpoPushToken('invalid-token')).toBe(false);
      expect(isExpoPushToken('ExponentPushToken[unclosed')).toBe(false);
      expect(isExpoPushToken(null as any)).toBe(false);
    });
  });

  describe('Category Key Normalization', () => {
    it('normalizes hyphenated push category slugs to canonical keys', () => {
      expect(normalizeCategoryKey('daily-steps-reminder')).toBe(PUSH_CATEGORIES.DAILY_STEP_REMINDER);
      expect(normalizeCategoryKey('streak-alerts')).toBe(PUSH_CATEGORIES.STREAK_ALERT);
      expect(normalizeCategoryKey('challenge-updates')).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(normalizeCategoryKey('rewards-earned-alerts')).toBe(PUSH_CATEGORIES.REWARD_EARNED);
    });

    it('normalizes email category slugs to canonical keys', () => {
      expect(normalizeCategoryKey('weekly-activity-summary')).toBe(EMAIL_CATEGORIES.WEEKLY_ACTIVITY_SUMMARY);
      expect(normalizeCategoryKey('coins-rewards-updates')).toBe(EMAIL_CATEGORIES.COINS_REWARD_UPDATE);
    });

    it('retains arbitrary or custom keys', () => {
      expect(normalizeCategoryKey('CUSTOM_CATEGORY')).toBe('CUSTOM_CATEGORY');
    });
  });

  describe('Resend Email Templates', () => {
    it('renders Weekly Activity Summary template with formatted statistics', () => {
      const template = emailTemplates.weeklyActivitySummary({
        userName: 'Tami',
        totalSteps: 54200,
        totalDistanceKm: 42.5,
        daysGoalAchieved: 6,
        weekRange: 'Oct 26 - Nov 01, 2026',
      });

      expect(template.subject).toContain('54,200 steps');
      expect(template.html).toContain('54,200');
      expect(template.html).toContain('42.5 km');
      expect(template.html).toContain('6/7');
      expect(template.text).toContain('54,200');
    });

    it('renders Coins Reward Update template with balance', () => {
      const template = emailTemplates.coinsRewardUpdate({
        userName: 'Tami',
        coinsEarned: 500,
        totalBalance: 3200,
        reason: 'Completed Abuja 100K Steps Challenge',
      });

      expect(template.subject).toContain('+500 Sabi Coins');
      expect(template.html).toContain('+500 Coins');
      expect(template.html).toContain('3,200 Coins');
      expect(template.text).toContain('+500 Sabi Coins');
    });
  });
});
