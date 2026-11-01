/**
 * Achievement Controller
 *
 * Request handlers for user achievements and milestones.
 */

import { Request, Response, NextFunction } from 'express';
import * as achievementService from '../services/achievementService';

export const getAchievementsSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const timezone = typeof req.query.timezone === 'string' && req.query.timezone.trim()
      ? req.query.timezone.trim()
      : 'Africa/Lagos';

    const data = await achievementService.getAchievementsSummary(req.user!.id, timezone);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
