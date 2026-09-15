/**
 * Onboarding Model — Type definitions for onboarding API
 */

import type { OnboardingStatus } from './authModel';

export type Gender = 'Man' | 'Woman' | 'Others';

export type MainGoal =
  | 'Build Consistency'
  | 'Improve Fitness'
  | 'Join a Challenge'
  | 'Unlock Rewards by Stepping'
  | 'Be part of community';

export type MovementRelationship = 'NONE' | 'POOR' | 'OCCASIONAL' | 'CONSISTENT';

export type WalkingFrequency = 'Rarely' | '1-2x weekly' | '3-5x weekly' | 'Daily';

export interface OnboardingProfile {
  userId: string;
  referralCode: string | null;
  onboardingStatus: OnboardingStatus;
  leaderboardVisible: boolean;
  sharingDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SetBasicIdentityRequest {
  firstName: string;
  lastName: string;
  dob: string;
  gender: Gender;
  referralCode?: string;
}

export interface SetBasicIdentityResponse extends OnboardingProfile {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
}

export interface SetGoalsRequest {
  mainGoal: MainGoal;
  walkingFrequency: WalkingFrequency;
  startingGoal: number;
}

export interface SetGoalsResponse extends OnboardingProfile {
  mainGoal: MainGoal;
  walkingFrequency: WalkingFrequency;
  startingGoal: number;
}

export interface SetIdentityRequest {
  username: string;
  photoBase64?: string;
  avatarId?: string;
  city: string;
  leaderboardVisible: boolean;
  sharingDefault: boolean;
}

export interface SetIdentityResponse extends OnboardingProfile {
  username: string;
  photoBase64?: string;
  avatarId?: string;
  city: string;
  leaderboardVisible: boolean;
  sharingDefault: boolean;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  city?: string;
  bio?: string;
}

export interface UpdateProfileResponse extends OnboardingProfile {
  firstName?: string;
  lastName?: string;
  city?: string;
}

/**
 * Database row shape (snake_case from Supabase)
 */
export interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  date_of_birth: string | null;
  gender: string | null;
  movement_relationship: string | null;
  main_goal: string | null;
  walking_frequency: string | null;
  step_goal: number | null;
  avatar_id: string | null;
  photo_url: string | null;
  photo_base64: string | null;
  city: string | null;
  referral_code: string | null;
  race: string | null;
  specific_subgroup: string | null;
  country: string | null;
  region: string | null;
  bio: string | null;
  has_password: boolean;
  onboarding_status: string;
  leaderboard_visible: boolean;
  sharing_default: boolean;
  sabi_level: string | null;
  steps_count: number;
  points_balance: number;
  streak_count: number;
  finished_onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}
