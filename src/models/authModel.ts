/**
 * Auth Model — Type definitions for authentication API
 */

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';
export type AccountStatus = 'pending_confirmation' | 'active';
export type SabiLevel = 'Starter' | 'Mover' | 'Strider' | 'Champion' | 'Legend';

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  photoUrl: string | null;
  photoBase64: string | null;
  avatarId: string | null;
  hasPassword: boolean;
  onboardingStatus: OnboardingStatus;
  city: string | null;
  referralCode: string | null;
  gender: string | null;
  dob: string | null;
  sabiLevel: SabiLevel | null;
  level: SabiLevel | null;
  stepsCount: number;
  pointsBalance: number;
  finishedOnboardedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  onboardingStatus: OnboardingStatus;
  user: AuthUser;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface VerifyCodeRequest {
  email: string;
  code: string;
}

export interface VerifyCodeResponse {
  resetToken: string;
  expiresIn: number;
}

export interface ResetPasswordRequest {
  resetToken: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export type ApiErrorCode =
  | 'validation_error'
  | 'invalid_credentials'
  | 'unauthorized'
  | 'email_exists'
  | 'email_taken'
  | 'username_taken'
  | 'code_invalid'
  | 'code_expired'
  | 'token_invalid'
  | 'token_expired'
  | 'attempts_exceeded'
  | 'reset_failed'
  | 'email_provider_disabled'
  | 'server_error';
