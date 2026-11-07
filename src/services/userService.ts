/**
 * User Service
 * Manages user profile retrieval, general profile updates, and user preferences:
 * - distanceUnit ("Kilometres" | "Miles")
 * - energyUnit ("Calories" | "Kilojoules")
 * - startOfWeek ("Saturday" | "Sunday" | "Monday")
 */

import { supabase } from '../config/database';
import type { ProfileRow } from '../models/onboardingModel';
import type { AuthUser } from '../models/authModel';
import {
  UserPreferences,
  mergeWithDefaultPreferences,
  validateAndSanitizePreferencesUpdate,
} from '../models/userPreferencesModel';
import { normalizeGender } from '../utils/genderUtils';

/**
 * Maps a database profile row into the standardized user profile object.
 */
export function mapProfileToUserProfile(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    email: row.email || '',
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.photo_url,
    photoUrl: row.photo_url,
    photoBase64: row.photo_base64,
    avatarId: row.avatar_id,
    hasPassword: row.has_password,
    onboardingStatus: row.onboarding_status as any,
    city: row.city,
    referralCode: row.referral_code,
    gender: normalizeGender(row.gender) || row.gender,
    dob: row.date_of_birth,
    sabiLevel: row.sabi_level as any,
    level: row.sabi_level as any,
    stepsCount: row.steps_count || 0,
    pointsBalance: row.points_balance || 0,
    preferences: mergeWithDefaultPreferences(row.preferences),
    finishedOnboardedAt: row.finished_onboarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch authenticated user profile including preferences.
 */
export async function getUserProfile(userId: string): Promise<AuthUser> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw { status: 404, error: 'not_found', message: 'User profile not found' };
  }

  return mapProfileToUserProfile(profile as ProfileRow);
}

/**
 * Updates user preferences (distanceUnit, energyUnit, startOfWeek).
 */
export async function updateUserPreferences(
  userId: string,
  prefsInput: any
): Promise<UserPreferences> {
  const validatedUpdates = validateAndSanitizePreferencesUpdate(prefsInput);

  // Fetch current preferences to merge cleanly
  const { data: currentProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single();

  if (fetchError || !currentProfile) {
    throw { status: 404, error: 'not_found', message: 'User profile not found' };
  }

  const currentPrefs = mergeWithDefaultPreferences(currentProfile.preferences);
  const newPreferences: UserPreferences = {
    ...currentPrefs,
    ...validatedUpdates,
  };

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      preferences: newPreferences,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    console.error('updateUserPreferences error:', updateError);
    throw { status: 500, error: 'server_error', message: 'Failed to update preferences' };
  }

  return newPreferences;
}

/**
 * Updates user profile, with support for nested or top-level preference fields.
 */
export async function updateUserProfile(userId: string, body: any): Promise<AuthUser> {
  if (!body || typeof body !== 'object') {
    throw { status: 400, error: 'validation_error', message: 'Request body must be an object' };
  }

  // Check if preferences are being updated either directly or under "preferences"
  let preferencesInput: any = null;
  if (body.preferences && typeof body.preferences === 'object') {
    preferencesInput = body.preferences;
  } else if (
    body.distanceUnit !== undefined ||
    body.energyUnit !== undefined ||
    body.startOfWeek !== undefined
  ) {
    preferencesInput = {
      ...(body.distanceUnit !== undefined ? { distanceUnit: body.distanceUnit } : {}),
      ...(body.energyUnit !== undefined ? { energyUnit: body.energyUnit } : {}),
      ...(body.startOfWeek !== undefined ? { startOfWeek: body.startOfWeek } : {}),
    };
  }

  // 1. If preferences are present, update them
  if (preferencesInput) {
    await updateUserPreferences(userId, preferencesInput);
  }

  // 2. Check for other profile fields
  const profileUpdates: Record<string, any> = {};
  if (body.firstName !== undefined) profileUpdates.first_name = body.firstName !== null ? String(body.firstName).trim() : null;
  if (body.lastName !== undefined) profileUpdates.last_name = body.lastName !== null ? String(body.lastName).trim() : null;
  if (body.city !== undefined) profileUpdates.city = body.city !== null ? String(body.city).trim() : null;
  if (body.bio !== undefined) profileUpdates.bio = body.bio !== null ? String(body.bio).trim() : null;
  if (body.region !== undefined) profileUpdates.region = body.region !== null ? String(body.region).trim() : null;
  if (body.country !== undefined) profileUpdates.country = body.country !== null ? String(body.country).trim() : null;
  if (body.avatarId !== undefined) profileUpdates.avatar_id = body.avatarId !== null ? String(body.avatarId).trim() : null;
  if (body.photoBase64 !== undefined) profileUpdates.photo_base64 = body.photoBase64 !== null ? String(body.photoBase64) : null;
  if (body.gender !== undefined) {
    if (body.gender === null) {
      profileUpdates.gender = null;
    } else {
      const normalizedGender = normalizeGender(body.gender);
      if (!normalizedGender) {
        throw { status: 400, error: 'validation_error', message: 'Invalid gender value' };
      }
      profileUpdates.gender = normalizedGender;
    }
  }

  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updated_at = new Date().toISOString();
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', userId);

    if (profileError) {
      console.error('updateUserProfile error:', profileError);
      throw { status: 500, error: 'server_error', message: 'Failed to update profile' };
    }
  }

  // Return the full updated profile
  return getUserProfile(userId);
}
