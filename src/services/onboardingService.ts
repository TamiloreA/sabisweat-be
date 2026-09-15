/**
 * Onboarding Service
 * Single-submission onboarding — all data collected at once.
 */

import { getUserSupabase, supabase } from '../config/database';
import type { ProfileRow } from '../models/onboardingModel';
import type { OnboardingStatus } from '../models/authModel';

/**
 * Map a profile row → onboarding profile response
 */
function mapToOnboardingProfile(row: ProfileRow) {
  return {
    userId: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    movementRelationship: row.movement_relationship,
    mainGoal: row.main_goal,
    walkingFrequency: row.walking_frequency,
    stepGoal: row.step_goal,
    avatarId: row.avatar_id,
    photoUrl: row.photo_url,
    photoBase64: row.photo_base64,
    city: row.city,
    referralCode: row.referral_code,
    race: row.race,
    specificSubgroup: row.specific_subgroup,
    country: row.country,
    region: row.region,
    bio: row.bio,
    hasPassword: row.has_password,
    onboardingStatus: row.onboarding_status as OnboardingStatus,
    leaderboardVisible: row.leaderboard_visible,
    sharingDefault: row.sharing_default,
    sabiLevel: row.sabi_level,
    stepsCount: row.steps_count,
    pointsBalance: row.points_balance,
    streakCount: row.streak_count,
    finishedOnboardedAt: row.finished_onboarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get profile for authenticated user
 */
export async function getProfile(userId: string, token: string) {
  const { data, error } = await getUserSupabase(token)
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw { status: 404, error: 'unauthorized', message: 'Profile not found' };
  }

  return mapToOnboardingProfile(data as ProfileRow);
}

/**
 * Complete onboarding — single submission with all fields
 */
export async function completeOnboarding(userId: string, data: {
  // Basic identity
  firstName: string;
  lastName: string;
  email?: string;
  dob: string;
  gender: string;
  referralCode?: string;
  // Goals
  mainGoal: string;
  walkingFrequency: string;
  startingGoal: number;
  // Identity
  username: string;
  photoBase64?: string;
  avatarId?: string;
  city: string;
  leaderboardVisible: boolean;
  sharingDefault: boolean;
  country?: string;
  region?: string;
  race?: string;
  specificSubgroup?: string;
  movementRelationship?: string;
}, token: string) {
  // --- Validation ---
  if (!data.firstName || !data.lastName || !data.dob || !data.gender) {
    throw { status: 400, error: 'validation_error', message: 'firstName, lastName, dob, and gender are required' };
  }

  const validGenders = ['Man', 'Woman', 'Others'];
  if (!validGenders.includes(data.gender)) {
    throw { status: 400, error: 'validation_error', message: 'Gender must be Man, Woman, or Others' };
  }

  if (!data.mainGoal || !data.walkingFrequency || !data.startingGoal) {
    throw { status: 400, error: 'validation_error', message: 'mainGoal, walkingFrequency, and startingGoal are required' };
  }

  if (typeof data.startingGoal !== 'number' || data.startingGoal < 1000 || data.startingGoal > 100000) {
    throw { status: 400, error: 'validation_error', message: 'Step goal must be between 1000 and 100000' };
  }

  if (!data.username || !data.city) {
    throw { status: 400, error: 'validation_error', message: 'username and city are required' };
  }

  // Sanitize username
  const username = data.username.trim().toLowerCase();

  if (username.length < 3 || username.length > 30) {
    throw { status: 400, error: 'validation_error', message: 'Username must be 3-30 characters' };
  }

  if (!/^[a-z0-9._]+$/.test(username)) {
    throw { status: 400, error: 'validation_error', message: 'Username can only contain letters, numbers, dots, and underscores' };
  }

  // Check username uniqueness
  const { data: existing } = await getUserSupabase(token)
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', userId)
    .single();

  if (existing) {
    throw { status: 409, error: 'username_taken', message: 'This username is already taken' };
  }

  // --- Build update payload ---
  const updateData: Record<string, any> = {
    // Basic identity
    first_name: data.firstName.trim(),
    last_name: data.lastName.trim(),
    email: data.email,
    date_of_birth: data.dob,
    gender: data.gender,
    // Goals
    main_goal: data.mainGoal,
    walking_frequency: data.walkingFrequency,
    step_goal: data.startingGoal,
    // Identity
    username,
    city: data.city.trim(),
    leaderboard_visible: data.leaderboardVisible,
    sharing_default: data.sharingDefault,
    // Mark complete
    onboarding_status: 'completed',
    finished_onboarded_at: new Date().toISOString(),
  };

  if (data.referralCode && data.referralCode.trim()) {
    updateData.referral_code = data.referralCode.trim().toUpperCase();
  }

  if (data.photoBase64) {
    updateData.photo_base64 = data.photoBase64;
  }

  if (data.avatarId) {
    updateData.avatar_id = data.avatarId;
  }
  if (data.country) updateData.country = data.country.trim();
  if (data.region) updateData.region = data.region.trim();
  if (data.race) updateData.race = data.race;
  if (data.specificSubgroup) updateData.specific_subgroup = data.specificSubgroup;
  if (data.movementRelationship) updateData.movement_relationship = data.movementRelationship;

  // --- Single DB upsert (creates profile if missing) ---
  updateData.id = userId;
  
  const { data: profile, error } = await getUserSupabase(token)
    .from('profiles')
    .upsert(updateData, { onConflict: 'id' })
    .select()
    .single();

  if (error || !profile) {
    console.error('completeOnboarding error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to complete onboarding' };
  }

  return mapToOnboardingProfile(profile as ProfileRow);
}

/**
 * Update profile fields (post-onboarding edits)
 */
export async function updateProfile(userId: string, data: {
  firstName?: string;
  lastName?: string;
  city?: string;
  bio?: string;
}, token: string) {
  const updateData: Record<string, any> = {};

  if (data.firstName !== undefined) updateData.first_name = data.firstName.trim();
  if (data.lastName !== undefined) updateData.last_name = data.lastName.trim();
  if (data.city !== undefined) updateData.city = data.city.trim();
  if (data.bio !== undefined) updateData.bio = data.bio.trim();

  if (Object.keys(updateData).length === 0) {
    throw { status: 400, error: 'validation_error', message: 'At least one field must be provided' };
  }

  const { data: profile, error } = await getUserSupabase(token)
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select()
    .single();

  if (error || !profile) {
    console.error('updateProfile error:', error);
    throw { status: 500, error: 'server_error', message: 'Failed to update profile' };
  }

  return mapToOnboardingProfile(profile as ProfileRow);
}

/**
 * Check if a username is available
 */
export async function checkUsername(username: string): Promise<{ available: boolean }> {
  if (!username || username.trim().length < 3) {
    return { available: false };
  }

  const normalized = username.trim().toLowerCase();

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', normalized)
    .single();

  return { available: !data };
}
