import { Router } from 'express';
import * as homeController from '../controllers/homeController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /home/summary:
 *   get:
 *     summary: Get home screen summary data
 *     description: Returns consolidated home dashboard data including today's steps, active streak, daily goal progress, 7-day average steps, and user profile information.
 *     tags: [Home]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Home screen summary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *                       nullable: true
 *                     firstName:
 *                       type: string
 *                       nullable: true
 *                     lastName:
 *                       type: string
 *                       nullable: true
 *                     stepsToday:
 *                       type: integer
 *                       example: 4500
 *                     distanceTodayKm:
 *                       type: number
 *                       example: 3.2
 *                     stepGoal:
 *                       type: integer
 *                       example: 10000
 *                     progressPercent:
 *                       type: integer
 *                       example: 45
 *                     dailyAvgSteps:
 *                       type: integer
 *                       example: 7200
 *                     todayFeedPreview:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Not authenticated
 */
router.get('/summary', homeController.getHomeSummary);

export default router;
