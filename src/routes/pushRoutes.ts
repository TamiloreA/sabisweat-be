/**
 * Push Notification Routes
 * Handles device registration, unregistration, push preferences, and category toggles.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  registerDevice,
  unregisterDevice,
  getUserDevices,
} from '../controllers/deviceController';
import {
  getPreferences,
  updatePreferences,
  togglePushCategory,
} from '../controllers/preferenceController';

const router = Router();

/**
 * @openapi
 * /push/register:
 *   post:
 *     summary: Register an Expo push token for the authenticated user's device
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, platform]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
 *               platform:
 *                 type: string
 *                 enum: [ios, android, web]
 *                 example: "ios"
 *               deviceId:
 *                 type: string
 *                 example: "device_abc123"
 *               deviceName:
 *                 type: string
 *                 example: "iPhone 15 Pro"
 *               appId:
 *                 type: string
 *                 example: "com.sabisweat.app"
 *               appVersion:
 *                 type: string
 *                 example: "1.0.0"
 *               expoProjectId:
 *                 type: string
 *                 example: "your-expo-project-id"
 *               timezone:
 *                 type: string
 *                 example: "Africa/Lagos"
 *               locale:
 *                 type: string
 *                 example: "en"
 *               notificationsEnabled:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Device registered successfully
 *       400:
 *         description: Invalid payload or token format
 *       401:
 *         description: Unauthorized
 */
router.post('/register', requireAuth, registerDevice);

/**
 * @openapi
 * /push/unregister:
 *   post:
 *     summary: Unregister/deactivate an Expo push token
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Push token deactivated successfully
 */
router.post('/unregister', requireAuth, unregisterDevice);

/**
 * @openapi
 * /push/tokens:
 *   get:
 *     summary: Get all registered devices for the authenticated user
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of registered devices
 */
router.get('/tokens', requireAuth, getUserDevices);

/**
 * @openapi
 * /push/preferences:
 *   get:
 *     summary: Get user's notification preferences
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's notification preferences
 *   put:
 *     summary: Update user's notification preferences
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categories:
 *                 type: object
 *               emailCategories:
 *                 type: object
 *               quietHours:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   start:
 *                     type: string
 *                   end:
 *                     type: string
 *               dailyCap:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated preferences
 */
router.get('/preferences', requireAuth, getPreferences);
router.put('/preferences', requireAuth, updatePreferences);

/**
 * @openapi
 * /push/preferences/{categoryKey}:
 *   patch:
 *     summary: Toggle a single push notification category
 *     tags: [Push Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryKey
 *         required: true
 *         schema:
 *           type: string
 *         example: "daily-steps-reminder"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Category toggle updated
 */
router.patch('/preferences/:categoryKey', requireAuth, togglePushCategory);

export default router;
