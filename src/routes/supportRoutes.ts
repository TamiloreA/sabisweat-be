/**
 * Support Routes
 *
 * REST endpoints for Help & Support screen: FAQs and account deletion.
 */

import { Router } from 'express';
import { getFaqs, deleteAccountRequest } from '../controllers/supportController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /support/faqs:
 *   get:
 *     summary: Get all published FAQs
 *     description: Returns published FAQs ordered by order in ascending order, used by the Help & Support screen.
 *     tags: [Support]
 *     responses:
 *       200:
 *         description: List of published FAQs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     example: "f1-earn-coins"
 *                   question:
 *                     type: string
 *                     example: "How do I earn Sabi coins?"
 *                   answer:
 *                     type: string
 *                     example: "You earn Sabi coins by completing daily step goals, joining challenges, and participating in clubs."
 *                   category:
 *                     type: string
 *                     example: "Rewards"
 *                   order:
 *                     type: integer
 *                     example: 1
 *                   is_published:
 *                     type: boolean
 *                     example: true
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 *                     example: "2026-11-01T12:00:00Z"
 *       500:
 *         description: Server error
 */
router.get('/faqs', getFaqs);

/**
 * @openapi
 * /support/account/delete-request:
 *   post:
 *     summary: Request account deletion
 *     description: Submits an account deletion request for the authenticated user.
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion request received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Account deletion request submitted."
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/account/delete-request', requireAuth, deleteAccountRequest);

export default router;
