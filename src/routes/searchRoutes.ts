/**
 * Search Routes
 *
 * REST endpoint for unified search across Challenges and Clubs.
 */

import { Router } from 'express';
import { search } from '../controllers/searchController';
import { requireAuth } from '../middleware/auth';
import { searchRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * @openapi
 * /search:
 *   get:
 *     summary: Unified search across Challenges, Clubs, and Help FAQs
 *     description: Searches across challenges, clubs, and help articles using PostgreSQL full-text search, trigram similarity, and location-based club ranking.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: "Search query string (1 to 100 characters)"
 *         example: "running"
 *       - in: query
 *         name: types
 *         required: false
 *         schema:
 *           type: string
 *         description: "Resource types to search (comma-separated: challenges, clubs, help). Defaults to all."
 *         example: "challenges,clubs,help"
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 15
 *           maximum: 50
 *         description: "Maximum results per resource type (default: 15, max: 50)"
 *         example: 15
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: "Pagination offset per resource type (default: 0)"
 *         example: 0
 *       - in: query
 *         name: country
 *         required: false
 *         schema:
 *           type: string
 *         description: "User country code (e.g. NG or GB) for location-based club ranking"
 *         example: "NG"
 *       - in: query
 *         name: region
 *         required: false
 *         schema:
 *           type: string
 *         description: "User selected region (e.g. Lagos or London) for location-based club ranking"
 *         example: "Lagos"
 *     responses:
 *       200:
 *         description: Search results grouped by resource type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                   example: "run"
 *                 types:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["challenges", "clubs"]
 *                 results:
 *                   type: object
 *                   properties:
 *                     challenges:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 42
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                     clubs:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 8
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     took_ms:
 *                       type: integer
 *                       example: 42
 *                     limit:
 *                       type: integer
 *                       example: 15
 *                     offset:
 *                       type: integer
 *                       example: 0
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "QUERY_REQUIRED"
 *                 message:
 *                   type: string
 *                   example: "Search query is required."
 *       401:
 *         description: Missing or invalid authentication token
 *       429:
 *         description: Rate limit exceeded (15 requests per 10 seconds)
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Number of seconds to wait before retrying
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "RATE_LIMITED"
 *                 message:
 *                   type: string
 *                   example: "Too many requests. Try again in a moment."
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Something went wrong."
 */
router.get('/', searchRateLimiter, requireAuth, search);

export default router;
