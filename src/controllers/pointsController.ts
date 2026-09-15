import { Response, NextFunction } from 'express';
import * as pointsService from '../services/pointsService';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /points/balance
 * Get user points balance
 */
export const getPointsBalance = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const result = await pointsService.getPointsBalance(req.user.id, req.token!);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};
