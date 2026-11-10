import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as partnerPortalController from '../controllers/partnerPortalController';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /partner-portal/home/overview:
 *   get:
 *     summary: Partner portal overview metrics
 *     description: Returns partner profile, summary metrics, and recent redemptions for authorized staff.
 *     tags: [Partner Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: partnerId
 *         schema:
 *           type: string
 *         description: Optional partner ID for staff with multiple partners
 *     responses:
 *       200:
 *         description: Overview metrics
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
 *                     partner:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         logoImageUrl:
 *                           type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         coinsValueRedeemed:
 *                           type: integer
 *                         redemptions:
 *                           type: integer
 *                         coinsRedeemed:
 *                           type: integer
 *                         customers:
 *                           type: integer
 *                         partnerPointsBalance:
 *                           type: integer
 *                     recentRedemptions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           userName:
 *                             type: string
 *                           avatarUrl:
 *                             type: string
 *                           pointsSpent:
 *                             type: integer
 *                           rewardTitle:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           status:
 *                             type: string
 *                           statusLabel:
 *                             type: string
 *       403:
 *         description: Unauthorized staff
 *       401:
 *         description: Not authenticated
 */
router.get('/home/overview', partnerPortalController.getOverview);

/**
 * @openapi
 * /partner-portal/redeem:
 *   post:
 *     summary: Scan & redeem QR code
 *     description: Verifies QR token, checks nonce, deducts points from customer balance, records redemption and negative ledger entry, credits partner points, and sends customer push notification.
 *     tags: [Partner Portal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token scanned from customer QR code
 *     responses:
 *       200:
 *         description: Redemption completed successfully
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
 *                     redemptionId:
 *                       type: string
 *                     userName:
 *                       type: string
 *                     avatarUrl:
 *                       type: string
 *                     rewardTitle:
 *                       type: string
 *                     pointsSpent:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     statusLabel:
 *                       type: string
 *                       example: "Redeemed"
 *                     message:
 *                       type: string
 *                       example: "Redemption completed successfully"
 *       400:
 *         description: Invalid QR, expired, or customer has insufficient points
 *       403:
 *         description: Staff not authorized for this partner
 *       409:
 *         description: QR token already redeemed
 *       401:
 *         description: Not authenticated
 */
router.post('/redeem', partnerPortalController.redeem);

/**
 * @openapi
 * /partner-portal/partners:
 *   get:
 *     summary: Get authorized partners for staff
 *     description: Returns partner accounts managed by the authenticated staff member.
 *     tags: [Partner Portal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of authorized partners
 *       401:
 *         description: Not authenticated
 */
router.get('/partners', partnerPortalController.getPartners);

/**
 * @openapi
 * /partner-portal/partners/{partnerId}/rewards:
 *   get:
 *     summary: Get partner rewards
 *     description: Returns rewards belonging to the specified partner for authorized staff.
 *     tags: [Partner Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Partner rewards list
 *       403:
 *         description: Unauthorized staff
 *       401:
 *         description: Not authenticated
 */
router.get('/partners/:partnerId/rewards', partnerPortalController.getPartnerRewards);

/**
 * @openapi
 * /partner-portal/partners/{partnerId}/rewards:
 *   post:
 *     summary: Create reward for partner
 *     description: Creates a new reward for the partner. Supports base64 image upload to storage.
 *     tags: [Partner Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, pointsCost]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               pointsCost:
 *                 type: integer
 *               imageBase64:
 *                 type: string
 *     responses:
 *       201:
 *         description: Reward created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Unauthorized staff
 *       401:
 *         description: Not authenticated
 */
router.post('/partners/:partnerId/rewards', partnerPortalController.createReward);

export default router;
