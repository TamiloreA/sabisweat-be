import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as rewardController from '../controllers/rewardController';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /rewards:
 *   get:
 *     summary: Global active rewards discovery feed
 *     description: Returns active rewards available across partners, including partner name and city.
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active rewards feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "rew-1"
 *                       title:
 *                         type: string
 *                         example: "Free Popcorn & Soda"
 *                       points_cost:
 *                         type: integer
 *                         example: 150
 *                       partner_id:
 *                         type: string
 *                         example: "part-1"
 *                       partners:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: "Filmhouse Cinemas"
 *                           city:
 *                             type: string
 *                             example: "Lagos"
 *       401:
 *         description: Not authenticated
 */
router.get('/', rewardController.getRewards);

/**
 * @openapi
 * /rewards/{id}/qr:
 *   post:
 *     summary: Generate reward QR code pre-redemption token
 *     description: Generates a signed 15-minute JWT token for reward redemption. Points are NOT deducted at this stage.
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Reward ID
 *     responses:
 *       200:
 *         description: Signed token details
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
 *                     token:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     rewardId:
 *                       type: string
 *                     partnerId:
 *                       type: string
 *                     pointsCost:
 *                       type: integer
 *                       example: 150
 *                     nonce:
 *                       type: string
 *       400:
 *         description: Insufficient points balance
 *       404:
 *         description: Reward not found or inactive
 *       401:
 *         description: Not authenticated
 */
router.post('/:id/qr', rewardController.generateRewardQR);

export default router;

