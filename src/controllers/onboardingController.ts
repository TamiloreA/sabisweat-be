/**
 * Onboarding Controller
 * Single-submission onboarding + profile management.
 * All routes require authentication via JWT middleware.
 */

import { Response, NextFunction } from 'express';
import * as onboardingService from '../services/onboardingService';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /onboarding/me
 */
export const getProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }
    const profile = await onboardingService.getProfile(req.user.id, req.token!);
    res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /onboarding/complete
 * Single endpoint — receives all onboarding data at once
 */
export const completeOnboarding = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log('COMPLETE ONBOARDING BODY:', req.body);
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }
    const profile = await onboardingService.completeOnboarding(req.user.id, { ...req.body, email: req.user.email }, req.token!);
    res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * PATCH /onboarding/profile
 */
export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }
    const profile = await onboardingService.updateProfile(req.user.id, req.body, req.token!);
    res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * GET /onboarding/check-username/:username
 */
export const checkUsername = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { username } = req.params;
    const result = await onboardingService.checkUsername(username);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};
