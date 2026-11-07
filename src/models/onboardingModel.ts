/**
 * Onboarding Model — Type definitions for onboarding API
 */

import type { OnboardingStatus } from './authModel';
import type { StandardGender } from '../utils/genderUtils';
import type { UserPreferences } from './userPreferencesModel';

export type Gender =
  | StandardGender
  | 'Female'
  | 'Male'
  | 'Non-binary'
  | 'Prefer not to say'
  | 'Man'
  | 'Woman'
  | 'Others';

export type MainGoal =
  | 'Build Consistency'
  | 'Improve Fitness'
  | 'Join a Challenge'
  | 'Unlock Rewards by Stepping'
  | 'Be part of community';

export type MovementRelationship = 'NONE' | 'POOR' | 'OCCASIONAL' | 'CONSISTENT';

export type WalkingFrequency = 'Rarely' | '1-2x weekly' | '3-5x weekly' | 'Daily';

export interface OnboardingProfile {
  id?: string;
  userId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  gender?: string | null;
  dob?: string | null;
  dateOfBirth?: string | null;
  avatarId?: string | null;
  avatarUrl?: string | null;
  photoUrl?: string | null;
  photoBase64?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  movementRelationship?: string | null;
  race?: string | null;
  specificSubgroup?: string | null;
  referralCode: string | null;
  onboardingStatus: OnboardingStatus;
  leaderboardVisible: boolean;
  sharingDefault: boolean;
  preferences?: UserPreferences;
  sabiLevel?: string | null;
  stepsCount?: number;
  pointsBalance?: number;
  streakCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompleteOnboardingRequest {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  movementRelationship?: MovementRelationship | string | null;
  mainGoal: string;
  walkingFrequency: string;
  startingGoal: number;
  username: string;
  race?: string | null;
  specificSubgroup?: string | null;
  avatarId?: string | null;
  photoBase64?: string | null;
  country?: string | null;
  region?: string | null;
  city: string;
  referralCode?: string | null;
  preferences?: Partial<UserPreferences>;
  leaderboardVisible?: boolean;
  sharingDefault?: boolean;
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
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  bio?: string | null;
  region?: string | null;
  country?: string | null;
  avatarId?: string | null;
  photoBase64?: string | null;
}

export interface UpdateProfileResponse extends OnboardingProfile {
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  bio?: string | null;
  avatarId?: string | null;
  photoBase64?: string | null;
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
  preferences?: UserPreferences | null;
  finished_onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}
