/**
 * Challenge Model Types
 *
 * TypeScript interfaces for the challenges domain.
 */

export interface ChallengeRow {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  reward_text: string | null;
  hero_image_url: string | null;
  challenge_image: string | null;
  rules: string[] | null;
  goals: string[] | null;
  sponsor_text: string | null;
  city_tag: string | null;
  country: string | null;
  region: string | null;
  goal_type: string | null;
  goal_value: number | null;
  max_participants: number | null;
  host_name: string | null;
  host_logo_url: string | null;
  host_club_id: string | null;
  start_at: string;
  end_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeParticipantRow {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  claimed_at: string | null;
}

export interface ChallengeProgress {
  steps: number;
  distanceMeters: number;
  percent: number;
  todaySteps: number;
  daysCompleted: number;
  daysCompletedRaw: number;
  bonusDaysAdded: number;
  challengeTotalDays: number;
  evaluatedDays: number;
  daysRemaining: number;
}

export interface ChallengeHost {
  name: string;
  logoUrl?: string;
  clubId?: string;
}

export interface ChallengeResponse {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  rewardText: string;
  heroImageUrl?: string;
  challengeImage?: string;
  rules?: string[];
  goals?: string[];
  host?: ChallengeHost;
  sponsorText?: string;
  cityTag?: string;
  country?: string;
  region?: string;
  startAt: string;
  endAt: string;
  goalType?: string;
  goalValue?: number;
  participantsCount: number;
  maxParticipants?: number;
  joined: boolean;
  joinedAt?: string;
  eligible?: boolean;
  canClaim?: boolean;
  claimedAt?: string | null;
  progress?: ChallengeProgress;
}

export interface LeaderboardEntry {
  rank: number;
  user: {
    id: string;
    username?: string;
    displayName?: string;
    photoUrl?: string;
    avatarId?: string;
  };
  steps: number;
  score?: string;
}

export interface LeaderboardResponse {
  page: number;
  size: number;
  total: number;
  data: LeaderboardEntry[];
}
