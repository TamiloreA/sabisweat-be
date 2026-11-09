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
  disburseRewards,
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
 *     description: Evaluates and dispatches pending scheduled notifications, Expo push receipt checks, Morning Kickoff (7:00 AM local time), Streak at Risk (8:30 PM local time), and Challenge 24-hr ending soon warnings.
 *     tags: [Admin Push]
 *     responses:
 *       200:
 *         description: Cron run result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 processed:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *                   properties:
 *                     schedules:
 *                       type: object
 *                     receipts:
 *                       type: object
 *                     morningKickoff:
 *                       type: object
 *                       properties:
 *                         evaluated:
 *                           type: integer
 *                         sent:
 *                           type: integer
 *                     streakAtRisk:
 *                       type: object
 *                       properties:
 *                         evaluated:
 *                           type: integer
 *                         sent:
 *                           type: integer
 *                     challengeEndingSoon:
 *                       type: object
 *                       properties:
 *                         challengesChecked:
 *                           type: integer
 *                         sent:
 *                           type: integer
 */
router.post('/cron-run', runCron);

/**
 * @openapi
 * /admin/push/challenges/{challengeId}/disburse-rewards:
 *   post:
 *     summary: Disburse rewards for a completed challenge and notify participants
 *     description: Calculates final leaderboard ranks, disburses SabiCoins to Rank 1 (Champion) and Ranks 2-5 (Top 5), awards badges and coins to 100% goal achievers, and dispatches rich push notifications with deep links.
 *     tags: [Admin Push]
 *     parameters:
 *       - in: path
 *         name: challengeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the challenge to disburse rewards for
 *     responses:
 *       200:
 *         description: Rewards disbursed successfully
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
 *                     challengeId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     disbursed:
 *                       type: boolean
 *                     winnersCount:
 *                       type: integer
 *                     notificationsSent:
 *                       type: integer
 *       400:
 *         description: Missing or invalid challengeId
 *       500:
 *         description: Disbursement failed
 */
router.post('/challenges/:challengeId/disburse-rewards', disburseRewards);

export default router;
