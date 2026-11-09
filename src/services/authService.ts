/**
 * Auth Service
 * Handles all authentication business logic via Supabase Auth.
 * Prioritizes speed with minimal DB round-trips and security with proper validation.
 */

import crypto from 'crypto';
import { supabase, authClient } from '../config/database';
import { sendEmail, emailTemplates } from './resendEmailService';
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
import { normalizeGender } from '../utils/genderUtils';
import {
  mergeWithDefaultPreferences,
  DEFAULT_USER_PREFERENCES,
} from '../models/userPreferencesModel';

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
    gender: row.gender || normalizeGender(row.gender) || null,
    dob: row.date_of_birth,
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
    preferences: mergeWithDefaultPreferences(row.preferences),
    hasPassword: row.has_password,
    onboardingStatus: row.onboarding_status as OnboardingStatus,
    sabiLevel: (row.sabi_level as SabiLevel) || 'Starter',
    level: (row.sabi_level as SabiLevel) || 'Starter',
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
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Password must be at least 8 characters',
    };
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
    if (
      authError.message?.includes('already been registered') ||
      authError.message?.includes('already exists')
    ) {
      throw {
        status: 409,
        error: 'email_exists',
        message: 'An account with this email already exists',
      };
    }
    if (authError.message?.includes('email') && authError.message?.includes('provider')) {
      throw {
        status: 400,
        error: 'email_provider_disabled',
        message: 'Email sign-up is currently disabled',
      };
    }
    if (authError.message?.includes('rate limit')) {
      throw {
        status: 429,
        error: 'attempts_exceeded',
        message: 'Too many attempts. Please try again in a minute.',
      };
    }
    throw {
      status: 500,
      error: 'server_error',
      message: authError.message || 'Registration failed',
    };
  }

  if (!authData.user) {
    throw { status: 500, error: 'server_error', message: 'User creation failed' };
  }

  const userId = authData.user.id;

  // Log them in to get a token so we can insert into profiles
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  const token = signInData?.session?.access_token;
  const dbClient = token ? require('../config/database').getUserSupabase(token) : supabase;

  // Create profile row directly (don't rely on trigger)
  const { data: profile, error: profileError } = await dbClient
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: normalizedEmail,
        has_password: true,
        onboarding_status: 'not_started',
        referral_code: generateReferralCode(),
      },
      { onConflict: 'id' }
    )
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
        username: null,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        photoUrl: null,
        photoBase64: null,
        avatarId: null,
        hasPassword: true,
        onboardingStatus: 'not_started',
        country: null,
        region: null,
        city: null,
        movementRelationship: null,
        race: null,
        specificSubgroup: null,
        referralCode: null,
        gender: null,
        dob: null,
        sabiLevel: null,
        level: null,
        stepsCount: 0,
        pointsBalance: 0,
        preferences: { ...DEFAULT_USER_PREFERENCES },
        finishedOnboardedAt: null,
        createdAt: null,
        updatedAt: null,
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

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (authError) {
    if (authError.message?.includes('Invalid login credentials')) {
      throw { status: 401, error: 'invalid_credentials', message: 'Invalid email or password' };
    }
    if (authError.message?.includes('Email not confirmed')) {
      throw {
        status: 403,
        error: 'email_not_confirmed',
        message: 'Please confirm your email before logging in',
      };
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
      .upsert(
        {
          id: authData.user.id,
          email: authData.user.email,
          has_password: true,
          onboarding_status: 'not_started',
          referral_code: generateReferralCode(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
    profile = newProfile;
  }

  const user = profile
    ? mapProfileToAuthUser(profile as ProfileRow)
    : {
        id: authData.user.id,
        email: authData.user.email || '',
        username: null,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        photoUrl: null,
        photoBase64: null,
        avatarId: null,
        hasPassword: true,
        onboardingStatus: 'not_started' as OnboardingStatus,
        country: null,
        region: null,
        city: null,
        movementRelationship: null,
        race: null,
        specificSubgroup: null,
        referralCode: null,
        gender: null,
        dob: null,
        sabiLevel: null,
        level: null,
        stepsCount: 0,
        pointsBalance: 0,
        preferences: { ...DEFAULT_USER_PREFERENCES },
        finishedOnboardedAt: null,
        createdAt: null,
        updatedAt: null,
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
    .upsert(
      {
        id: supaUser.id,
        email: supaUser.email,
        has_password: false,
        referral_code: generateReferralCode(),
      },
      { onConflict: 'id' }
    )
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

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Generate a 6-digit numeric OTP code
 */
function generateResetOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash code with SHA-256 for secure storage
 */
function hashResetCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

interface ResetTokenPayload {
  sub: string;
  email: string;
  jti: string;
  purpose: 'password_reset';
  exp: number;
}

/**
 * Sign a secure reset token using HMAC-SHA256 and SUPABASE_SECRET_KEY
 */
function signResetToken(payload: ResetTokenPayload): string {
  const secret = process.env.SUPABASE_SECRET_KEY || 'sabisweat-auth-fallback-secret-key';
  const encodedData = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedData).digest('base64url');
  return `${encodedData}.${signature}`;
}

/**
 * Verify a signed reset token and validate signature & expiration
 */
function verifyResetToken(token: string): ResetTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedData, signature] = parts;
  const secret = process.env.SUPABASE_SECRET_KEY || 'sabisweat-auth-fallback-secret-key';
  const expectedSig = crypto.createHmac('sha256', secret).update(encodedData).digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedData, 'base64url').toString('utf8')
    ) as ResetTokenPayload;
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    if (payload.purpose !== 'password_reset') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

interface StoredResetCode {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  recordId?: string;
}

/**
 * Store a password reset code for a user (persists to both table and auth user_metadata for resilience)
 */
async function storeResetCode(
  userId: string,
  email: string,
  codeHash: string,
  expiresAt: number
): Promise<void> {
  // 1. Try to persist to password_resets table
  try {
    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('email', email)
      .eq('used', false);

    await supabase.from('password_resets').insert({
      user_id: userId,
      email,
      code_hash: codeHash,
      expires_at: new Date(expiresAt).toISOString(),
      attempts: 0,
      used: false,
    });
  } catch (err) {
    // If table not yet created, user_metadata fallback guarantees persistence
  }

  // 2. Persist to auth user metadata (guaranteed persistence across restarts and DB configurations)
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const meta = userData?.user?.user_metadata || {};
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        reset_password_code_hash: codeHash,
        reset_password_expires_at: expiresAt,
        reset_password_attempts: 0,
      },
    });
  } catch (err) {
    console.error('[authService] Failed to save reset code in user_metadata:', err);
  }
}

