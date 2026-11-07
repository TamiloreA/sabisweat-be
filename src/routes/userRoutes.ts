/**
 * User Routes
 * Endpoints for user profile and preferences.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as userController from '../controllers/userController';

const router = Router();

// All user routes require authentication
router.use(requireAuth);

/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get current authenticated user profile and preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile with preferences
 *       401:
 *         description: Not authenticated
 */
router.get('/me', userController.getMe);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     summary: Update current user profile or preferences
 *     tags: [Users]
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
 *               preferences:
 *                 type: object
 *                 properties:
 *                   distanceUnit:
 *                     type: string
 *                     enum: [Kilometres, Miles]
 *                   energyUnit:
 *                     type: string
 *                     enum: [Calories, Kilojoules]
 *                   startOfWeek:
 *                     type: string
 *                     enum: [Saturday, Sunday, Monday]
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Validation error
 */
router.patch('/me', userController.updateMe);

/**
 * @openapi
 * /users/me/preferences:
 *   patch:
 *     summary: Update user preferences (distance unit, energy unit, start of week)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               distanceUnit:
 *                 type: string
 *                 enum: [Kilometres, Miles]
 *                 example: Miles
 *               energyUnit:
 *                 type: string
 *                 enum: [Calories, Kilojoules]
 *                 example: Calories
 *               startOfWeek:
 *                 type: string
 *                 enum: [Saturday, Sunday, Monday]
 *                 example: Sunday
 *     responses:
 *       200:
 *         description: Updated preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     preferences:
 *                       type: object
 *                       properties:
 *                         distanceUnit:
 *                           type: string
 *                         energyUnit:
 *                           type: string
 *                         startOfWeek:
 *                           type: string
 *       400:
 *         description: Invalid enum value or validation error
 */
router.patch('/me/preferences', userController.updatePreferences);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get user profile by user ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (UUID)
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/:id', userController.getUserById);

export default router;
