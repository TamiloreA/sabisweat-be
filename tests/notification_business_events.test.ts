/**
 * Unit & Integration Tests for Notification Business Events:
 * 1. Home Screen: Daily Steps & Streak Lifecycle
 * 2. Challenges Engine: Daily Step, Steps Goal, and Most Steps
 */

import { notificationTemplates, formatNumber, sanitizeImageUrl } from '../src/services/notificationTemplates';
import { getLocalParts } from '../src/services/notificationEventService';
import { PUSH_CATEGORIES } from '../src/models/notificationModel';

describe('Notification Business Events & Templates', () => {
  describe('Punctuation & Formatting Guidelines', () => {
    it('formats numbers with commas', () => {
      expect(formatNumber(10000)).toBe('10,000');
      expect(formatNumber(2150)).toBe('2,150');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(null)).toBe('0');
    });

    it('sanitizes image URLs, omitting empty or invalid URLs', () => {
      expect(sanitizeImageUrl('https://cdn.sabisweat.app/flame.png')).toBe('https://cdn.sabisweat.app/flame.png');
      expect(sanitizeImageUrl('http://cdn.sabisweat.app/flame.png')).toBe('http://cdn.sabisweat.app/flame.png');
      expect(sanitizeImageUrl('')).toBeUndefined();
      expect(sanitizeImageUrl('   ')).toBeUndefined();
      expect(sanitizeImageUrl(null)).toBeUndefined();
      expect(sanitizeImageUrl('invalid-url')).toBeUndefined();
    });

    it('ensures no titles end with full stops or exclamation marks', () => {
      const templates = [
        notificationTemplates.morningKickoff(0),
        notificationTemplates.morningKickoff(1500),
        notificationTemplates.stepMilestone50(5000),
        notificationTemplates.stepMilestone80(2000),
        notificationTemplates.dailyGoalCompleted(10000, 14),
        notificationTemplates.streakAtRisk(14, 2150),
        notificationTemplates.publicChallengeCreated('id', 'Lagos 50K'),
        notificationTemplates.clubChallengeCreated('id', 'ERC 5K', 'Eko Runners Club'),
        notificationTemplates.challengeMilestone75('id', 'Weekend Warrior'),
        notificationTemplates.leaderboardOvertake('id', 'Lagos 50K', 'Tami'),
        notificationTemplates.challengeEndingSoonMostSteps('id', 'Lagos 50K', 3),
        notificationTemplates.challengeEndingSoonStepsGoal('id', 'Lagos 50K', 2500),
        notificationTemplates.challengeEndingSoonDailyStep('id', 'Lagos 50K', 2),
        notificationTemplates.challengeCompletionChampion('id', 'Lagos 50K', 1000),
        notificationTemplates.challengeCompletionTop5('id', 'Lagos 50K', 3, 500),
        notificationTemplates.challengeCompletionParticipant('id', 'Lagos 50K'),
        notificationTemplates.challengeCompletionGoalMet('id', 'Lagos 50K', 250),
      ];

      for (const t of templates) {
        expect(t.title.endsWith('.')).toBe(false);
        expect(t.title.endsWith('!')).toBe(false);
        // Ensure no trailing full stop on bodies
        expect(t.body.endsWith('.')).toBe(false);
      }
    });
  });

  describe('Module 1: Home Screen (Daily Steps & Streaks)', () => {
    it('generates Morning Kickoff with 0 steps', () => {
      const t = notificationTemplates.morningKickoff(0);
      expect(t.category).toBe(PUSH_CATEGORIES.DAILY_STEP_REMINDER);
      expect(t.title).toBe('Good morning');
      expect(t.body).toBe("A new day is a fresh opportunity to reach your step goal. Take your first steps towards today's target");
      expect(t.data.screen).toBe('HomeTab');
      expect(t.imageUrl).toBeUndefined();
    });

    it('generates Morning Kickoff with > 0 steps', () => {
      const t = notificationTemplates.morningKickoff(1250);
      expect(t.category).toBe(PUSH_CATEGORIES.DAILY_STEP_REMINDER);
      expect(t.title).toBe("You're off to a great start");
      expect(t.body).toBe("You've already taken 1,250 steps today. Keep going towards your daily goal");
      expect(t.data.screen).toBe('HomeTab');
    });

    it('generates 50% Step Goal Milestone with optional flame image', () => {
      const t = notificationTemplates.stepMilestone50(5120, 'https://cdn.sabisweat.app/streak-flame.png');
      expect(t.category).toBe(PUSH_CATEGORIES.DAILY_STEP_REMINDER);
      expect(t.title).toBe("You're halfway to your goal");
      expect(t.body).toBe("You've reached 5,120 steps today. Keep up the momentum and take the next step towards your target");
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/streak-flame.png');
      expect(t.data.imageUrl).toBe('https://cdn.sabisweat.app/streak-flame.png');
      expect(t.data.screen).toBe('HomeTab');
    });

    it('generates 80% Step Goal Milestone without image', () => {
      const t = notificationTemplates.stepMilestone80(1800);
      expect(t.category).toBe(PUSH_CATEGORIES.DAILY_STEP_REMINDER);
      expect(t.title).toBe("You're nearly there");
      expect(t.body).toBe("Just 1,800 steps to reach your daily goal. You're making great progress");
      expect(t.data.screen).toBe('HomeTab');
      expect(t.imageUrl).toBeUndefined();
    });

    it('generates 100% Daily Goal Completed with celebratory flame', () => {
      const t = notificationTemplates.dailyGoalCompleted(10000, 14, 'https://cdn.sabisweat.app/flame-celebrate.png');
      expect(t.category).toBe(PUSH_CATEGORIES.STREAK_ALERT);
      expect(t.title).toBe('Daily goal achieved');
      expect(t.body).toBe("Amazing work! You've reached your 10,000-step goal and maintained your 14-day streak. Keep building on your progress");
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/flame-celebrate.png');
      expect(t.data.screen).toBe('HomeTab');
    });

    it('generates Streak at Risk with verbatim wording', () => {
      const t = notificationTemplates.streakAtRisk(14, 2150, 'https://cdn.sabisweat.app/flame-urgent.png');
      expect(t.category).toBe(PUSH_CATEGORIES.STREAK_ALERT);
      expect(t.title).toBe('Streak at risk');
      expect(t.body).toBe('Your 14-day streak is still within reach. Complete 2,150 more steps before midnight to keep it going');
      expect(t.imageUrl).toBe('https://cdn.sabisweat.app/flame-urgent.png');
      expect(t.data.screen).toBe('HomeTab');
    });
  });

  describe('Module 2: Challenges Engine', () => {
    it('generates Public Challenge Discovery', () => {
      const t = notificationTemplates.publicChallengeCreated('c-123', 'Sabi Sweat 30-Day', 'https://images.unsplash.com/challenge.jpg');
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('A new challenge is here 🏆');
      expect(t.body).toBe('Sabi Sweat 30-Day is now open. View the challenge details and join the competition');
      expect(t.data.screen).toBe('ChallengeOverview');
      expect(t.data.params.challengeId).toBe('c-123');
      expect(t.imageUrl).toBe('https://images.unsplash.com/challenge.jpg');
    });

    it('generates Club-Private Challenge Discovery', () => {
      const t = notificationTemplates.clubChallengeCreated('c-456', 'ERC 5K Run', 'Eko Runners Club');
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('A new challenge from Eko Runners Club');
      expect(t.body).toBe('Your club has launched ERC 5K Run. Check it out and take part with your fellow members');
      expect(t.data.screen).toBe('ChallengeOverview');
      expect(t.data.params.challengeId).toBe('c-456');
    });

    it('generates Challenge 75% Milestone', () => {
      const t = notificationTemplates.challengeMilestone75('c-123', 'Weekend Warrior');
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe("You're making great progress");
      expect(t.body).toBe("You've completed 75% of Weekend Warrior. Keep going to reach your target");
      expect(t.data.screen).toBe('ChallengeOverview');
    });

    it('generates Leaderboard Overtake', () => {
      const t = notificationTemplates.leaderboardOvertake('c-123', 'Lagos 50K', 'Sarah Okon');
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('Your leaderboard position has changed');
      expect(t.body).toBe('Sarah Okon has moved ahead of you in Lagos 50K. Check the leaderboard to see the latest standings');
      expect(t.data.screen).toBe('ChallengeLeaderboard');
    });

    it('generates Challenge Ending Soon for most_steps Top 10', () => {
      const t = notificationTemplates.challengeEndingSoonMostSteps('c-123', 'Abuja Most Steps', 3);
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('The final day is approaching');
      expect(t.body).toBe("24 hours left in Abuja Most Steps. You're currently ranked #3. Keep up your progress");
    });

    it('generates Challenge Ending Soon for steps_goal (unit: steps)', () => {
      const t = notificationTemplates.challengeEndingSoonStepsGoal('c-123', 'Abuja 100K Steps', 2400);
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('24 hours left in Abuja 100K Steps');
      expect(t.body).toBe("You're just 2,400 steps away from completing this challenge. Keep going");
    });

    it('generates Challenge Ending Soon for daily_step (unit: days)', () => {
      const t = notificationTemplates.challengeEndingSoonDailyStep('c-123', '7-Day Streak Run', 1);
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('24 hours left in 7-Day Streak Run');
      expect(t.body).toBe("You're just 1 days away from completing this challenge. Keep going");
    });

    it('generates Challenge Champion reward notification for Rank #1', () => {
      const t = notificationTemplates.challengeCompletionChampion('c-123', 'Lagos City Run', 1000);
      expect(t.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(t.title).toBe('Challenge Champion');
      expect(t.body).toBe('Congratulations! You finished first in Lagos City Run. 1,000 SabiCoins have been added to your wallet');
    });

    it('generates Top 5 reward notification for Ranks #2 through #5', () => {
      const t = notificationTemplates.challengeCompletionTop5('c-123', 'Lagos City Run', 4, 200);
      expect(t.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(t.title).toBe('Congratulations on your top 5 finish');
      expect(t.body).toBe('You finished #4 in Lagos City Run. 200 SabiCoins have been added to your wallet');
    });

    it('generates Completion notification for Ranks #6 and above without coins claimed', () => {
      const t = notificationTemplates.challengeCompletionParticipant('c-123', 'Lagos City Run');
      expect(t.category).toBe(PUSH_CATEGORIES.CHALLENGE_UPDATE);
      expect(t.title).toBe('Challenge completed');
      expect(t.body).toBe('Well done on completing Lagos City Run. View the final leaderboard to see the results');
      expect(t.body).not.toContain('SabiCoins');
      expect(t.body).not.toContain('wallet');
    });

    it('generates Goal-Based completion notification with coins & badge', () => {
      const t = notificationTemplates.challengeCompletionGoalMet('c-123', '30-Day Step Challenge', 500);
      expect(t.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(t.title).toBe('Challenge completed');
      expect(t.body).toBe("Amazing work! You've completed 30-Day Step Challenge. 500 SabiCoins and your completion badge have been added to your account");
    });
  });

  describe('Timezone Resolution', () => {
    it('correctly resolves local wall-clock hours across multiple timezones', () => {
      // 10:00 UTC
      const fixedUtc = new Date('2026-11-09T10:00:00Z');

      // Lagos is UTC+1 -> 11:00
      const lagos = getLocalParts(fixedUtc, 'Africa/Lagos');
      expect(lagos.hour).toBe(11);
      expect(lagos.dateStr).toBe('2026-11-09');

      // London is UTC+0 (in November) -> 10:00
      const london = getLocalParts(fixedUtc, 'Europe/London');
      expect(london.hour).toBe(10);
      expect(london.dateStr).toBe('2026-11-09');

      // New York is UTC-5 (in November) -> 05:00
      const ny = getLocalParts(fixedUtc, 'America/New_York');
      expect(ny.hour).toBe(5);
      expect(ny.dateStr).toBe('2026-11-09');

      // Tokyo is UTC+9 -> 19:00
      const tokyo = getLocalParts(fixedUtc, 'Asia/Tokyo');
      expect(tokyo.hour).toBe(19);
      expect(tokyo.dateStr).toBe('2026-11-09');
    });
  });
});
