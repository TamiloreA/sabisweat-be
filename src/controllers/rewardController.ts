import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as rewardService from '../services/rewardService';

/**
 * GET /rewards
 * Returns active rewards across all partners with partner name and city.
 */
export async function getRewards(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await rewardService.getActiveRewards();
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    if (err?.status) {
      res.status(err.status).json({ success: false, error: err.error, message: err.message });
      return;
    }
    next(err);
  }
}

/**
 * POST /rewards/:id/qr
 * Generates signed QR code pre-redemption token.
 */
export async function generateRewardQR(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const rewardId = String(req.params.id || '');
    if (!rewardId) {
      res.status(400).json({ success: false, error: 'validation_error', message: 'Reward ID is required' });
      return;
    }

    const data = await rewardService.generateRewardQR(req.user.id, rewardId);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    if (err?.status) {
      res.status(err.status).json({ success: false, error: err.error, message: err.message });
      return;
    }
    next(err);
  }
}

/**
 * GET /partners?category=...&city=...
 * Directory of active partners filterable by category and city.
 */
export async function getPartners(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const city = typeof req.query.city === 'string' ? req.query.city : undefined;

    const data = await rewardService.getPartners(category, city);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    if (err?.status) {
      res.status(err.status).json({ success: false, error: err.error, message: err.message });
      return;
    }
    next(err);
  }
}

/**
 * GET /partners/:id
 * Partner details with active rewards and gallery.
 */
export async function getPartnerById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const partnerId = String(req.params.id || '');
    if (!partnerId) {
      res.status(400).json({ success: false, error: 'validation_error', message: 'Partner ID is required' });
      return;
    }

    const data = await rewardService.getPartnerById(partnerId);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    if (err?.status) {
      res.status(err.status).json({ success: false, error: err.error, message: err.message });
      return;
    }
    next(err);
  }
}

