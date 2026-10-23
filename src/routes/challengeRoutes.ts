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
  createChallenge,
  joinChallenge,
  leaveChallenge,
  getLeaderboard,
  claimReward,
} from '../controllers/challengeController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /challenges:
 *   post:
 *     summary: Create a new challenge
 *     description: Create a standalone challenge or a challenge hosted by a club. If hostClubId is provided, the authenticated user must be a club admin. Base64 images are uploaded to storage automatically.
 *     tags: [Challenges]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startAt, endAt]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "30-Day Step Challenge"
 *               subtitle:
 *                 type: string
 *                 example: "Hit 10,000 steps daily"
 *               description:
 *                 type: string
 *                 example: "Walk or run every day to earn rewards."
 *               rewardText:
 *                 type: string
 *                 example: "5,000 Sabi Coins + Exclusive Badge"
 *               rewardId:
 *                 type: string
 *                 description: Reward or badge identifier
 *                 example: "badge_01"
 *               heroImageUrl:
 *                 type: string
 *               heroImageBase64:
 *                 type: string
 *                 description: Base64 data URL (e.g. data:image/jpeg;base64,...)
 *               challengeImage:
 *                 type: string
 *               challengeImageBase64:
 *                 type: string
 *                 description: Base64 data URL (e.g. data:image/jpeg;base64,...)
 *               rules:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Must record at least 5,000 steps daily", "Synced via app tracking only"]
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Complete 5,000 steps daily for 7 days"]
 *               hostClubId:
 *                 type: string
 *                 description: Club UUID or club tag/handle to associate this challenge with (host details are automatically derived from this club)
 *                 example: "43bf4206-8d65-4f35-985e-5bb49dfa68c0"
 *               goalType:
 *                 type: string
 *                 default: steps
 *                 example: steps
 *               goalValue:
 *                 type: integer
 *                 example: 10000
 *               maxParticipants:
 *                 type: integer
 *                 example: 500
 *               cityTag:
 *                 type: string
 *                 example: Lagos
 *               country:
 *                 type: string
 *                 example: Nigeria
 *               region:
 *                 type: string
 *                 example: Lagos
 *               whoCanJoin:
 *                 type: string
 *                 enum: [everyone, club_members]
 *                 default: everyone
 *                 description: Who is allowed to join the challenge
 *                 example: everyone
 *               leaderboardVisibility:
 *                 type: string
 *                 enum: [public, private]
 *                 default: public
 *                 description: Whether the leaderboard is visible to everyone or only participants
 *                 example: public
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-11-01T00:00:00.000Z"
 *               endAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-11-30T23:59:59.000Z"
 *     responses:
 *       201:
 *         description: Challenge created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Challenge'
 *       400:
 *         description: Validation error or invalid dates
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Only club admins can create challenges for this club
 *       404:
 *         description: Club not found
 */
router.post('/', requireAuth, createChallenge);

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