/**
 * Retrieve the active reset code record for a user
 */
async function getStoredResetCode(userId: string, email: string): Promise<StoredResetCode | null> {
  // 1. Check password_resets table
  try {
    const { data: rows, error } = await supabase
      .from('password_resets')
      .select('id, code_hash, expires_at, attempts')
      .eq('email', email)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && rows && rows.length > 0) {
      return {
        codeHash: rows[0].code_hash,
        expiresAt: new Date(rows[0].expires_at).getTime(),
        attempts: rows[0].attempts || 0,
        recordId: rows[0].id,
      };
    }
  } catch {
    // Fall back to user_metadata
  }

  // 2. Fall back to user_metadata
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const meta = userData?.user?.user_metadata || {};
    if (meta.reset_password_code_hash && meta.reset_password_expires_at) {
      return {
        codeHash: meta.reset_password_code_hash,
        expiresAt: Number(meta.reset_password_expires_at),
        attempts: Number(meta.reset_password_attempts) || 0,
      };
    }
  } catch (err) {
    console.error('[authService] Error retrieving user metadata for reset code:', err);
  }

  return null;
}

/**
 * Increment failed attempts on the active reset code
 */
async function recordFailedAttempt(
  userId: string,
  email: string,
  recordId?: string,
  nextAttempts: number = 1
): Promise<void> {
  if (recordId) {
    try {
      await supabase.from('password_resets').update({ attempts: nextAttempts }).eq('id', recordId);
    } catch {}
  }

  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const meta = userData?.user?.user_metadata || {};
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        reset_password_attempts: nextAttempts,
      },
    });
  } catch {}
}

/**
 * Invalidate or mark the reset code as consumed and record active reset token id
 */
