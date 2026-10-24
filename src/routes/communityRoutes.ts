import { Router } from 'express';
import { getFeed, createPost, likePost, unlikePost, addComment, getComments, getPostById, createClub, getClubs, getClubById, getClubPosts, voteOnPoll, getCommunityPollResult, createClubEvent, getClubEvents, rsvpClubEvent, requestJoinClub,  getClubJoinRequests,
  resolveJoinRequest,
  getClubMembers,
  updateClubDescription,
  updateClubCoverImage,
  getClubAnnouncements,
  createClubAnnouncement
} from '../controllers/communityController';
import { getClubChallenges, createChallenge } from '../controllers/challengeController';
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
 *             required: [name, clubId, description, locationText]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Club name
 *                 example: The Movers
 *               clubId:
 *                 type: string
 *                 description: Club handle / ID entered in Step 2 (e.g. @the_movers)
 *                 example: "@the_movers"
 *               description:
 *                 type: string
 *                 description: Club overview and goals
 *                 example: A community for weekend runners and fitness enthusiasts.
 *               tag:
 *                 type: string
 *                 enum: [brand, team, employee, friends]
 *                 description: Club category/type
 *                 example: brand
 *               locationScope:
 *                 type: string
 *                 enum: [single, multiple, global]
 *                 description: Location scope ('single' | 'multiple' | 'global')
 *                 example: single
 *               locationText:
 *                 type: string
 *                 description: Combined location text for display (e.g. "Lagos, Nigeria" or "Nigeria, United Kingdom" or "Global")
 *                 example: Lagos, Nigeria
 *               country:
 *                 type: string
 *                 nullable: true
 *                 description: Name of the country (for 'single' scope)
 *                 example: Nigeria
 *               countryCode:
 *                 type: string
 *                 nullable: true
 *                 description: 2-letter ISO code e.g. "NG" (for 'single' scope)
 *                 example: NG
 *               regions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of region/state names (for 'single' scope)
 *                 example: ["Lagos", "Abuja, FCT"]
 *               countries:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ClubCountry'
 *                 description: Array of country objects (for 'multiple' scope)
 *               profileImageBase64:
 *                 type: string
 *                 description: Base64 string or data URL (data:image/jpeg;base64,...) for club profile photo
 *               profileImageUrl:
 *                 type: string
 *                 description: Direct URL for club profile photo (optional)
 *               isPrivate:
 *                 type: boolean
 *                 description: Whether the club is private (join by request) or public
 *                 default: false
 *               coverImageUrl:
 *                 type: string
 *                 description: Direct URL for club cover banner image (optional)
 *               theme:
 *                 type: string
 *                 description: Color theme for the club
 *                 default: green
 *                 example: green
 *     responses:
 *       201:
 *         description: Club created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Club'
 *   get:
 *     summary: Get all approved clubs
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clubs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Club'
 *               example:
 *                 - id: "43bf4206-8d65-4f35-985e-5bb49dfa68c0"
 *                   clubId: "@the_movers"
 *                   name: "The Movers"
 *                   description: "A community for weekend runners"
 *                   tag: "brand"
 *                   locationScope: "single"
 *                   locationText: "Lagos, Nigeria"
 *                   country: "Nigeria"
 *                   countryCode: "NG"
 *                   regions: ["Lagos", "Abuja, FCT"]
 *                   countries: null
 *                   coverImageUrl: null
 *                   profileImageUrl: null
 *                   theme: "green"
 *                   status: "approved"
 *                   membersCount: 12
 *                   joinStatus: "joined"
 *                   isAdmin: false
 *                   createdAt: "2026-10-10T00:00:00.000Z"
 *                 - id: "89c74820-21a4-4df1-8664-9fbb4223ba8e"
 *                   clubId: "@global_sweaters"
 *                   name: "Global Sweaters"
 *                   description: "Running everywhere"
 *                   tag: "team"
 *                   locationScope: "multiple"
 *                   locationText: "Nigeria, United Kingdom"
 *                   country: null
 *                   countryCode: null
 *                   regions: []
 *                   countries:
 *                     - country: "Nigeria"
 *                       countryCode: "NG"
 *                       regions: ["Lagos", "Abuja, FCT"]
 *                     - country: "United Kingdom"
 *                       countryCode: "GB"
 *                       regions: ["London", "Manchester"]
 *                   coverImageUrl: null
 *                   profileImageUrl: null
 *                   theme: "blue"
 *                   status: "approved"
 *                   membersCount: 35
 *                   joinStatus: "none"
 *                   isAdmin: false
 *                   createdAt: "2026-10-10T00:00:00.000Z"
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Club'
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
 * /community/clubs/{id}/cover-image:
 *   patch:
 *     summary: Update club cover image (admin only)
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
 *             required: [coverImageBase64]
 *             properties:
 *               coverImageBase64:
 *                 type: string
 *                 description: Base64-encoded image string with data URI prefix
 *     responses:
 *       200:
 *         description: Club cover image updated
 *       400:
 *         description: Invalid image or missing field
 *       403:
 *         description: Forbidden - admin or creator only
 */
