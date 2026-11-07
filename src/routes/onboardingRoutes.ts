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
 *             required: [firstName, lastName, dob, gender, mainGoal, walkingFrequency, startingGoal, username, city]
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
 *                 enum: [Female, Male, Non-binary, Prefer not to say, Man, Woman]
 *                 example: Man
 *               movementRelationship:
 *                 type: string
 *                 enum: [NONE, POOR, OCCASIONAL, CONSISTENT]
 *                 example: CONSISTENT
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
 *               race:
 *                 type: string
 *                 example: "Black / African"
 *               specificSubgroup:
 *                 type: string
 *                 example: "Nigerian"
 *               photoBase64:
 *                 type: string
 *                 nullable: true
 *               avatarId:
 *                 type: string
 *               country:
 *                 type: string
 *                 example: "United Kingdom"
 *               region:
 *                 type: string
 *                 example: "London"
 *               city:
 *                 type: string
 *                 example: "London"
 *               preferences:
 *                 type: object
 *                 properties:
 *                   distanceUnit:
 *                     type: string
 *                     enum: [Kilometres, Miles]
 *                     example: Miles
 *                   energyUnit:
 *                     type: string
 *                     enum: [Calories, Kilojoules]
 *                     example: Calories
 *                   startOfWeek:
 *                     type: string
 *                     enum: [Saturday, Sunday, Monday]
 *                     example: Sunday
 *               leaderboardVisible:
 *                 type: boolean
 *                 default: true
 *               sharingDefault:
 *                 type: boolean
 *                 default: true
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
 *               gender:
 *                 type: string
 *                 enum: [Female, Male, Non-binary, Prefer not to say, Man, Woman]
 *                 example: Female
 *               movementRelationship:
 *                 type: string
 *                 enum: [NONE, POOR, OCCASIONAL, CONSISTENT]
 *               race:
 *                 type: string
 *               specificSubgroup:
 *                 type: string
 *               region:
 *                 type: string
 *               country:
 *                 type: string
 *               city:
 *                 type: string
 *               bio:
 *                 type: string
 *               avatarId:
 *                 type: string
 *                 nullable: true
 *               photoBase64:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch('/profile', updateProfile);

export default router;
