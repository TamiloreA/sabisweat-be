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
 *     responses:
 *       200:
 *         description: Reset email sent (always returns ok)
 */
router.post('/forgot', authRateLimiter, forgotPassword);

/**
 * @openapi
 * /auth/verify:
 *   post:
 *     summary: Verify password reset code
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
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code verified, returns reset token
 *       400:
 *         description: Invalid or expired code
 */
router.post('/verify', authRateLimiter, verifyCode);

/**
 * @openapi
 * /auth/reset:
 *   post:
 *     summary: Reset password with verified token
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
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
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
