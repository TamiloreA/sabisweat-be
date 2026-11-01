/**
 * Achievement Routes
 *
 * REST endpoints for user achievements, streaks, and milestone badges.
 */

import { Router } from 'express';
import { getAchievementsSummary } from '../controllers/achievementController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /achievements/summary:
 *   get:
 *     summary: Get unified user achievements summary
 *     description: "Returns consolidated badge and milestone progress across 5 categories (Step Milestones, Daily Streaks, Monthly Badges, Invite Badges, and Completed Challenges). All earned badges are permanently retained."
 *     tags: [Achievements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *           default: Africa/Lagos
 *         description: "IANA timezone (e.g. Africa/Lagos, America/New_York) to resolve the active calendar month"
 *     responses:
 *       200:
 *         description: Consolidated achievement summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     stepMilestones:
 *                       type: object
 *                       properties:
 *                         currentProgress:
 *                           type: integer
 *                           example: 542310
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: step_10k
 *                               title:
 *                                 type: string
 *                                 example: 10k steps
 *                               threshold:
 *                                 type: integer
 *                                 example: 10000
 *                               displayValue:
 *                                 type: string
 *                                 example: 10K
 *                               earned:
 *                                 type: boolean
 *                                 example: true
 *                               earnedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                     dailyStreaks:
 *                       type: object
 *                       properties:
 *                         currentStreak:
 *                           type: integer
 *                           example: 14
 *                         longestStreak:
 *                           type: integer
 *                           example: 45
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: streak_40
 *                               title:
 *                                 type: string
 *                                 example: 40 Days Streak
 *                               threshold:
 *                                 type: integer
 *                                 example: 40
 *                               displayValue:
 *                                 type: string
 *                                 example: "40"
 *                               earned:
 *                                 type: boolean
 *                                 example: true
 *                               earnedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                     monthlyBadges:
 *                       type: object
 *                       properties:
 *                         activeMonth:
 *                           type: string
 *                           example: "2026-03"
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: monthly_2026_03_20k
 *                               title:
 *                                 type: string
 *                                 example: March 20k steps
 *                               subtitle:
 *                                 type: string
 *                                 example: Mar 2026
 *                               month:
 *                                 type: string
 *                                 example: "2026-03"
 *                               threshold:
 *                                 type: integer
 *                                 example: 20000
 *                               tier:
 *                                 type: string
 *                                 enum: [tier_1, tier_2]
 *                                 example: tier_1
 *                               earned:
 *                                 type: boolean
 *                                 example: true
 *                               earnedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                     inviteBadges:
 *                       type: object
 *                       properties:
 *                         successfulReferralCount:
 *                           type: integer
 *                           example: 12
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: invite_1
 *                               title:
 *                                 type: string
 *                                 example: Invite 1 person
 *                               threshold:
 *                                 type: integer
 *                                 example: 1
 *                               displayValue:
 *                                 type: string
 *                                 example: "1"
 *                               subValue:
 *                                 type: string
 *                                 example: SabiSweat
 *                               earned:
 *                                 type: boolean
 *                                 example: true
 *                               earnedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                     challengesCompleted:
 *                       type: object
 *                       properties:
 *                         totalCompleted:
 *                           type: integer
 *                           example: 1
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: challenge_e0a088f2-9f77-4e65-bdd3-568e8ca6f48d
 *                               challengeId:
 *                                 type: string
 *                                 example: e0a088f2-9f77-4e65-bdd3-568e8ca6f48d
 *                               title:
 *                                 type: string
 *                                 example: Abuja 100K Steps
 *                               subtitle:
 *                                 type: string
 *                                 example: March 2026
 *                               rewardId:
 *                                 type: string
 *                                 example: emerald
 *                               earned:
 *                                 type: boolean
 *                                 example: true
 *                               earnedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *       401:
 *         description: Missing or invalid token
 */
router.get('/summary', requireAuth, getAchievementsSummary);

export default router;
