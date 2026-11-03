/**
 * Notification Routes
 * In-App Notification Feed, Unread Counts, Read/Unread Status, and Dispatch.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getNotifications,
  getUnreadCount,
  getNotificationById,
  markAsRead,
  markAsUnread,
  markAllAsRead,
} from '../controllers/inboxController';
import { dispatchToUser, runCron } from '../controllers/notificationAdminController';

const router = Router();

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: Get user's paginated in-app notification feed
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Paginated notification list with unreadCount
 */
router.get('/', requireAuth, getNotifications);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     summary: Get authoritative unread notification count for app icon badge
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authoritative unread count and badge number
 */
router.get('/unread-count', requireAuth, getUnreadCount);

/**
 * @openapi
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read for authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/read-all', requireAuth, markAllAsRead);

/**
 * @openapi
 * /notifications/dispatch:
 *   post:
 *     summary: Dispatch notification to user across channels (Admin/Internal)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, title, body]
 *             properties:
 *               userId:
 *                 type: string
 *               type:
 *                 type: string
 *                 example: "DAILY_STEP_REMINDER"
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               channel:
 *                 type: string
 *                 enum: [all, push, email, in_app]
 *                 default: all
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Dispatch result
 */
router.post('/dispatch', requireAuth, dispatchToUser);

/**
 * @openapi
 * /notifications/cron/process:
 *   post:
 *     summary: Run scheduled notification processing and Expo receipt reconciliation
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Cron execution result
 */
router.post('/cron/process', runCron);

/**
 * @openapi
 * /notifications/{id}:
 *   get:
 *     summary: Get a single in-app notification by ID
 *     tags: [Notifications]
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
 *         description: Notification details
 */
router.get('/:id', requireAuth, getNotificationById);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
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
 *         description: Notification marked as read with updated unread count
 */
router.patch('/:id/read', requireAuth, markAsRead);

/**
 * @openapi
 * /notifications/{id}/unread:
 *   patch:
 *     summary: Mark a single notification as unread
 *     tags: [Notifications]
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
 *         description: Notification marked as unread with updated unread count
 */
router.patch('/:id/unread', requireAuth, markAsUnread);

export default router;
