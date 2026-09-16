/**
 * Auth Service
 * Handles all authentication business logic via Supabase Auth.
 * Prioritizes speed with minimal DB round-trips and security with proper validation.
 */

import { supabase } from '../config/database';
import type {
  AuthUser,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  ForgotPasswordRequest,
  VerifyCodeRequest,
  VerifyCodeResponse,
  ResetPasswordRequest,
  RefreshTokenRequest,
  ChangePasswordRequest,
  OnboardingStatus,
  SabiLevel,
} from '../models/authModel';
import type { ProfileRow } from '../models/onboardingModel';

/**
 * Generate an 8-char alphanumeric referral code
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Map a Supabase profile row → frontend AuthUser shape
 */
function mapProfileToAuthUser(row: ProfileRow): AuthUser {
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
    onboardingStatus: row.onboarding_status as OnboardingStatus,
    city: row.city,
    referralCode: row.referral_code,
    gender: row.gender,
    dob: row.date_of_birth,
    sabiLevel: row.sabi_level as SabiLevel | null,
    level: row.sabi_level as SabiLevel | null,
    stepsCount: row.steps_count || 0,
    pointsBalance: row.points_balance || 0,
    finishedOnboardedAt: row.finished_onboarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Register a new user
 * Uses auth.signUp() + manual profile creation (no trigger dependency)
 */
export async function register(data: RegisterRequest): Promise<{
  status: number;
  user: AuthUser;
  accountStatus: string;
}> {
  const { email, password } = data;

  // Validate inputs
  if (!email || !password) {
    throw { status: 400, error: 'validation_error', message: 'Email and password are required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw { status: 400, error: 'validation_error', message: 'Invalid email format' };
  }

  if (password.length < 8) {
    throw { status: 400, error: 'validation_error', message: 'Password must be at least 8 characters' };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Create user via admin API (bypasses Supabase rate limits)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error('Supabase admin.createUser error:', authError.message);
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      throw { status: 409, error: 'email_exists', message: 'An account with this email already exists' };
    }
    if (authError.message?.includes('email') && authError.message?.includes('provider')) {
      throw { status: 400, error: 'email_provider_disabled', message: 'Email sign-up is currently disabled' };
    }
    if (authError.message?.includes('rate limit')) {
      throw { status: 429, error: 'attempts_exceeded', message: 'Too many attempts. Please try again in a minute.' };
    }
    throw { status: 500, error: 'server_error', message: authError.message || 'Registration failed' };
  }

  if (!authData.user) {
    throw { status: 500, error: 'server_error', message: 'User creation failed' };
  }

  const userId = authData.user.id;

  
  // Log them in to get a token so we can insert into profiles
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  const token = signInData?.session?.access_token;
  const dbClient = token ? require('../config/database').getUserSupabase(token) : supabase;

  // Create profile row directly (don't rely on trigger)
  const { data: profile, error: profileError } = await dbClient
    .from('profiles')
    .upsert({
      id: userId,
      email: normalizedEmail,
      has_password: true,
      onboarding_status: 'not_started',
      referral_code: generateReferralCode(),
    }, { onConflict: 'id' })
    .select()
    .single();

  if (profileError || !profile) {
    console.error('Profile creation error:', profileError);
    // Auth user was created but profile failed — still return success
    // Profile can be created on next login
    return {
      status: 201,
      accountStatus: 'active',
      user: {
        id: userId,
        email: normalizedEmail,
        username: null, firstName: null, lastName: null,
        avatarUrl: null, photoUrl: null, photoBase64: null, avatarId: null,
        hasPassword: true,
        onboardingStatus: 'not_started',
        city: null, referralCode: null, gender: null, dob: null,
        sabiLevel: null, level: null,
        stepsCount: 0, pointsBalance: 0,
        finishedOnboardedAt: null, createdAt: null, updatedAt: null,
      },
    };
  }

  return {
    status: 201,
    accountStatus: 'active',
    user: mapProfileToAuthUser(profile as ProfileRow),
  };
}

/**
 * Login with email and password
 */
export async function login(data: LoginRequest): Promise<AuthResponse> {
  const { email, password } = data;

  if (!email || !password) {
    throw { status: 400, error: 'validation_error', message: 'Email and password are required' };
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (authError) {
    if (authError.message?.includes('Invalid login credentials')) {
      throw { status: 401, error: 'invalid_credentials', message: 'Invalid email or password' };
    }
    if (authError.message?.includes('Email not confirmed')) {
      throw { status: 403, error: 'email_not_confirmed', message: 'Please confirm your email before logging in' };
    }
    console.error('Supabase signInWithPassword error:', authError);
    throw { status: 500, error: 'server_error', message: 'Login failed' };
  }

  if (!authData.session || !authData.user) {
    throw { status: 500, error: 'server_error', message: 'No session returned' };
  }

  // Fetch or create profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  // If no profile exists yet, create one
  if (!profile) {
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: authData.user.email,
        has_password: true,
        onboarding_status: 'not_started',
        referral_code: generateReferralCode(),
      }, { onConflict: 'id' })
      .select()
      .single();
    profile = newProfile;
  }

  const user = profile
    ? mapProfileToAuthUser(profile as ProfileRow)
    : {
        id: authData.user.id,
        email: authData.user.email || '',
        username: null, firstName: null, lastName: null,
        avatarUrl: null, photoUrl: null, photoBase64: null, avatarId: null,
        hasPassword: true,
        onboardingStatus: 'not_started' as OnboardingStatus,
        city: null, referralCode: null, gender: null, dob: null,
        sabiLevel: null, level: null,
        stepsCount: 0, pointsBalance: 0,
        finishedOnboardedAt: null, createdAt: null, updatedAt: null,
      };

  return {
    accessToken: authData.session.access_token,
    refreshToken: authData.session.refresh_token,
    onboardingStatus: user.onboardingStatus,
    user,
  };
}

