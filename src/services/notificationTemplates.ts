/**
 * Notification Templates and Payloads
 * Centralized templates for Home Screen (Daily Steps & Streaks) and Challenges Engine.
 *
 * Strict style guidelines:
 * - Titles: No trailing full stops or exclamation marks. Clean and concise.
 * - Bodies: No trailing full stops. Normal internal punctuation. No unnecessary exclamation marks.
 * - Streak at Risk copy preserved verbatim.
 */

import { PUSH_CATEGORIES } from '../models/notificationModel';

export function formatNumber(val: number | string | undefined | null): string {
  const num = typeof val === 'string' ? Number(val) : val;
  if (num === undefined || num === null || isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

/**
 * Resolves optional CDN image URL, filtering out empty or invalid strings.
 */
export function sanitizeImageUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return undefined;
  return trimmed;
}

export interface NotificationPayloadTemplate {
  category: string;
  title: string;
  body: string;
  imageUrl?: string;
  data: Record<string, any>;
}

export const notificationTemplates = {
  // ─── Module 1: Home Screen (Daily Steps & Streaks) ─────────────────

  /**
   * 1. Morning Kickoff — 7:00 AM Local Time
   */
  morningKickoff(steps: number): NotificationPayloadTemplate {
    if (steps > 0) {
      return {
        category: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
        title: "You're off to a great start",
        body: `You've already taken ${formatNumber(steps)} steps today. Keep going towards your daily goal`,
        data: { screen: 'HomeTab' },
      };
    }

    return {
      category: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
      title: 'Good morning',
      body: "A new day is a fresh opportunity to reach your step goal. Take your first steps towards today's target",
      data: { screen: 'HomeTab' },
    };
  },

  /**
   * 2. 50% Step Goal Milestone
   */
  stepMilestone50(currentSteps: number, flameImageUrl?: string): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(flameImageUrl || process.env.CDN_STREAK_FLAME_ACTIVE);
    return {
      category: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
      title: "You're halfway to your goal",
      body: `You've reached ${formatNumber(currentSteps)} steps today. Keep up the momentum and take the next step towards your target`,
      imageUrl: validImage,
      data: {
        screen: 'HomeTab',
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 3. 80% Step Goal Milestone
   */
  stepMilestone80(remainingSteps: number): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
      title: "You're nearly there",
      body: `Just ${formatNumber(remainingSteps)} steps to reach your daily goal. You're making great progress`,
      data: { screen: 'HomeTab' },
    };
  },

  /**
   * 4. 100% Daily Goal Completed
   */
  dailyGoalCompleted(goal: number, streakDays: number, celebrationImageUrl?: string): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(celebrationImageUrl || process.env.CDN_STREAK_FLAME_CELEBRATION);
    return {
      category: PUSH_CATEGORIES.STREAK_ALERT,
      title: 'Daily goal achieved',
      body: `Amazing work! You've reached your ${formatNumber(goal)}-step goal and maintained your ${formatNumber(streakDays)}-day streak. Keep building on your progress`,
      imageUrl: validImage,
      data: {
        screen: 'HomeTab',
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 5. Streak at Risk — 8:30 PM Local Time
   * Strictly verbatim wording per requirement.
   */
  streakAtRisk(streakDays: number, remainingSteps: number, urgentImageUrl?: string): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(urgentImageUrl || process.env.CDN_STREAK_FLAME_URGENT);
    return {
      category: PUSH_CATEGORIES.STREAK_ALERT,
      title: 'Streak at risk',
      body: `Your ${formatNumber(streakDays)}-day streak is still within reach. Complete ${formatNumber(remainingSteps)} more steps before midnight to keep it going`,
      imageUrl: validImage,
      data: {
        screen: 'HomeTab',
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  // ─── Module 2: Challenges Engine ───────────────────────────────────

  /**
   * 1. Public Challenge Discovery (whoCanJoin = 'everyone')
   */
  publicChallengeCreated(challengeId: string, challengeTitle: string, imageUrl?: string): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: 'A new challenge is here 🏆',
      body: `${challengeTitle} is now open. View the challenge details and join the competition`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 1. Club-Private Challenge Discovery (whoCanJoin = 'club_members')
   */
  clubChallengeCreated(
    challengeId: string,
    challengeTitle: string,
    clubName: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: `A new challenge from ${clubName}`,
      body: `Your club has launched ${challengeTitle}. Check it out and take part with your fellow members`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 2. Challenge Milestone — 75% Completion
   */
  challengeMilestone75(challengeId: string, challengeTitle: string): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: "You're making great progress",
      body: `You've completed 75% of ${challengeTitle}. Keep going to reach your target`,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
      },
    };
  },

  /**
   * 3. Leaderboard Overtake (Club Challenges Only)
   */
  leaderboardOvertake(
    challengeId: string,
    challengeTitle: string,
    overtakerName: string
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: 'Your leaderboard position has changed',
      body: `${overtakerName} has moved ahead of you in ${challengeTitle}. Check the leaderboard to see the latest standings`,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
      },
    };
  },

  /**
   * 4. Challenge Ending Soon — 24 Hours Remaining (most_steps Top 10)
   */
  challengeEndingSoonMostSteps(
    challengeId: string,
    challengeTitle: string,
    rank: number
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: 'The final day is approaching',
      body: `24 hours left in ${challengeTitle}. You're currently ranked #${rank}. Keep up your progress`,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
      },
    };
  },

  /**
   * 4. Challenge Ending Soon — 24 Hours Remaining (steps_goal >= 90%)
   */
  challengeEndingSoonStepsGoal(
    challengeId: string,
    challengeTitle: string,
    remainingSteps: number
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: `24 hours left in ${challengeTitle}`,
      body: `You're just ${formatNumber(remainingSteps)} steps away from completing this challenge. Keep going`,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
      },
    };
  },

  /**
   * 4. Challenge Ending Soon — 24 Hours Remaining (daily_step >= 90%)
   */
  challengeEndingSoonDailyStep(
    challengeId: string,
    challengeTitle: string,
    remainingDays: number
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: `24 hours left in ${challengeTitle}`,
      body: `You're just ${remainingDays} days away from completing this challenge. Keep going`,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
      },
    };
  },

  /**
   * 5. Challenge Completion — Champion (Rank #1)
   */
  challengeCompletionChampion(
    challengeId: string,
    challengeTitle: string,
    sabiCoins: number
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.REWARD_EARNED,
      title: 'Challenge Champion',
      body: `Congratulations! You finished first in ${challengeTitle}. ${formatNumber(sabiCoins)} SabiCoins have been added to your wallet`,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
      },
    };
  },

  /**
   * 5. Challenge Completion — Top 5 (Ranks #2 to #5)
   */
  challengeCompletionTop5(
    challengeId: string,
    challengeTitle: string,
    rank: number,
    sabiCoins: number
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.REWARD_EARNED,
      title: 'Congratulations on your top 5 finish',
      body: `You finished #${rank} in ${challengeTitle}. ${formatNumber(sabiCoins)} SabiCoins have been added to your wallet`,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
      },
    };
  },

  /**
   * 5. Challenge Completion — Ranks #6 and above
   * No SabiCoins claimed or implied.
   */
  challengeCompletionParticipant(
    challengeId: string,
    challengeTitle: string
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: 'Challenge completed',
      body: `Well done on completing ${challengeTitle}. View the final leaderboard to see the results`,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
      },
    };
  },

  /**
   * 5. Challenge Completion — Goal-Based (steps_goal & daily_step 100%)
   */
  challengeCompletionGoalMet(
    challengeId: string,
    challengeTitle: string,
    sabiCoins: number
  ): NotificationPayloadTemplate {
    return {
      category: PUSH_CATEGORIES.REWARD_EARNED,
      title: 'Challenge completed',
      body: `Amazing work! You've completed ${challengeTitle}. ${formatNumber(sabiCoins)} SabiCoins and your completion badge have been added to your account`,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
      },
    };
  },
};
