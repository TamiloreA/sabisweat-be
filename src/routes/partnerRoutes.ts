import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as rewardController from '../controllers/rewardController';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /partners:
 *   get:
 *     summary: Partners directory
 *     description: Returns directory of active partners filterable by category and city.
 *     tags: [Partners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Partner category (e.g. cafes, gyms, spas, sports_venue)
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City filter (e.g. Lagos)
 *     responses:
 *       200:
 *         description: Partners list
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
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       category:
 *                         type: string
 *                       city:
 *                         type: string
 *                       country:
 *                         type: string
 *                       countryCode:
 *                         type: string
 *                       coverImageUrl:
 *                         type: string
 *                       logoImageUrl:
 *                         type: string
 *                       address:
 *                         type: string
 *       401:
 *         description: Not authenticated
 */
router.get('/', rewardController.getPartners);

/**
 * @openapi
 * /partners/{id}:
 *   get:
 *     summary: Partner profile with active rewards
 *     description: Returns partner profile details, gallery, and active rewards only.
 *     tags: [Partners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Partner ID
 *     responses:
 *       200:
 *         description: Partner detail
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     city:
 *                       type: string
 *                     country:
 *                       type: string
 *                     coverImageUrl:
 *                       type: string
 *                     logoImageUrl:
 *                       type: string
 *                     address:
 *                       type: string
 *                     gallery:
 *                       type: array
 *                       items:
 *                         type: string
 *                     activeRewards:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           pointsCost:
 *                             type: integer
 *                           imageUrl:
 *                             type: string
 *       404:
 *         description: Partner not found
 *       401:
 *         description: Not authenticated
 */
router.get('/:id', rewardController.getPartnerById);

export default router;