async function markCodeVerified(
  userId: string,
  email: string,
  resetTokenId: string,
  recordId?: string
): Promise<void> {
  if (recordId) {
    try {
      await supabase.from('password_resets').update({ used: true }).eq('id', recordId);
    } catch {}
  }

  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const meta = userData?.user?.user_metadata || {};
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        reset_password_code_hash: null,
        reset_password_expires_at: null,
        reset_password_attempts: 0,
        active_reset_token_id: resetTokenId,
        active_reset_token_expires_at: Date.now() + 60 * 60 * 1000, // 1 hour
      },
    });
  } catch (err) {
    console.error('[authService] Failed to mark code verified in user_metadata:', err);
  }
}

/**
 * Clear any active reset tokens and codes after password reset
 */
async function clearResetSession(userId: string, email?: string): Promise<void> {
  if (email) {
    try {
      await supabase.from('password_resets').update({ used: true }).eq('email', email);
    } catch {}
  }

  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const meta = userData?.user?.user_metadata || {};

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        reset_password_code_hash: null,
        reset_password_expires_at: null,
        reset_password_attempts: 0,
        active_reset_token_id: null,
        active_reset_token_expires_at: null,
      },
    });
  } catch (err) {
    console.error('[authService] Failed to clear reset session in user_metadata:', err);
  }
}

/**
 * Send password reset email with backend-generated 6-digit OTP code
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<{ ok: boolean }> {
  if (!data.email) {
    throw { status: 400, error: 'validation_error', message: 'Email is required' };
  }

  const normalizedEmail = data.email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw { status: 400, error: 'validation_error', message: 'Invalid email format' };
  }

  // Find user by email in profiles or auth
  let userId: string | null = null;
  let userName: string = 'Sabi Mover';

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, first_name')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profile?.id) {
    userId = profile.id;
    userName = profile.first_name || 'Sabi Mover';
  } else {
    try {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matched = authUsers?.users?.find(
        (u) => u.email?.toLowerCase().trim() === normalizedEmail
      );
      if (matched) {
        userId = matched.id;
        userName = matched.user_metadata?.first_name || 'Sabi Mover';
      }
    } catch {}
  }

  // If user does not exist, return ok: true to prevent email enumeration
  if (!userId) {
    return { ok: true };
  }

  // Generate 6-digit numeric OTP code
  const code = generateResetOtpCode();
  const codeHash = hashResetCode(code);
  const expiresAt = Date.now() + CODE_EXPIRY_MS;

  // Store code
  await storeResetCode(userId, normalizedEmail, codeHash, expiresAt);

  // Send email containing the 6-digit code
  const template = emailTemplates.passwordResetCode({
    code,
    userName,
  });

  const sendResult = await sendEmail({
    to: normalizedEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    category: 'password_reset',
  });

  if (!sendResult.success) {
    console.warn(
      '[authService] Warning: Reset email delivery failed or unconfigured:',
      sendResult.error
    );
  }
  console.log(`[authService] 🔑 Reset code generated for ${normalizedEmail}: ${code}`);

  return { ok: true };
}

/**
 * Verify a 6-digit password reset OTP code
 */
