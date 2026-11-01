export interface StepMilestoneItem {
  id: string;
  title: string;
  threshold: number;
  displayValue: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface StepMilestonesCategory {
  currentProgress: number;
  items: StepMilestoneItem[];
}

export interface DailyStreakItem {
  id: string;
  title: string;
  threshold: number;
  displayValue: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface DailyStreaksCategory {
  currentStreak: number;
  longestStreak: number;
  items: DailyStreakItem[];
}

export interface MonthlyBadgeItem {
  id: string;
  title: string;
  subtitle: string;
  month: string;
  threshold: number;
  tier: 'tier_1' | 'tier_2';
  earned: boolean;
  earnedAt: string | null;
}

export interface MonthlyBadgesCategory {
  activeMonth: string;
  items: MonthlyBadgeItem[];
}

export interface InviteBadgeItem {
  id: string;
  title: string;
  threshold: number;
  displayValue: string;
  subValue?: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface InviteBadgesCategory {
  successfulReferralCount: number;
  items: InviteBadgeItem[];
}

export interface ChallengeCompletedItem {
  id: string;
  challengeId: string;
  title: string;
  subtitle: string;
  rewardId: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface ChallengesCompletedCategory {
  totalCompleted: number;
  items: ChallengeCompletedItem[];
}

export interface AchievementSummaryData {
  stepMilestones: StepMilestonesCategory;
  dailyStreaks: DailyStreaksCategory;
  monthlyBadges: MonthlyBadgesCategory;
  inviteBadges: InviteBadgesCategory;
  challengesCompleted: ChallengesCompletedCategory;
}

export interface AchievementSummaryResponse {
  status: 'success' | 'error';
  data: AchievementSummaryData;
}

export interface CompletedChallengeDetail {
  id: string;
  challengeId: string;
  title: string;
  subtitle: string;
  rewardId: string;
  rewardText: string;
  startAt: string;
  endAt: string;
  completedAt: string;
  claimedAt: string | null;
  finalSteps: number;
  stepsContributed: number;
  goalSteps: number;
  percentage: number;
}

export interface CompletedChallengesResponse {
  status: 'success' | 'error';
  success?: boolean;
  data: CompletedChallengeDetail[];
}

export interface UserAchievementRecord {
  id?: string;
  user_id: string;
  category: string;
  badge_key: string;
  earned_at: string | null;
  progress_value?: number;
  target_value: number;
  month_period?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}
