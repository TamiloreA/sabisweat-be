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
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) return undefined;
  return trimmed;
}

/**
 * Resolves challenge notification image priority:
 * 1. Prioritize `challengeImage` whenever it is available.
 * 2. If `challengeImage` is unavailable, fall back to the existing `heroImageBase64`.
 * 3. If neither is available, send the notification without an image (returns undefined).
 */
export function resolveChallengeNotificationImage(
  challenge: {
    challenge_image?: string | null;
    challengeImage?: string | null;
    hero_image_base64?: string | null;
    heroImageBase64?: string | null;
    hero_image_url?: string | null;
  } | null | undefined
): string | undefined {
  if (!challenge) return undefined;

  const challengeImage = challenge.challengeImage || challenge.challenge_image;
  if (challengeImage && typeof challengeImage === 'string' && challengeImage.trim().length > 0) {
    return challengeImage.trim();
  }

  const heroImage = challenge.heroImageBase64 || challenge.hero_image_base64 || challenge.hero_image_url;
  if (heroImage && typeof heroImage === 'string' && heroImage.trim().length > 0) {
    return heroImage.trim();
  }

  return undefined;
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
      title: 'Daily Goal Achieved',
      body: `You've reached ${formatNumber(goal)} step goal and kept your ${formatNumber(streakDays)}-day streak going 🥳`,
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
  publicChallengeCreated(
    challengeId: string,
    challengeTitle: string,
    clubNameOrImageUrl?: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    let clubName = 'Sabi Sweat';
    let image = imageUrl;
    if (clubNameOrImageUrl) {
      if (
        clubNameOrImageUrl.startsWith('http://') ||
        clubNameOrImageUrl.startsWith('https://') ||
        clubNameOrImageUrl.startsWith('data:image/')
      ) {
        image = clubNameOrImageUrl;
      } else {
        clubName = clubNameOrImageUrl;
      }
    }
    const validImage = sanitizeImageUrl(image);
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: 'New Challenge',
      body: `${clubName} just created ${challengeTitle}. Check it out and join the competition.`,
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
      title: 'New Challenge',
      body: `${clubName} just created ${challengeTitle}. Check it out and join the competition.`,
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
  challengeMilestone75(challengeId: string, challengeTitle: string, imageUrl?: string): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: "You're making great progress",
      body: `You've completed 75% of ${challengeTitle}. Keep going to reach your target`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
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
    sabiCoins: number,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.REWARD_EARNED,
      title: 'Challenge Champion',
      body: `Congratulations! You finished first in ${challengeTitle}. ${formatNumber(sabiCoins)} SabiCoins have been added to your wallet`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
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
    sabiCoins: number,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.REWARD_EARNED,
      title: 'Congratulations on your top 5 finish',
      body: `You finished #${rank} in ${challengeTitle}. ${formatNumber(sabiCoins)} SabiCoins have been added to your wallet`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 5. Challenge Completion — Ranks #6 and above
   * No SabiCoins claimed or implied.
   */
  challengeCompletionParticipant(
    challengeId: string,
    challengeTitle: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.CHALLENGE_UPDATE,
      title: 'Challenge completed',
      body: `Well done on completing ${challengeTitle}. View the final leaderboard to see the results`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeLeaderboard',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 5. Challenge Completion — Goal-Based (steps_goal & daily_step 100%)
   */
  challengeCompletionGoalMet(
    challengeId: string,
    challengeTitle: string,
    sabiCoinsOrImageUrl?: number | string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    let image = imageUrl;
    if (typeof sabiCoinsOrImageUrl === 'string') {
      image = sabiCoinsOrImageUrl;
    }
    const validImage = sanitizeImageUrl(image);
    return {
      category: PUSH_CATEGORIES.REWARD_EARNED,
      title: 'Challenge Reward',
      body: `You've earned a reward for completing ${challengeTitle}. It's ready to claim.`,
      imageUrl: validImage,
      data: {
        screen: 'ChallengeOverview',
        params: { challengeId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 5. Challenge Reward
   */
  challengeReward(
    challengeId: string,
    challengeTitle: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    return this.challengeCompletionGoalMet(challengeId, challengeTitle, undefined, imageUrl);
  },

  // ─── Module 3: Community & Clubs Engine ─────────────────────────────

  /**
   * 1. Club Announcements
   * Primary Title: [Club Name] shared a new announcement
   * Fallback Title: [Announcement Title]
   */
  clubAnnouncementCreated(
    clubId: string,
    clubName: string | null | undefined,
    announcementTitle: string | null | undefined,
    content: string,
    clubImageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(clubImageUrl);
    const title = clubName && clubName.trim()
      ? `${clubName.trim()} shared a new announcement`
      : (announcementTitle?.trim() || 'New Announcement');
    const body = content.trim().slice(0, 100).replace(/\.+$/, '');

    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title,
      body,
      imageUrl: validImage,
      data: {
        screen: 'ClubAnnouncement',
        params: { clubId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 2. Standard Club Posts
   * Title: [Post Title] if exists, else [Author Name] in [Club Name]
   * Body: First 80–100 characters of post content
   */
  clubPostCreated(
    postId: string,
    clubId: string,
    postTitle: string | null | undefined,
    authorName: string,
    clubName: string,
    content: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    const title = postTitle && postTitle.trim()
      ? postTitle.trim()
      : `${authorName.trim()} in ${clubName.trim()}`;
    const body = content.trim().slice(0, 100).replace(/\.+$/, '');

    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title,
      body,
      imageUrl: validImage,
      data: {
        screen: 'PostDetail',
        params: { postId, clubId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 3. Join Club Request (Private / Invite-Only Clubs)
   * Sent to Club Admins and Owner
   */
  joinClubRequest(
    clubId: string,
    userName: string,
    clubName: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title: 'New Member Request',
      body: `${userName.trim()} requested to join ${clubName.trim()}`,
      imageUrl: validImage,
      data: {
        type: 'community_club_join_request',
        screen: 'JoinClubRequest',
        params: { clubId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 4. Join Club Request Approved
   * Sent to the user whose membership was approved
   */
  joinClubApproved(
    clubId: string,
    clubName: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title: `Welcome to ${clubName.trim()}`,
      body: 'Your request to join has been approved. Start moving with the club',
      imageUrl: validImage,
      data: {
        screen: 'ClubDetail',
        params: { clubId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 5. New Club Event Scheduled
   * Sent to active club members
   */
  clubEventCreated(
    eventId: string,
    clubId: string,
    eventTitle: string,
    clubName: string,
    eventDateStr: string,
    imageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(imageUrl);
    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title: eventTitle.trim(),
      body: `New event scheduled in ${clubName.trim()} on ${eventDateStr}`,
      imageUrl: validImage,
      data: {
        screen: 'ClubEventDetail',
        params: { eventId, clubId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 6. Post Likes (Grouped Anti-Spam)
   * Single like: [User Name] liked your post
   * Grouped likes (2+): [User Name] and [X] others liked your post
   * Image: latest post image ONLY (no avatar fallback)
   */
  postLike(
    postId: string,
    latestLikerName: string,
    otherLikersCount: number = 0,
    postImageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(postImageUrl);
    const body = otherLikersCount > 0
      ? `${latestLikerName.trim()} and ${otherLikersCount} others liked your post`
      : `${latestLikerName.trim()} liked your post`;

    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title: 'Post',
      body,
      imageUrl: validImage,
      data: {
        screen: 'PostDetail',
        params: { postId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },

  /**
   * 7. Post Comments & Replies
   * Top-level: [User Name] commented on your post
   * Nested reply: [User Name] replied to your comment
   * Image: latest post image ONLY (no avatar fallback)
   */
  postComment(
    postId: string,
    commenterName: string,
    text: string,
    isReply: boolean = false,
    postImageUrl?: string
  ): NotificationPayloadTemplate {
    const validImage = sanitizeImageUrl(postImageUrl);
    const title = isReply
      ? `${commenterName.trim()} replied to your comment`
      : `${commenterName.trim()} commented on your post`;
    const body = text.trim().slice(0, 80).replace(/\.+$/, '');

    return {
      category: PUSH_CATEGORIES.COMMUNITY_UPDATE,
      title,
      body,
      imageUrl: validImage,
      data: {
        screen: 'PostDetail',
        params: { postId },
        ...(validImage ? { imageUrl: validImage } : {}),
      },
    };
  },
};
