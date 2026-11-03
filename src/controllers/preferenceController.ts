/**
 * Notification Preference Controller
 * Request handlers for notification preferences and category toggles.
 */

import { Request, Response, NextFunction } from 'express';
import * as preferenceService from '../services/preferenceService';

export const getPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.getPreferences(userId);
    res.status(200).json(preferences);
  } catch (error) {
    next(error);
  }
};

export const updatePreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const preferences = await preferenceService.updatePreferences(userId, req.body);
    res.status(200).json(preferences);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const togglePushCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const categoryKey = req.params.categoryKey || req.params.category;
    const enabled = Boolean(req.body.enabled);

    const result = await preferenceService.togglePushCategory(userId, categoryKey, enabled);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const toggleEmailCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const categoryKey = req.params.categoryKey || req.params.category;
    const enabled = Boolean(req.body.enabled);

    const result = await preferenceService.toggleEmailCategory(userId, categoryKey, enabled);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};
