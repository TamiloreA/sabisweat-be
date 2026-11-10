import { Router } from 'express';
import * as pointsController from '../controllers/pointsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /points/balance:
 *   get:
 *     summary: Get user points balance and Sabi Level
 *     description: Returns the authenticated user's current SabiCoins balance and Sabi Level.
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User points balance and level
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
 *                     balance:
 *                       type: integer
 *                       example: 1250
 *                     sabiLevel:
 *                       type: string
 *                       example: "Starter"
 *       401:
 *         description: Not authenticated
 */
router.get('/balance', pointsController.getPointsBalance);

/**
 * @openapi
 * /points/history:
 *   get:
 *     summary: Get user points transaction ledger history
 *     description: Returns paginated ledger transactions with positive amounts for earned coins and negative for redemptions.
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Page index (0-based)
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Paginated transaction list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 page:
 *                   type: integer
 *                   example: 0
 *                 size:
 *                   type: integer
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       amount:
 *                         type: integer
 *                         example: 250
 *                       source:
 *                         type: string
 *                         example: "challenge_reward"
 *                       description:
 *                         type: string
 *                         example: "Completed Lagos 10k Steps Challenge"
 *                       created_at:
 *                         type: string
 *                         example: "2026-11-09T18:30:00.000Z"
 *       401:
 *         description: Not authenticated
 */
router.get('/history', pointsController.getPointsHistory);

export default router;
