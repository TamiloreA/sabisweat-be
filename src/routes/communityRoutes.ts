import { Router } from 'express';
import { getFeed, createPost, likePost, unlikePost, addComment, getComments, getPostById, createClub, getClubs, getClubById, getClubPosts, voteOnPoll, getCommunityPollResult, createClubEvent, getClubEvents, rsvpClubEvent, requestJoinClub,  getClubJoinRequests,
  resolveJoinRequest,
  getClubMembers,
  updateClubDescription
} from '../controllers/communityController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /community/feeds:
 *   get:
 *     summary: Get the community feed (paginated, newest first)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated list of posts with author details, counts, and likedByMe
 *       401:
 *         description: Missing or invalid token
 */
router.get('/feeds', requireAuth, getFeed);

/**
 * @openapi
 * /community/posts:
 *   post:
 *     summary: Create a community post (accepts base64 images, uploaded to storage)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tag:
 *                 type: string
 *               imagesUrl:
 *                 type: array
 *                 items:
 *                   type: string
 *               imagesBase64:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Base64 strings or data URLs (data:image/jpeg;base64,...)
 *               clubId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Post created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid token
 */
router.post('/posts', requireAuth, createPost);

/**
 * @openapi
 * /community/posts/{id}/like:
 *   post:
 *     summary: Like a post
 *     tags: [Community]
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
 *         description: Like state and updated count
 */
router.post('/posts/:id/like', requireAuth, likePost);

/**
 * @openapi
 * /community/posts/{id}/like:
 *   delete:
 *     summary: Unlike a post
 *     tags: [Community]
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
 *         description: Like state and updated count
 */
router.delete('/posts/:id/like', requireAuth, unlikePost);

/**
 * @openapi
 * /community/posts/{id}/comment:
 *   post:
 *     summary: Add a comment (or reply via parentCommentId)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *               parentCommentId:
 *                 type: string
 *                 description: Set to reply to an existing comment
 *     responses:
 *       201:
 *         description: Comment created
 */
router.post('/posts/:id/comment', requireAuth, addComment);

/**
 * @openapi
 * /community/posts/{id}/comments:
 *   post:
 *     summary: Add a top-level comment
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
router.post('/posts/:id/comments', requireAuth, addComment);

/**
 * @openapi
 * /community/posts/{id}/comments:
 *   get:
 *     summary: Get comments for a post (nested replies included)
 *     tags: [Community]
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
 *         description: List of top-level comments, each with a children array
 */
router.get('/posts/:id/comments', requireAuth, getComments);

/**
 * @openapi
 * /community/posts/{id}:
 *   get:
 *     summary: Get a single post by ID
 *     tags: [Community]
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
 *         description: Post details with author, counts, and likedByMe
 *       404:
 *         description: Post not found
 */
router.get('/posts/:id', requireAuth, getPostById);


/**
 * @openapi
 * /community/clubs:
 *   post:
 *     summary: Create a club (pending approval)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Club created
 *   get:
 *     summary: Get all approved clubs
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clubs
 */
router.post('/clubs', requireAuth, createClub);
router.get('/clubs', requireAuth, getClubs);

/**
 * @openapi
 * /community/clubs/{id}:
 *   get:
 *     summary: Get club details by ID
 *     tags: [Community]
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
 *         description: Club details with current user's join status and admin flag
 */
router.get('/clubs/:id', requireAuth, getClubById);

/**
 * @openapi
 * /community/clubs/{id}/description:
 *   patch:
 *     summary: Update club description (admin only)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully updated description
 */
router.patch('/clubs/:id/description', requireAuth, updateClubDescription);

/**
 * @openapi
 * /community/clubs/{id}/members:
 *   get:
 *     summary: Get paginated list of club members
 *     tags: [Community]
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
 *         description: Paginated members list
 */
router.get('/clubs/:id/members', requireAuth, getClubMembers);

/**
 * @openapi
 * /community/clubs/{id}/posts:
 *   get:
 *     summary: Get paginated list of posts in a club
 *     tags: [Community]
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
 *         description: Paginated posts list
 */
router.get('/clubs/:id/posts', requireAuth, getClubPosts);

/**
 * @openapi
 * /community/clubs/{id}/events:
 *   post:
 *     summary: Create an event in a club
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Event created
 *   get:
 *     summary: Get events in a club
 *     tags: [Community]
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
 *         description: List of events
 */
router.post('/clubs/:id/events', requireAuth, createClubEvent);
router.get('/clubs/:id/events', requireAuth, getClubEvents);

/**
 * @openapi
 * /community/events/{eventId}/rsvp:
 *   post:
 *     summary: RSVP to a club event
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [attending, maybe, declined]
 *     responses:
 *       200:
 *         description: RSVP successful
 */
router.post('/events/:eventId/rsvp', requireAuth, rsvpClubEvent);

/**
 * @openapi
 * /community/polls/vote:
 *   post:
 *     summary: Vote on a poll
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pollId:
 *                 type: string
 *               optionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vote recorded
 */
router.post('/polls/vote', requireAuth, voteOnPoll);

/**
 * @openapi
 * /community/posts/{id}/poll/results:
 *   get:
 *     summary: Get poll results
 *     tags: [Community]
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
 *         description: Poll results
 */
router.get('/posts/:id/poll/results', requireAuth, getCommunityPollResult);

/**
 * @openapi
 * /community/clubs/{id}/join:
 *   post:
 *     summary: Request to join a club
 *     tags: [Community]
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
 *         description: Join request submitted or accepted
 */
router.post('/clubs/:id/join', requireAuth, requestJoinClub);

/**
 * @openapi
 * /community/clubs/{id}/requests:
 *   get:
 *     summary: Get pending join requests for a club (admin only)
 *     tags: [Community]
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
 *         description: List of pending join requests
 */
router.get('/clubs/:id/requests', requireAuth, getClubJoinRequests);

/**
 * @openapi
 * /community/clubs/{id}/requests/{userId}/resolve:
 *   post:
 *     summary: Resolve a join request (approve/reject)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Request resolved
 */
router.post('/clubs/:id/requests/:userId/resolve', requireAuth, resolveJoinRequest);

export default router;
