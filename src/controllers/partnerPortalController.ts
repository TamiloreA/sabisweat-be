import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as rewardService from '../services/rewardService';

/**
 * GET /partner-portal/home/overview
 */
export async function getOverview(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
    const data = await rewardService.getPartnerPortalOverview(req.user.id, partnerId);

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
 * POST /partner-portal/redeem
 */
export async function redeem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'QR code token is required',
      });
      return;
    }

    const data = await rewardService.redeemReward(req.user.id, token);

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
 * GET /partner-portal/partners
 */
export async function getPartners(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const data = await rewardService.getStaffPartners(req.user.id);

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
 * GET /partner-portal/partners/:partnerId/rewards
 */
export async function getPartnerRewards(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const partnerId = String(req.params.partnerId || '');
    if (!partnerId) {
      res.status(400).json({ success: false, error: 'validation_error', message: 'Partner ID is required' });
      return;
    }

    const data = await rewardService.getPartnerRewardsForStaff(req.user.id, partnerId);

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
 * POST /partner-portal/partners/:partnerId/rewards
 */
export async function createReward(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const partnerId = String(req.params.partnerId || '');
    if (!partnerId) {
      res.status(400).json({ success: false, error: 'validation_error', message: 'Partner ID is required' });
      return;
    }

    const { title, description, pointsCost, imageBase64 } = req.body || {};

    const data = await rewardService.createPartnerReward(req.user.id, partnerId, {
      title,
      description,
      pointsCost,
      imageBase64,
    });

    res.status(201).json({
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