/**
 * Social login — verify an existing Supabase access token (from Google/Apple OAuth)
 */
export async function socialLogin(accessToken: string): Promise<{
  user: AuthUser;
  onboardingStatus: OnboardingStatus;
}> {
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !authData.user) {
    throw { status: 401, error: 'unauthorized', message: 'Invalid or expired token' };
  }

  const supaUser = authData.user;

  // Upsert profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: supaUser.id,
      email: supaUser.email,
      has_password: false,
      referral_code: generateReferralCode(),
    }, { onConflict: 'id' })
    .select()
    .single();

  if (profileError || !profile) {
    console.error('Social login profile upsert error:', profileError);
    throw { status: 500, error: 'server_error', message: 'Profile sync failed' };
  }

  const user = mapProfileToAuthUser(profile as ProfileRow);

  return {
    user: { ...user, id: supaUser.id },
    onboardingStatus: user.onboardingStatus,
  };
}

/**
 * Send password reset email
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<{ ok: boolean }> {
  if (!data.email) {
    throw { status: 400, error: 'validation_error', message: 'Email is required' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(data.email.toLowerCase().trim());

  if (error) {
    console.error('Forgot password error:', error);
  }

  // Always return ok to prevent email enumeration
  return { ok: true };
}

/**
 * Verify a password reset OTP code
 */
export async function verifyResetCode(data: VerifyCodeRequest): Promise<VerifyCodeResponse> {
  if (!data.email || !data.code) {
    throw { status: 400, error: 'validation_error', message: 'Email and code are required' };
  }

  const { data: verifyData, error } = await supabase.auth.verifyOtp({
    email: data.email.toLowerCase().trim(),
    token: data.code,
    type: 'recovery',
  });

  if (error) {
    if (error.message?.includes('expired')) {
      throw { status: 400, error: 'code_expired', message: 'Reset code has expired' };
    }
    throw { status: 400, error: 'code_invalid', message: 'Invalid reset code' };
  }

  if (!verifyData.session) {
    throw { status: 400, error: 'code_invalid', message: 'Verification failed' };
  }

  return {
    resetToken: verifyData.session.access_token,
    expiresIn: 3600,
  };
}

