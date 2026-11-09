import { Router } from 'express';
import * as pointsController from '../controllers/pointsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /points/balance:
 *   get:
 *     summary: Get user points balance
 *     description: Returns the user's current SabiCoins balance and reward points.
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User points balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pointsBalance:
 *                   type: integer
 *                   example: 1250
 *       401:
 *         description: Not authenticated
 */
router.get('/balance', pointsController.getPointsBalance);

export default router;
