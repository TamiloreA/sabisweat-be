import { Router } from 'express';
import * as healthController from '../controllers/healthController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /health/sync:
 *   post:
 *     summary: Sync single-day step and activity data
 *     description: Saves daily steps, distance, active calories, and evaluates goal completion and streak progression.
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, steps]
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-10-28"
 *               steps:
 *                 type: integer
 *                 example: 8500
 *               distanceKm:
 *                 type: number
 *                 example: 6.2
 *               activeCalories:
 *                 type: number
 *                 example: 320
 *               source:
 *                 type: string
 *                 example: "apple_health"
 *               timeZone:
 *                 type: string
 *                 example: "Africa/Lagos"
 *     responses:
 *       200:
 *         description: Sync successful
 *       401:
 *         description: Unauthorized
 */
router.post('/sync', healthController.syncStepData);

/**
 * @openapi
 * /health/sync/batch:
 *   post:
 *     summary: Batch sync step and activity data across multiple days
 *     description: Accepts an array of daily activity records or an object containing a records array. Upserts daily steps, distance, and active calories.
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: array
 *                 items:
 *                   type: object
 *                   required: [date, steps]
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2026-10-27"
 *                     steps:
 *                       type: integer
 *                       example: 9400
 *                     distanceKm:
 *                       type: number
 *                       example: 7.1
 *                     activeCalories:
 *                       type: number
 *                       example: 390
 *               - type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     example: "ios"
 *                   records:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [date, steps]
 *                       properties:
 *                         date:
 *                           type: string
 *                           format: date
 *                           example: "2026-10-27"
 *                         steps:
 *                           type: integer
 *                           example: 9400
 *                         distanceKm:
 *                           type: number
 *                           example: 7.1
 *                         activeCalories:
 *                           type: number
 *                           example: 390
 *     responses:
 *       200:
 *         description: Batch sync successful
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
router.post('/sync/batch', healthController.syncStepDataBatch);

/**
 * @openapi
 * /health/history:
 *   get:
 *     summary: Get user health history within date range
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-10-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-10-28"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 30
 *     responses:
 *       200:
 *         description: Health history records
 *       401:
 *         description: Unauthorized
 */
router.get('/history', healthController.getHealthHistory);

/**
 * @openapi
 * /health/history/all:
 *   get:
 *     summary: Get all recorded health history for user
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all historical health entries
 *       401:
 *         description: Unauthorized
 */
router.get('/history/all', healthController.getHealthHistoryAll);

/**
 * @openapi
 * /health/step-goal:
 *   patch:
 *     summary: Update daily step goal
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stepGoal]
 *             properties:
 *               stepGoal:
 *                 type: integer
 *                 minimum: 1000
 *                 example: 10000
 *     responses:
 *       200:
 *         description: Step goal updated successfully
 *       400:
 *         description: Invalid step goal
 *       401:
 *         description: Unauthorized
 */
router.patch('/step-goal', healthController.updateStepGoal);

/**
 * @openapi
 * /health/today:
 *   get:
 *     summary: Get today's recorded step metrics and goal progress
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's steps and progress
 *       401:
 *         description: Unauthorized
 */
router.get('/today', healthController.getTodaySteps);

/**
 * @openapi
 * /health/reports/weekly:
 *   get:
 *     summary: Get weekly performance report
 *     description: Computes weekly totals (steps, distanceKm, activeCalories), day-by-day 7-day breakdown (Sunday to Saturday), percentage changes compared to prior week baseline (or matching elapsed days if week is in progress), best day highlights, and community top-percent rank among active users.
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: weekStartDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-10-18"
 *         description: Starting date of the week (must be a Sunday in YYYY-MM-DD format)
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *           default: "Africa/Lagos"
 *           example: "Africa/Lagos"
 *         description: User IANA timezone identifier
 *     responses:
 *       200:
 *         description: Weekly report data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WeeklyReportResponse'
 *       400:
 *         description: Missing or invalid weekStartDate
 *       401:
 *         description: Unauthorized
 */
router.get('/reports/weekly', healthController.getWeeklyReport);

export default router;
