import { Router } from 'express';
import * as versionController from '../controllers/versionController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /app-version:
 *   get:
 *     summary: Get app version config and update status
 *     description: Returns the latest and minimum supported app versions, along with force update requirements. Public endpoint (no auth required).
 *     tags: [App Version]
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [ios, android, all]
 *         description: Optional mobile OS platform
 *     responses:
 *       200:
 *         description: App version configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 latestVersion:
 *                   type: string
 *                   example: "1.0.11"
 *                 minimumVersion:
 *                   type: string
 *                   example: "1.0.0"
 *                 forceUpdate:
 *                   type: boolean
 *                   example: false
 *                 data:
 *                   type: object
 *                   properties:
 *                     latestVersion:
 *                       type: string
 *                       example: "1.0.11"
 *                     minimumVersion:
 *                       type: string
 *                       example: "1.0.0"
 *                     forceUpdate:
 *                       type: boolean
 *                       example: false
 *                     releaseNotes:
 *                       type: string
 *                       nullable: true
 *                       example: "Performance improvements and bug fixes"
 *                     storeUrl:
 *                       type: string
 *                       nullable: true
 *                       example: "https://apps.apple.com/app/sabisweat"
 */
router.get('/', versionController.getAppVersion);

/**
 * @openapi
 * /app-version:
 *   patch:
 *     summary: Update app version configuration
 *     description: Update version requirements for a platform. Requires authentication.
 *     tags: [App Version]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [ios, android, all]
 *                 default: all
 *               latestVersion:
 *                 type: string
 *                 example: "1.0.12"
 *               minimumVersion:
 *                 type: string
 *                 example: "1.0.0"
 *               forceUpdate:
 *                 type: boolean
 *                 example: false
 *               releaseNotes:
 *                 type: string
 *                 example: "Fixed community join request bug"
 *               storeUrl:
 *                 type: string
 *                 example: "https://apps.apple.com/app/sabisweat"
 *     responses:
 *       200:
 *         description: App version configuration updated successfully
 */
router.patch('/', requireAuth, versionController.updateAppVersion);

export default router;