export async function verifyResetCode(data: VerifyCodeRequest): Promise<VerifyCodeResponse> {
  if (!data.email || !data.code) {
    throw { status: 400, error: 'validation_error', message: 'Email and code are required' };
  }

  const normalizedEmail = data.email.toLowerCase().trim();
  const inputCode = String(data.code).trim();

  // Code must be exactly 6 digits
  if (!/^\d{6}$/.test(inputCode)) {
    throw { status: 400, error: 'code_invalid', message: 'Invalid reset code' };
  }

  // Find user by email
  let userId: string | null = null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profile?.id) {
    userId = profile.id;
  } else {
    try {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matched = authUsers?.users?.find(
        (u) => u.email?.toLowerCase().trim() === normalizedEmail
      );
      if (matched) {
        userId = matched.id;
      }
    } catch {}
  }

  if (!userId) {
    throw { status: 400, error: 'code_invalid', message: 'Invalid reset code' };
  }

  const stored = await getStoredResetCode(userId, normalizedEmail);
  if (!stored) {
    throw { status: 400, error: 'code_invalid', message: 'Invalid reset code' };
  }

  // Check expiration
  if (Date.now() > stored.expiresAt) {
    await recordFailedAttempt(userId, normalizedEmail, stored.recordId, stored.attempts + 1);
    throw { status: 400, error: 'code_expired', message: 'Reset code has expired' };
  }

  // Check attempt limit
  if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
    await clearResetSession(userId, normalizedEmail);
    throw {
      status: 429,
      error: 'attempts_exceeded',
      message: 'Too many incorrect attempts. Please request a new code.',
    };
  }

  // Verify hash
  const inputHash = hashResetCode(inputCode);
  if (inputHash !== stored.codeHash) {
    await recordFailedAttempt(userId, normalizedEmail, stored.recordId, stored.attempts + 1);
    throw { status: 400, error: 'code_invalid', message: 'Invalid reset code' };
  }

  // Valid! Generate secure resetToken
  const resetTokenId = crypto.randomUUID();
  const resetToken = signResetToken({
    sub: userId,
    email: normalizedEmail,
    jti: resetTokenId,
    purpose: 'password_reset',
    exp: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  await markCodeVerified(userId, normalizedEmail, resetTokenId, stored.recordId);

  return {
    resetToken,
    expiresIn: 3600,
  };
}

/**
 * Reset password using a verified token
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<{ ok: boolean }> {
  if (!data.resetToken || !data.password) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Reset token and new password are required',
    };
  }

  if (data.password.length < 8) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Password must be at least 8 characters',
    };
  }

  let userId: string | null = null;
  let resetTokenId: string | null = null;
  let email: string | undefined;

  // 1. Verify backend-issued signed resetToken
  const verifiedPayload = verifyResetToken(data.resetToken);
  if (verifiedPayload && verifiedPayload.sub) {
    userId = verifiedPayload.sub;
    resetTokenId = verifiedPayload.jti || null;
    email = verifiedPayload.email;
  }

  // 2. Fallback: check if it's a Supabase session token (for backward compatibility)
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser(data.resetToken);
    if (!userError && userData?.user) {
      userId = userData.user.id;
      email = userData.user.email;
    }
  }

  if (!userId) {
    throw { status: 400, error: 'token_invalid', message: 'Invalid or expired reset token' };
  }

  // 3. Verify single-use constraint if token had jti
  if (resetTokenId) {
    const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
    const meta = authUserData?.user?.user_metadata || {};
    if (!meta.active_reset_token_id || meta.active_reset_token_id !== resetTokenId) {
      throw {
        status: 400,
        error: 'token_invalid',
        message: 'Reset token has already been used or expired',
      };
    }
    if (
      meta.active_reset_token_expires_at &&
      Date.now() > Number(meta.active_reset_token_expires_at)
    ) {
      throw { status: 400, error: 'token_invalid', message: 'Reset token has expired' };
    }
  }

  // 4. Update password via Supabase Admin API
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: data.password,
  });

  if (error) {
    console.error('Reset password error:', error);
    throw { status: 500, error: 'reset_failed', message: 'Password reset failed' };
  }

  // 5. Update profiles.has_password = true
  try {
    await supabase
      .from('profiles')
      .update({ has_password: true, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.warn('[authService] Could not update has_password on profile:', err);
  }

  // 6. Invalidate reset token and clear reset session
  await clearResetSession(userId, email);

  return { ok: true };
}

/**
 * Refresh an access token
 */
export async function refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
  if (!data.refreshToken) {
    throw { status: 400, error: 'validation_error', message: 'Refresh token is required' };
  }

  const { data: sessionData, error } = await authClient.auth.refreshSession({
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
        username: null,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        photoUrl: null,
        photoBase64: null,
        avatarId: null,
        hasPassword: true,
        onboardingStatus: 'not_started' as OnboardingStatus,
        country: null,
        region: null,
        city: null,
        movementRelationship: null,
        race: null,
        specificSubgroup: null,
        referralCode: null,
        gender: null,
        dob: null,
        sabiLevel: null,
        level: null,
        stepsCount: 0,
        pointsBalance: 0,
        preferences: { ...DEFAULT_USER_PREFERENCES },
        finishedOnboardedAt: null,
        createdAt: null,
        updatedAt: null,
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
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Password must be at least 8 characters',
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (!profile?.email) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Cannot change password for this account',
    };
  }

  // Verify old password
  const { error: verifyError } = await authClient.auth.signInWithPassword({
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
