/**
 * Challenge Routes
 *
 * REST endpoints for challenges management.
 */

import { Router } from 'express';
import {
  getActiveChallenges,
  getAvailableChallenges,
  getClubChallenges,
  getChallengeById,
  joinChallenge,
  leaveChallenge,
  getLeaderboard,
  claimReward,
} from '../controllers/challengeController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /challenges/active:
 *   get:
 *     summary: Get challenges the current user has joined
 *     description: Returns active joined challenges along with progress data. Note that progress (steps) is calculated starting from the date the user joined the challenge (joined_at), not the challenge start date.
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active joined challenges with progress data
 *       401:
 *         description: Missing or invalid token
 */
router.get('/active', requireAuth, getActiveChallenges);

/**
 * @openapi
 * /challenges/available:
 *   get:
 *     summary: Get challenges available to join (not yet joined)
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Filter by region
 *     responses:
 *       200:
 *         description: List of available challenges
 *       401:
 *         description: Missing or invalid token
 */
router.get('/available', requireAuth, getAvailableChallenges);

/**
 * @openapi
 * /challenges/club/{clubId}:
 *   get:
 *     summary: Get all challenges owned by a club
 *     description: Returns all challenges created and hosted by the specified club. If authenticated, includes the user's participation status and step progress.
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier of the club (UUID) or club handle/tag (e.g. "@the_movers" or "the_movers")
 *         example: "43bf4206-8d65-4f35-985e-5bb49dfa68c0"
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all, active, upcoming, past]
 *           default: all
 *         description: Filter challenges by status
 *     responses:
 *       200:
 *         description: List of challenges owned by the club
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
 *                     $ref: '#/components/schemas/Challenge'
 *       400:
 *         description: Missing or invalid club ID
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Club not found
 */
router.get('/club/:clubId', requireAuth, getClubChallenges);

/**
 * @openapi
 * /challenges/{id}:
 *   get:
 *     summary: Get a single challenge by ID
 *     description: Returns challenge details, user join status, and progress. Progress steps are only counted from the date the user joined the challenge.
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Challenge details with user-specific join/progress data
 *       404:
 *         description: Challenge not found
 *       401:
 *         description: Missing or invalid token
 */
router.get('/:id', requireAuth, getChallengeById);

/**
 * @openapi
 * /challenges/{id}/join:
 *   post:
 *     summary: Join a challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully joined
 *       400:
 *         description: Challenge ended or full
 *       404:
 *         description: Challenge not found
 *       401:
 *         description: Missing or invalid token
 */
router.post('/:id/join', requireAuth, joinChallenge);

/**
 * @openapi
 * /challenges/{id}/leave:
 *   post:
 *     summary: Leave a challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully left
 *       401:
 *         description: Missing or invalid token
 */
router.post('/:id/leave', requireAuth, leaveChallenge);

/**
 * @openapi
 * /challenges/{id}/leaderboard:
 *   get:
 *     summary: Get challenge leaderboard (paginated)
 *     description: Ranked by total steps. Steps are only counted from the date each user joined the challenge.
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated leaderboard with user profiles and step counts
 *       404:
 *         description: Challenge not found
 *       401:
 *         description: Missing or invalid token
 */
router.get('/:id/leaderboard', requireAuth, getLeaderboard);

/**
 * @openapi
 * /challenges/{id}/claim:
 *   post:
 *     summary: Claim reward for a completed challenge
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reward claimed
 *       400:
 *         description: Not eligible or already claimed
 *       404:
 *         description: Challenge not found
 *       401:
 *         description: Missing or invalid token
 */
router.post('/:id/claim', requireAuth, claimReward);

export default router;
