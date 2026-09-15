/**
 * Onboarding Routes
 * Single-submission onboarding + profile management + username check.
 * All routes require JWT authentication.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getProfile,
  completeOnboarding,
  updateProfile,
  checkUsername,
} from '../controllers/onboardingController';

const router = Router();

// All onboarding routes require authentication
router.use(requireAuth);

/**
 * @openapi
 * /onboarding/me:
 *   get:
 *     summary: Get current user's onboarding profile
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns onboarding profile
 */
router.get('/me', getProfile);

/**
 * @openapi
 * /onboarding/check-username/{username}:
 *   get:
 *     summary: Check if a username is available
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns availability status
 */
router.get('/check-username/:username', checkUsername);

/**
 * @openapi
 * /onboarding/complete:
 *   post:
 *     summary: Complete onboarding — submit all data in one request
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, dob, gender, mainGoal, walkingFrequency, startingGoal, username, city, leaderboardVisible, sharingDefault]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               dob:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [Man, Woman, Others]
 *               referralCode:
 *                 type: string
 *               mainGoal:
 *                 type: string
 *               walkingFrequency:
 *                 type: string
 *               startingGoal:
 *                 type: number
 *               username:
 *                 type: string
 *               photoBase64:
 *                 type: string
 *               avatarId:
 *                 type: string
 *               city:
 *                 type: string
 *               leaderboardVisible:
 *                 type: boolean
 *               sharingDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Onboarding completed successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Username taken
 */
router.post('/complete', completeOnboarding);

/**
 * @openapi
 * /onboarding/profile:
 *   patch:
 *     summary: Update profile fields (post-onboarding)
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               city:
 *                 type: string
 *               bio:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch('/profile', updateProfile);

export default router;
