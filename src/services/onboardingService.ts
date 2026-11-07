/**
 * Onboarding Service
 * Single-submission onboarding — all data collected at once.
 */

import { getUserSupabase, supabase } from '../config/database';
import type { ProfileRow } from '../models/onboardingModel';
import type { OnboardingStatus } from '../models/authModel';
import { normalizeGender } from '../utils/genderUtils';
import { mergeWithDefaultPreferences } from '../models/userPreferencesModel';

/**
 * Map a profile row → onboarding profile response
 */
function mapToOnboardingProfile(row: ProfileRow) {
  return {
    id: row.id,
    userId: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    gender: row.gender || normalizeGender(row.gender) || null,
    dob: row.date_of_birth,
    dateOfBirth: row.date_of_birth,
    avatarId: row.avatar_id,
    avatarUrl: row.photo_url,
    photoUrl: row.photo_url,
    photoBase64: row.photo_base64,
    country: row.country || null,
    region: row.region || null,
    city: row.city || null,
    movementRelationship: row.movement_relationship || null,
    race: row.race || null,
    specificSubgroup: row.specific_subgroup || null,
    referralCode: row.referral_code,
    mainGoal: row.main_goal,
    walkingFrequency: row.walking_frequency,
    stepGoal: row.step_goal,
    hasPassword: row.has_password,
    onboardingStatus: row.onboarding_status as OnboardingStatus,
    leaderboardVisible: row.leaderboard_visible,
    sharingDefault: row.sharing_default,
    preferences: mergeWithDefaultPreferences(row.preferences),
    sabiLevel: row.sabi_level || 'Starter',
    stepsCount: row.steps_count || 0,
    pointsBalance: row.points_balance || 0,
    streakCount: row.streak_count || 0,
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
  country?: string | null;
  region?: string | null;
  race?: string | null;
  specificSubgroup?: string | null;
  movementRelationship?: string | null;
  preferences?: {
    distanceUnit?: string;
    energyUnit?: string;
    startOfWeek?: string;
  } | null;
  distanceUnit?: string;
  energyUnit?: string;
  startOfWeek?: string;
  leaderboardVisible?: boolean;
  sharingDefault?: boolean;
}, token: string) {
  // --- Validation ---
  if (!data.firstName || !data.lastName || !data.dob || !data.gender) {
    throw { status: 400, error: 'validation_error', message: 'firstName, lastName, dob, and gender are required' };
  }

  const normalizedGender = normalizeGender(data.gender) || (
    ['Female', 'Male', 'Non-binary', 'Prefer not to say', 'Woman', 'Man', 'Others'].includes(data.gender.trim())
      ? data.gender.trim()
      : null
  );
  if (!normalizedGender) {
    throw { status: 400, error: 'validation_error', message: 'Gender must be Female, Male, Non-binary, Prefer not to say, Man, or Woman' };
  }

  // Preserve 'Man', 'Woman', etc. when matched
  const genderToSave = ['Man', 'Woman', 'Female', 'Male', 'Non-binary', 'Prefer not to say'].find(
    g => g.toLowerCase() === data.gender.trim().toLowerCase()
  ) || normalizedGender;

  if (!data.mainGoal || !data.walkingFrequency || !data.startingGoal) {
    throw { status: 400, error: 'validation_error', message: 'mainGoal, walkingFrequency, and startingGoal are required' };
  }

  if (typeof data.startingGoal !== 'number' || data.startingGoal < 1000 || data.startingGoal > 100000) {
    throw { status: 400, error: 'validation_error', message: 'Step goal must be between 1000 and 100000' };
  }

  if (!data.username || !data.city) {
    throw { status: 400, error: 'validation_error', message: 'username and city are required' };
  }

  // Movement relationship validation
  let movementRelationshipToSave: string | null = null;
  if (data.movementRelationship) {
    const mr = data.movementRelationship.trim().toUpperCase();
    if (!['NONE', 'POOR', 'OCCASIONAL', 'CONSISTENT'].includes(mr)) {
      throw { status: 400, error: 'validation_error', message: 'movementRelationship must be NONE, POOR, OCCASIONAL, or CONSISTENT' };
    }
    movementRelationshipToSave = mr;
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

  // Handle preferences passed during onboarding
  let preferencesToSave: any = undefined;
  if (data.preferences && typeof data.preferences === 'object') {
    preferencesToSave = mergeWithDefaultPreferences(data.preferences);
  } else if (data.distanceUnit || data.energyUnit || data.startOfWeek) {
    preferencesToSave = mergeWithDefaultPreferences({
      distanceUnit: data.distanceUnit,
      energyUnit: data.energyUnit,
      startOfWeek: data.startOfWeek,
    });
  }

  // --- Build update payload ---
  const updateData: Record<string, any> = {
    // Basic identity
    first_name: data.firstName.trim(),
    last_name: data.lastName.trim(),
    email: data.email,
    date_of_birth: data.dob,
    gender: genderToSave,
    // Goals
    main_goal: data.mainGoal,
    walking_frequency: data.walkingFrequency,
    step_goal: data.startingGoal,
    // Identity
    username,
    city: data.city.trim(),
    leaderboard_visible: data.leaderboardVisible !== undefined ? Boolean(data.leaderboardVisible) : true,
    sharing_default: data.sharingDefault !== undefined ? Boolean(data.sharingDefault) : true,
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
  if (data.country !== undefined) updateData.country = data.country ? data.country.trim() : null;
  if (data.region !== undefined) updateData.region = data.region ? data.region.trim() : null;
  if (data.race !== undefined) updateData.race = data.race ? data.race.trim() : null;
  if (data.specificSubgroup !== undefined) updateData.specific_subgroup = data.specificSubgroup ? data.specificSubgroup.trim() : null;
  if (movementRelationshipToSave !== null) {
    updateData.movement_relationship = movementRelationshipToSave;
  } else if (data.movementRelationship === null) {
    updateData.movement_relationship = null;
  }
  if (preferencesToSave !== undefined) updateData.preferences = preferencesToSave;

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
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  bio?: string | null;
  region?: string | null;
  country?: string | null;
  avatarId?: string | null;
  photoBase64?: string | null;
  gender?: string | null;
  race?: string | null;
  specificSubgroup?: string | null;
  movementRelationship?: string | null;
}, token: string) {
  const updateData: Record<string, any> = {};

  if (data.firstName !== undefined) updateData.first_name = data.firstName !== null ? String(data.firstName).trim() : null;
  if (data.lastName !== undefined) updateData.last_name = data.lastName !== null ? String(data.lastName).trim() : null;
  if (data.city !== undefined) updateData.city = data.city !== null ? String(data.city).trim() : null;
  if (data.bio !== undefined) updateData.bio = data.bio !== null ? String(data.bio).trim() : null;
  if (data.region !== undefined) updateData.region = data.region !== null ? String(data.region).trim() : null;
  if (data.country !== undefined) updateData.country = data.country !== null ? String(data.country).trim() : null;
  if (data.race !== undefined) updateData.race = data.race !== null ? String(data.race).trim() : null;
  if (data.specificSubgroup !== undefined) updateData.specific_subgroup = data.specificSubgroup !== null ? String(data.specificSubgroup).trim() : null;
  if (data.movementRelationship !== undefined) {
    if (data.movementRelationship === null) {
      updateData.movement_relationship = null;
    } else {
      const mr = String(data.movementRelationship).trim().toUpperCase();
      if (!['NONE', 'POOR', 'OCCASIONAL', 'CONSISTENT'].includes(mr)) {
        throw { status: 400, error: 'validation_error', message: 'movementRelationship must be NONE, POOR, OCCASIONAL, or CONSISTENT' };
      }
      updateData.movement_relationship = mr;
    }
  }
  if (data.avatarId !== undefined) updateData.avatar_id = data.avatarId !== null ? String(data.avatarId).trim() : null;
  if (data.photoBase64 !== undefined) updateData.photo_base64 = data.photoBase64 !== null ? String(data.photoBase64) : null;
  if (data.gender !== undefined) {
    if (data.gender === null) {
      updateData.gender = null;
    } else {
      const normalizedGender = normalizeGender(data.gender) || (
        ['Female', 'Male', 'Non-binary', 'Prefer not to say', 'Woman', 'Man', 'Others'].includes(String(data.gender).trim())
          ? String(data.gender).trim()
          : null
      );
      if (!normalizedGender) {
        throw { status: 400, error: 'validation_error', message: 'Gender must be Female, Male, Non-binary, Prefer not to say, Man, or Woman' };
      }
      updateData.gender = normalizedGender;
    }
  }

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