router.patch('/clubs/:id/cover-image', requireAuth, updateClubCoverImage);

/**
 * @openapi
 * /community/clubs/{id}/announcements:
 *   get:
 *     summary: Fetch club announcements list
 *     tags: [Community]
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
 *           default: 1
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of club announcements
 */
router.get('/clubs/:id/announcements', requireAuth, getClubAnnouncements);

/**
 * @openapi
 * /community/clubs/{id}/announcements:
 *   post:
 *     summary: Publish a club announcement (admin only)
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
 *             required: [content]
 *             properties:
 *               title:
 *                 type: string
 *                 nullable: true
 *               content:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Announcement published successfully
 *       400:
 *         description: Content is required
 *       403:
 *         description: Forbidden - admin or creator only
 */
router.post('/clubs/:id/announcements', requireAuth, createClubAnnouncement);


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
 * /community/clubs/{id}/challenges:
 *   get:
 *     summary: Get all challenges owned by a club
 *     description: Returns all challenges created and hosted by the specified club. If authenticated, includes the user's participation status and step progress.
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
router.get('/clubs/:id/challenges', requireAuth, getClubChallenges);

/**
 * @openapi
 * /community/clubs/{id}/challenges:
 *   post:
 *     summary: Create a challenge hosted by a club (admin only)
 *     description: Creates a new challenge associated with the specified club. Only club admins are permitted. Base64 images are uploaded automatically.
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier of the club (UUID) or club handle/tag (e.g. "@the_movers" or "the_movers")
 *         example: "43bf4206-8d65-4f35-985e-5bb49dfa68c0"
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
 *                 example: "Weekend 10K Step Challenge"
 *               subtitle:
 *                 type: string
 *                 example: "Push your limits with the club"
 *               description:
 *                 type: string
 *                 example: "Hit 10,000 steps this weekend."
 *               rewardText:
 *                 type: string
 *                 example: "500 Sabi Coins"
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
 *                 example: ["Must record steps on Saturday or Sunday"]
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Complete 10,000 steps over the weekend"]
 *               goalType:
 *                 type: string
 *                 default: steps
 *                 example: steps
 *               goalValue:
 *                 type: integer
 *                 example: 10000
 *               maxParticipants:
 *                 type: integer
 *                 example: 200
 *               cityTag:
 *                 type: string
 *                 example: Lagos
 *               country:
 *                 type: string
 *                 example: Nigeria
 *               region:
 *                 type: string
 *                 example: Lagos
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-10-20T00:00:00.000Z"
 *               endAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-10-22T23:59:59.000Z"
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
router.post('/clubs/:id/challenges', requireAuth, createChallenge);

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
