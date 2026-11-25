import { Router } from 'express';
import { getSharePreview } from '../controllers/publicSharePreviewController';
import { publicSharePreviewRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * @swagger
 * /api/v1/public/share-preview/{type}/{id}:
 *   get:
 *     summary: Get public Open Graph metadata for a shared Sabi Sweat deep link
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [challenges, posts, news, clubs]
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public share preview metadata
 *       400:
 *         description: Unsupported preview type
 *       404:
 *         description: Resource not found or not publicly accessible
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/share-preview/:type/:id', publicSharePreviewRateLimiter, getSharePreview);

export default router;
