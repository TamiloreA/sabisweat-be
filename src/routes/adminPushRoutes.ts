/**
 * Admin Push Routes
 * Endpoints for testing, admin token inspection, manual dispatch, and cron execution.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getUserDevices } from '../controllers/deviceController';
import {
  dispatchToUser,
  sendTestPush,
  runCron,
} from '../controllers/notificationAdminController';

const router = Router();

/**
 * @openapi
 * /admin/push/tokens:
 *   get:
 *     summary: Get registered push tokens (Admin/Testing)
 *     tags: [Admin Push]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of registered tokens
 */
router.get('/tokens', requireAuth, getUserDevices);

/**
 * @openapi
 * /admin/push/send-to-user:
 *   post:
 *     summary: Send a push notification to a user
 *     tags: [Admin Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, title, body]
 *             properties:
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Notification dispatched
 */
router.post('/send-to-user', requireAuth, dispatchToUser);

/**
 * @openapi
 * /admin/push/test:
 *   post:
 *     summary: Send a test push notification to a specific token
 *     tags: [Admin Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, title, body]
 *             properties:
 *               token:
 *                 type: string
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Push result
 */
router.post('/test', requireAuth, sendTestPush);

/**
 * @openapi
 * /admin/push/cron-run:
 *   post:
 *     summary: Trigger notification cron execution manually
 *     tags: [Admin Push]
 *     responses:
 *       200:
 *         description: Cron run result
 */
router.post('/cron-run', runCron);

export default router;
