/**
 * Weekly Report Routes
 * Exposes GET /weekly-report and /api/v1/weekly-report
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getWeeklyReport } from '../controllers/healthController';

const router = Router();

// Requires authentication
router.use(requireAuth);

/**
 * @openapi
 * /weekly-report:
 *   get:
 *     summary: Get weekly performance report
 *     description: Aggregates 7 days of activity starting from weekStartDate. If weekStartDate is omitted, resolves current week start based on user's startOfWeek preference (default Saturday).
 *     tags: [WeeklyReport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: weekStartDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the week (YYYY-MM-DD). If omitted, resolves using user's startOfWeek preference.
 *         example: "2026-11-07"
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *         description: User IANA timezone (default Africa/Lagos)
 *         example: "Africa/Lagos"
 *     responses:
 *       200:
 *         description: Weekly report data
 *       401:
 *         description: Unauthorized
 */
router.get('/', getWeeklyReport);

export default router;
