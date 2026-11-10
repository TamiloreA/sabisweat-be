import { Response, NextFunction } from 'express';
import * as pointsService from '../services/pointsService';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /points/balance
 * Returns current SabiCoins balance and Sabi Level.
 */
export const getPointsBalance = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const result = await pointsService.getPointsBalance(req.user.id, req.token);

    res.status(200).json({
      success: true,
      data: {
        balance: result.balance,
        sabiLevel: result.sabiLevel,
      },
      // Backward compatibility fields
      balance: result.balance,
      pointsBalance: result.pointsBalance,
      sabiLevel: result.sabiLevel,
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * GET /points/history?page=0&size=20
 * Returns paginated points ledger transactions.
 */
export const getPointsHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const page = parseInt(String(req.query.page ?? '0'), 10) || 0;
    const size = parseInt(String(req.query.size ?? '20'), 10) || 20;

    const result = await pointsService.getPointsHistory(req.user.id, page, size, req.token);

    res.status(200).json({
      success: true,
      page: result.page,
      size: result.size,
      data: result.data,
    });
  } catch (error: any) {
    next(error);
  }
};
