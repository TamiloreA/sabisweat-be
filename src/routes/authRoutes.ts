/**
 * Auth Routes
 * All authentication-related endpoints with Swagger documentation.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import {
  registerUser,
  loginUser,
  socialLogin,
  forgotPassword,
  verifyCode,
  resetPassword,
  refreshToken,
  logoutUser,
  getMe,
  changePassword,
} from '../controllers/authController';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       201:
 *         description: User created successfully
 *       409:
 *         description: Email already exists
 */
router.post('/register', authRateLimiter, registerUser);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns tokens and user
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authRateLimiter, loginUser);

/**
 * @openapi
 * /auth/social/GoogleAndApple:
 *   post:
 *     summary: Social login via Supabase OAuth token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Social login successful
 *       401:
 *         description: Invalid token
 */
router.post('/social/GoogleAndApple', socialLogin);

/**
 * @openapi
 * /auth/forgot:
 *   post:
 *     summary: Request password reset email
 *     description: Generates a 6-digit verification code and emails it to the user. Always returns ok to prevent email enumeration.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: mover@sabisweat.com
 *     responses:
 *       200:
 *         description: Reset email dispatched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                       example: true
 */
router.post('/forgot', authRateLimiter, forgotPassword);

/**
 * @openapi
 * /auth/verify:
 *   post:
 *     summary: Verify password reset code
 *     description: Validates the 6-digit numeric OTP code sent to the user's email. On success, returns a signed resetToken.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: mover@sabisweat.com
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Code verified successfully, returns reset token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     resetToken:
 *                       type: string
 *                       example: "jwt_reset_token_here"
 *                     expiresAt:
 *                       type: integer
 *                       example: 1794248400000
 *       400:
 *         description: Invalid, expired, or locked out code
 */
router.post('/verify', authRateLimiter, verifyCode);

/**
 * @openapi
 * /auth/reset:
 *   post:
 *     summary: Reset password with verified token
 *     description: Sets the new password using the verified resetToken obtained from /auth/verify.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, password]
 *             properties:
 *               resetToken:
 *                 type: string
 *                 example: "jwt_reset_token_here"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "newSecretPassword123"
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Invalid reset token or password length less than 8 characters
 */
router.post('/reset', authRateLimiter, resetPassword);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens returned
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', refreshToken);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout current user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', logoutUser);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns authenticated user
 *       401:
 *         description: Not authenticated
 */
router.get('/me', requireAuth, getMe);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Change password for authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword, confirmNewPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmNewPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post('/change-password', requireAuth, changePassword);

export default router;