/**
 * Reset password using a verified token
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<{ ok: boolean }> {
  if (!data.resetToken || !data.password) {
    throw { status: 400, error: 'validation_error', message: 'Reset token and new password are required' };
  }

  if (data.password.length < 8) {
    throw { status: 400, error: 'validation_error', message: 'Password must be at least 8 characters' };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(data.resetToken);

  if (userError || !userData.user) {
    throw { status: 400, error: 'token_invalid', message: 'Invalid or expired reset token' };
  }

  const { error } = await supabase.auth.admin.updateUserById(userData.user.id, {
    password: data.password,
  });

  if (error) {
    console.error('Reset password error:', error);
    throw { status: 500, error: 'reset_failed', message: 'Password reset failed' };
  }

  return { ok: true };
}

/**
 * Refresh an access token
 */
export async function refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
  if (!data.refreshToken) {
    throw { status: 400, error: 'validation_error', message: 'Refresh token is required' };
  }

  const { data: sessionData, error } = await supabase.auth.refreshSession({
    refresh_token: data.refreshToken,
  });

  if (error || !sessionData.session || !sessionData.user) {
    throw { status: 401, error: 'token_expired', message: 'Refresh token is invalid or expired' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionData.user.id)
    .single();

  const user = profile
    ? mapProfileToAuthUser(profile as ProfileRow)
    : {
        id: sessionData.user.id,
        email: sessionData.user.email || '',
        username: null, firstName: null, lastName: null,
        avatarUrl: null, photoUrl: null, photoBase64: null, avatarId: null,
        hasPassword: true,
        onboardingStatus: 'not_started' as OnboardingStatus,
        city: null, referralCode: null, gender: null, dob: null,
        sabiLevel: null, level: null,
        stepsCount: 0, pointsBalance: 0,
        finishedOnboardedAt: null, createdAt: null, updatedAt: null,
      };

  return {
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    onboardingStatus: user.onboardingStatus,
    user,
  };
}

/**
 * Get authenticated user profile
 */
export async function getAuthenticatedUser(userId: string): Promise<AuthUser> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw { status: 404, error: 'unauthorized', message: 'User profile not found' };
  }

  return mapProfileToAuthUser(profile as ProfileRow);
}

/**
 * Change password for authenticated user
 */
export async function changePassword(
  userId: string,
  data: ChangePasswordRequest
): Promise<{ ok: boolean }> {
  if (!data.oldPassword || !data.newPassword || !data.confirmNewPassword) {
    throw { status: 400, error: 'validation_error', message: 'All password fields are required' };
  }

  if (data.newPassword !== data.confirmNewPassword) {
    throw { status: 400, error: 'validation_error', message: 'New passwords do not match' };
  }

  if (data.newPassword.length < 8) {
    throw { status: 400, error: 'validation_error', message: 'Password must be at least 8 characters' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (!profile?.email) {
    throw { status: 400, error: 'validation_error', message: 'Cannot change password for this account' };
  }

  // Verify old password
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: data.oldPassword,
  });

  if (verifyError) {
    throw { status: 400, error: 'invalid_credentials', message: 'Current password is incorrect' };
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: data.newPassword,
  });

  if (error) {
    console.error('Change password error:', error);
    throw { status: 500, error: 'server_error', message: 'Password change failed' };
  }

  return { ok: true };
}

/**
 * Logout
 */
export async function logout(accessToken: string): Promise<{ ok: boolean }> {
  try {
    await supabase.auth.admin.signOut(accessToken);
  } catch {
    // Best-effort
  }
  return { ok: true };
}

export { mapProfileToAuthUser };
