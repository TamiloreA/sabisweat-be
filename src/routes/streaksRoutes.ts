import { Router } from 'express';
import * as streaksController from '../controllers/streaksController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /streaks/current:
 *   get:
 *     summary: Get current streak, longest streak, and per-day history
 *     tags: [Streaks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Streak summary with hit/miss/restored dates
 */
router.get('/current', streaksController.getCurrentStreak);

/**
 * @openapi
 * /streaks/calendar:
 *   get:
 *     summary: Get monthly streak calendar
 *     tags: [Streaks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           example: 2026-09
 *     responses:
 *       200:
 *         description: Per-day steps and status for the month
 */
router.get('/calendar', streaksController.getStreakCalendar);

/**
 * @openapi
 * /streaks/life-happens/balance:
 *   get:
 *     summary: Get Life Happens Pass balance (grants monthly free pass if due)
 *     tags: [Streaks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current pass count
 */
router.get('/life-happens/balance', streaksController.getPassBalance);

/**
 * @openapi
 * /streaks/life-happens:
 *   post:
 *     summary: Use a Life Happens Pass to save the streak on a missed day
 *     tags: [Streaks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date]
 *             properties:
 *               date:
 *                 type: string
 *                 example: 2026-09-08
 *     responses:
 *       200:
 *         description: Pass redeemed
 *       400:
 *         description: Validation error (no passes, already redeemed, day not missed)
 */
router.post('/life-happens', streaksController.redeemPass);

/**
 * @openapi
 * /streaks/life-happens/purchase:
 *   post:
 *     summary: Buy an extra Life Happens Pass with points
 *     tags: [Streaks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pass purchased
 *       400:
 *         description: Not enough points
 */
router.post('/life-happens/purchase', streaksController.purchasePass);

export default router;
