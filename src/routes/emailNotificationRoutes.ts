/**
 * Email Notification Routes
 * Dedicated endpoints for email category preference toggles.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { toggleEmailCategory } from '../controllers/preferenceController';

const router = Router();

/**
 * @openapi
 * /email-notifications/{categoryKey}:
 *   patch:
 *     summary: Toggle a single email notification category
 *     tags: [Email Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryKey
 *         required: true
 *         schema:
 *           type: string
 *         example: "weekly-activity-summary"
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
 *         description: Email category preference updated
 */
router.patch('/:categoryKey', requireAuth, toggleEmailCategory);

export default router;
