import { Router } from 'express';
import * as newsController from '../controllers/newsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /news:
 *   post:
 *     summary: Create a news article or poll (admin)
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               description:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               kind:
 *                 type: string
 *                 enum: [article, poll]
 *                 default: article
 *               pollOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Required when kind = poll (min 2)
 *               pollEndsAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: News created
 *       400:
 *         description: Validation error
 */
router.post('/', newsController.createNews);

/**
 * @openapi
 * /news:
 *   get:
 *     summary: Get all news (articles and polls), newest first
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of news items with counts, likedByMe, and poll data when applicable
 */
router.get('/', newsController.getNews);

/**
 * @openapi
 * /news/polls/vote:
 *   post:
 *     summary: Vote on a poll option (switches vote if already voted)
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [optionId]
 *             properties:
 *               optionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated poll state
 */
router.post('/polls/vote', newsController.voteOnPoll);

/**
 * @openapi
 * /news/{id}/poll/results:
 *   get:
 *     summary: Get full poll result with per-option voter lists
 *     tags: [News]
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
 *         description: Poll result breakdown
 *       404:
 *         description: Poll not found
 */
router.get('/:id/poll/results', newsController.getPollResult);

/**
 * @openapi
 * /news/{id}:
 *   get:
 *     summary: Get a single news item with comments
 *     tags: [News]
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
 *         description: News detail with comments
 *       404:
 *         description: News not found
 */
router.get('/:id', newsController.getNewsById);

/**
 * @openapi
 * /news/{id}/like:
 *   post:
 *     summary: Like a news item
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Like state and updated count
 */
router.post('/:id/like', newsController.likeNews);

/**
 * @openapi
 * /news/{id}/like:
 *   delete:
 *     summary: Unlike a news item
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Like state and updated count
 */
router.delete('/:id/like', newsController.unlikeNews);

/**
 * @openapi
 * /news/{id}/comments:
 *   post:
 *     summary: Comment on a news item
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 */
router.post('/:id/comments', newsController.addNewsComment);

export default router;
