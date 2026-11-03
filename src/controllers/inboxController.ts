/**
 * In-App Inbox Controller
 * Request handlers for user notifications, unread counts, and read states.
 */

import { Request, Response, NextFunction } from 'express';
import * as inboxService from '../services/inboxService';

export const getNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
    const size = typeof req.query.size === 'string' ? Number(req.query.size) : undefined;

    const result = await inboxService.getNotifications(userId, { page, size });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await inboxService.getUnreadCount(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getNotificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;
    const notification = await inboxService.getNotificationById(userId, notificationId);
    res.status(200).json({ success: true, data: notification });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;
    const result = await inboxService.markAsRead(userId, notificationId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const markAsUnread = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;
    const result = await inboxService.markAsUnread(userId, notificationId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await inboxService.markAllAsRead(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
