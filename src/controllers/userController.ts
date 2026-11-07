/**
 * User Controller
 * Handlers for /users/me and /users/me/preferences
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as userService from '../services/userService';

/**
 * GET /users/me
 * Returns authenticated user profile including preferences.
 */
export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ status: 'error', success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const profile = await userService.getUserProfile(req.user.id);
    res.status(200).json({
      status: 'success',
      success: true,
      data: profile,
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({
        status: 'error',
        success: false,
        error: error.error || 'error',
        message: error.message,
      });
      return;
    }
    next(error);
  }
};

/**
 * PATCH /users/me
 * Updates user profile fields and/or preferences.
 */
export const updateMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ status: 'error', success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const updatedProfile = await userService.updateUserProfile(req.user.id, req.body);
    res.status(200).json({
      status: 'success',
      success: true,
      data: updatedProfile,
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({
        status: 'error',
        success: false,
        error: error.error || 'error',
        message: error.message,
      });
      return;
    }
    next(error);
  }
};

/**
 * PATCH /users/me/preferences
 * Updates user preferences (distanceUnit, energyUnit, startOfWeek).
 */
export const updatePreferences = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ status: 'error', success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const preferences = await userService.updateUserPreferences(req.user.id, req.body);
    res.status(200).json({
      status: 'success',
      success: true,
      data: {
        preferences,
      },
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({
        status: 'error',
        success: false,
        error: error.error || 'error',
        message: error.message,
      });
      return;
    }
    next(error);
  }
};
