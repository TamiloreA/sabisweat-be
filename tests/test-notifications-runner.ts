/**
 * Direct Verification Script for Notification Infrastructure V2
 * Run via: npx tsx tests/test-notifications-runner.ts
 */

import { isExpoPushToken } from '../src/services/deviceService';
import { normalizeCategoryKey } from '../src/services/preferenceService';
import { emailTemplates } from '../src/services/resendEmailService';
import { PUSH_CATEGORIES, EMAIL_CATEGORIES } from '../src/models/notificationModel';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Starting Notification Infrastructure V2 Verification Tests...\n');

  // 1. Expo Token Validation
  console.log('--- 1. Expo Token Validation ---');
  assert(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), 'Valid ExponentPushToken format');
  assert(isExpoPushToken('ExpoPushToken[1234567890abcdef]'), 'Valid ExpoPushToken format');
  assert(!isExpoPushToken(''), 'Rejects empty token');
  assert(!isExpoPushToken('random-string-token'), 'Rejects arbitrary string token');
  assert(!isExpoPushToken('ExponentPushToken[unclosed'), 'Rejects unclosed token');

  // 2. Category Normalization
  console.log('\n--- 2. Category Normalization ---');
  assert(
    normalizeCategoryKey('daily-steps-reminder') === PUSH_CATEGORIES.DAILY_STEP_REMINDER,
    'Maps daily-steps-reminder to DAILY_STEP_REMINDER'
  );
  assert(
    normalizeCategoryKey('streak-alerts') === PUSH_CATEGORIES.STREAK_ALERT,
    'Maps streak-alerts to STREAK_ALERT'
  );
  assert(
    normalizeCategoryKey('challenge-updates') === PUSH_CATEGORIES.CHALLENGE_UPDATE,
    'Maps challenge-updates to CHALLENGE_UPDATE'
  );
  assert(
    normalizeCategoryKey('rewards-earned-alerts') === PUSH_CATEGORIES.REWARD_EARNED,
    'Maps rewards-earned-alerts to REWARD_EARNED'
  );
  assert(
    normalizeCategoryKey('weekly-activity-summary') === EMAIL_CATEGORIES.WEEKLY_ACTIVITY_SUMMARY,
    'Maps weekly-activity-summary to WEEKLY_ACTIVITY_SUMMARY'
  );
  assert(
    normalizeCategoryKey('coins-rewards-updates') === EMAIL_CATEGORIES.COINS_REWARD_UPDATE,
    'Maps coins-rewards-updates to COINS_REWARD_UPDATE'
  );

  // 3. Email Template Rendering
  console.log('\n--- 3. Email Template Rendering ---');
  const weekly = emailTemplates.weeklyActivitySummary({
    userName: 'Tamilore',
    totalSteps: 72450,
    totalDistanceKm: 56.8,
    daysGoalAchieved: 7,
    weekRange: 'Oct 26 - Nov 01, 2026',
  });
  assert(weekly.subject.includes('72,450 steps'), 'Weekly summary subject contains formatted steps');
  assert(weekly.html.includes('56.8 km'), 'Weekly summary HTML contains formatted distance');
  assert(weekly.html.includes('7/7'), 'Weekly summary HTML contains goal achieved count');

  const coins = emailTemplates.coinsRewardUpdate({
    userName: 'Tamilore',
    coinsEarned: 1000,
    totalBalance: 4500,
    reason: 'Monthly Step Champion Badge',
  });
  assert(coins.subject.includes('1000 Sabi Coins'), 'Coins reward subject contains coin count');
  assert(coins.html.includes('+1000 Coins'), 'Coins reward HTML contains coins badge');
  assert(coins.html.includes('4,500 Coins'), 'Coins reward HTML contains total balance');

  console.log('\n🎉 ALL 15 NOTIFICATION VERIFICATION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
