/**
 * Unit & Integration Tests for Backend Password Reset Flow
 *
 * Verifies:
 * 1. 6-digit OTP code generation by backend
 * 2. Password reset email template with 6-digit code
 * 3. Validation, expiration, and rate limiting (max attempts)
 * 4. Single-use JWT resetToken generation and verification
 * 5. Supabase Admin password update & profile has_password update
 */

import { emailTemplates } from '../src/services/resendEmailService';
import * as authService from '../src/services/authService';
import * as authController from '../src/controllers/authController';
import * as resendService from '../src/services/resendEmailService';

// Mock user state
let mockProfile: any = null;
let mockUserMetadata: Record<string, any> = {};
let mockPasswordResetRows: any[] = [];
let mockAdminUsers: any[] = [];
let updatedPassword: string | null = null;
let profileUpdated: any = null;
let sentEmails: any[] = [];

jest.mock('../src/services/resendEmailService', () => {
  const actual = jest.requireActual('../src/services/resendEmailService');
  return {
    ...actual,
    sendEmail: jest.fn(async (options: any) => {
      sentEmails.push(options);
      return { success: true, id: 'msg_test_123' };
    }),
  };
});

jest.mock('../src/config/database', () => {
  return {
    authClient: {
      auth: {
        signInWithPassword: jest.fn(),
        refreshSession: jest.fn(),
        verifyOtp: jest.fn(async () => ({ data: null, error: { message: 'Invalid' } })),
      },
    },
    supabase: {
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: (cols: string) => ({
              eq: (col: string, val: any) => ({
                maybeSingle: async () => ({
                  data: mockProfile && mockProfile[col] === val ? mockProfile : null,
                  error: null,
                }),
                single: async () => ({
                  data: mockProfile && mockProfile[col] === val ? mockProfile : null,
                  error: mockProfile && mockProfile[col] === val ? null : { message: 'Not found' },
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: (col: string, val: any) => {
                if (mockProfile && mockProfile[col] === val) {
                  mockProfile = { ...mockProfile, ...payload };
                  profileUpdated = payload;
                }
                return Promise.resolve({ data: mockProfile, error: null });
              },
            }),
          };
        }

        if (table === 'password_resets') {
          return {
            insert: (payload: any) => {
              const row = { id: 'row_' + Date.now(), ...payload };
              mockPasswordResetRows.push(row);
              return Promise.resolve({ data: row, error: null });
            },
            update: (payload: any) => ({
              eq: (col: string, val: any) => ({
                eq: (col2: string, val2: any) => {
                  mockPasswordResetRows.forEach((r) => {
                    if (r[col] === val && r[col2] === val2) {
                      Object.assign(r, payload);
                    }
                  });
                  return Promise.resolve({ error: null });
                },
              }),
            }),
            select: () => ({
              eq: (col: string, val: any) => ({
                eq: (col2: string, val2: any) => ({
                  order: () => ({
                    limit: (n: number) => {
                      const matches = mockPasswordResetRows
                        .filter((r) => r[col] === val && r[col2] === val2)
                        .slice(0, n);
                      return Promise.resolve({ data: matches, error: null });
                    },
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        };
      },
      auth: {
        resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
        admin: {
          getUserById: jest.fn(async (id: string) => ({
            data: {
              user: {
                id,
                email: mockProfile?.email,
                user_metadata: { ...mockUserMetadata },
              },
            },
            error: null,
          })),
          updateUserById: jest.fn(async (id: string, updates: any) => {
            if (updates.user_metadata) {
              mockUserMetadata = { ...mockUserMetadata, ...updates.user_metadata };
            }
            if (updates.password) {
              updatedPassword = updates.password;
            }
            return {
              data: { user: { id, email: mockProfile?.email, user_metadata: mockUserMetadata } },
              error: null,
            };
          }),
          listUsers: jest.fn(async () => ({
            data: { users: mockAdminUsers },
            error: null,
          })),
        },
        getUser: jest.fn(async (token: string) => {
          if (token === 'valid_supabase_session_token') {
            return {
              data: { user: { id: mockProfile.id, email: mockProfile.email } },
              error: null,
            };
          }
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
    },
  };
});

describe('Password Reset Flow (Backend)', () => {
  beforeEach(() => {
    mockProfile = {
      id: 'test-user-uuid-1234',
      email: 'mover@sabisweat.com',
      first_name: 'Ayo',
      has_password: false,
    };
    mockUserMetadata = {};
    mockPasswordResetRows = [];
    mockAdminUsers = [{ id: mockProfile.id, email: mockProfile.email }];
    updatedPassword = null;
    profileUpdated = null;
    sentEmails = [];
    jest.clearAllMocks();
  });

  describe('Email Template', () => {
    it('generates a 6-digit code email template with subject, html, and text', () => {
      const template = emailTemplates.passwordResetCode({
        code: '582914',
        userName: 'Ayo',
      });

      expect(template.subject).toContain('582914');
      expect(template.subject).toContain('Your SabiSweat Password Reset Code');
      expect(template.html).toContain('582914');
      expect(template.html).toContain('Ayo');
      expect(template.html).toContain('10 minutes');
      expect(template.text).toContain('582914');
      expect(template.text).toContain('10 minutes');
    });
  });

  describe('forgotPassword', () => {
    it('validates email presence and format', async () => {
      await expect(authService.forgotPassword({ email: '' })).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });

      await expect(authService.forgotPassword({ email: 'not-an-email' })).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });
    });

    it('returns ok: true for non-existent email to prevent enumeration without sending email', async () => {
      const res = await authService.forgotPassword({ email: 'nobody@sabisweat.com' });
      expect(res).toEqual({ ok: true });
      expect(sentEmails.length).toBe(0);
    });

    it('generates a 6-digit code, stores hash, and dispatches reset email', async () => {
      const res = await authService.forgotPassword({ email: 'Mover@SabiSweat.com ' });
      expect(res).toEqual({ ok: true });

      // Verify email dispatch
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].to).toBe('mover@sabisweat.com');
      expect(sentEmails[0].subject).toMatch(/Your SabiSweat Password Reset Code: \d{6}/);

      // Verify 6-digit code in metadata
      expect(mockUserMetadata.reset_password_code_hash).toBeDefined();
      expect(mockUserMetadata.reset_password_expires_at).toBeGreaterThan(Date.now());
      expect(mockUserMetadata.reset_password_attempts).toBe(0);
    });
  });

  describe('verifyResetCode', () => {
    it('validates required email and code', async () => {
      await expect(
        authService.verifyResetCode({ email: '', code: '123456' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });

      await expect(
        authService.verifyResetCode({ email: 'mover@sabisweat.com', code: '' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });
    });

    it('rejects non-6-digit codes', async () => {
      await expect(
        authService.verifyResetCode({ email: 'mover@sabisweat.com', code: '123' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'code_invalid',
      });

      await expect(
        authService.verifyResetCode({ email: 'mover@sabisweat.com', code: '12345678' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'code_invalid',
      });
    });

    it('rejects invalid or wrong code and increments attempts', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });

      await expect(
        authService.verifyResetCode({ email: 'mover@sabisweat.com', code: '000000' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'code_invalid',
      });

      expect(mockUserMetadata.reset_password_attempts).toBe(1);
    });

    it('rejects expired code', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });

      // Simulate expired code
      mockUserMetadata.reset_password_expires_at = Date.now() - 1000;
      if (mockPasswordResetRows[0]) {
        mockPasswordResetRows[0].expires_at = new Date(Date.now() - 1000).toISOString();
      }

      // Extract code from sent email
      const match = sentEmails[0].text.match(/\d{6}/);
      const code = match ? match[0] : '';

      await expect(
        authService.verifyResetCode({ email: 'mover@sabisweat.com', code })
      ).rejects.toMatchObject({
        status: 400,
        error: 'code_expired',
      });
    });

    it('locks out after 5 failed attempts', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });
      mockUserMetadata.reset_password_attempts = 5;
      if (mockPasswordResetRows[0]) {
        mockPasswordResetRows[0].attempts = 5;
      }

      await expect(
        authService.verifyResetCode({ email: 'mover@sabisweat.com', code: '999999' })
      ).rejects.toMatchObject({
        status: 429,
        error: 'attempts_exceeded',
      });
    });

    it('successfully verifies correct 6-digit code and issues signed resetToken', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });

      const match = sentEmails[0].text.match(/\d{6}/);
      expect(match).not.toBeNull();
      const code = match![0];

      const verifyRes = await authService.verifyResetCode({
        email: 'mover@sabisweat.com',
        code,
      });

      expect(verifyRes.resetToken).toBeDefined();
      expect(verifyRes.expiresIn).toBe(3600);
      expect(mockUserMetadata.active_reset_token_id).toBeDefined();
      // Code is consumed
      expect(mockUserMetadata.reset_password_code_hash).toBeFalsy();
    });
  });

  describe('resetPassword', () => {
    it('validates required resetToken and password length', async () => {
      await expect(
        authService.resetPassword({ resetToken: '', password: 'newPassword123' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });

      await expect(
        authService.resetPassword({ resetToken: 'some-token', password: 'short' })
      ).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });
    });

    it('rejects forged or invalid resetToken', async () => {
      await expect(
        authService.resetPassword({
          resetToken: 'forged.invalid.token',
          password: 'newPassword123',
        })
      ).rejects.toMatchObject({
        status: 400,
        error: 'token_invalid',
      });
    });

    it('completes password reset, updates profile has_password, and invalidates token for replay', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });
      const match = sentEmails[0].text.match(/\d{6}/);
      const code = match![0];

      const verifyRes = await authService.verifyResetCode({
        email: 'mover@sabisweat.com',
        code,
      });

      const resetRes = await authService.resetPassword({
        resetToken: verifyRes.resetToken,
        password: 'secureNewPassword2026',
      });

      expect(resetRes).toEqual({ ok: true });
      expect(updatedPassword).toBe('secureNewPassword2026');
      expect(profileUpdated?.has_password).toBe(true);

      // Replay attack: using the same token again must fail
      await expect(
        authService.resetPassword({
          resetToken: verifyRes.resetToken,
          password: 'anotherPassword2026',
        })
      ).rejects.toMatchObject({
        status: 400,
        error: 'token_invalid',
      });
    });
  });

  describe('Auth Controller Endpoints', () => {
    function createMockRes() {
      const res: any = {};
      res.statusCode = 200;
      res.status = jest.fn((code: number) => {
        res.statusCode = code;
        return res;
      });
      res.json = jest.fn((data: any) => {
        res.body = data;
        return res;
      });
      return res;
    }

    it('POST /auth/forgot invokes controller cleanly', async () => {
      const req: any = { body: { email: 'mover@sabisweat.com' } };
      const res = createMockRes();
      const next = jest.fn();

      await authController.forgotPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toEqual({ success: true, data: { ok: true } });
    });

    it('POST /auth/verify invokes controller and returns resetToken', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });
      const match = sentEmails[0].text.match(/\d{6}/);
      const code = match![0];

      const req: any = { body: { email: 'mover@sabisweat.com', code } };
      const res = createMockRes();
      const next = jest.fn();

      await authController.verifyCode(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resetToken).toBeDefined();
    });

    it('POST /auth/reset invokes controller and completes reset', async () => {
      await authService.forgotPassword({ email: 'mover@sabisweat.com' });
      const match = sentEmails[0].text.match(/\d{6}/);
      const code = match![0];
      const verifyRes = await authService.verifyResetCode({ email: 'mover@sabisweat.com', code });

      const req: any = {
        body: { resetToken: verifyRes.resetToken, password: 'NewSecurePassword123' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await authController.resetPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toEqual({ success: true, data: { ok: true } });
    });
  });
});
