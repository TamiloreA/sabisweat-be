import { Response, NextFunction } from 'express';
import * as homeService from '../services/homeService';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /home/summary
 * Get home screen summary data
 */
export const getHomeSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const summary = await homeService.getHomeSummary(req.user.id, req.token!);
    res.status(200).json(summary);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};
