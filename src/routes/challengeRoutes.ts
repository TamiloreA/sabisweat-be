/**
 * Challenge Routes
 *
 * REST endpoints for challenges management.
 */

import { Router } from 'express';
import {
  getActiveChallenges,
  getAvailableChallenges,
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
