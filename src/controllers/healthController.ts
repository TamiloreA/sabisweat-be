import { Response, NextFunction } from 'express';
import * as healthService from '../services/healthService';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * POST /health/sync
 * Sync a single day's health data
 */
export const syncStepData = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const result = await healthService.syncStepData(req.user.id, req.body, req.token!);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /health/sync/batch
 * Sync multiple days of health data
 */
export const syncStepDataBatch = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    if (!Array.isArray(req.body)) {
      res.status(400).json({ success: false, error: 'validation_error', message: 'Expected an array of sync payloads' });
      return;
    }

    const result = await healthService.syncStepDataBatch(req.user.id, req.body, req.token!);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * GET /health/history
 * Get health history for date range
 */
export const getHealthHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const { startDate, endDate, limit } = req.query;
    const history = await healthService.getHealthHistory(req.user.id, {
      startDate: startDate as string,
      endDate: endDate as string,
      limit: limit ? parseInt(limit as string, 10) : undefined
    }, req.token!);
    
    res.status(200).json(history);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * GET /health/history/all
 * Get all health history
 */
export const getHealthHistoryAll = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const history = await healthService.getHealthHistoryAll(req.user.id, req.token!);
    res.status(200).json(history);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * PATCH /health/step-goal
 * Update user step goal
 */
export const updateStepGoal = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const { stepGoal } = req.body;
    if (!stepGoal || typeof stepGoal !== 'number' || stepGoal < 1000) {
      res.status(400).json({ success: false, error: 'validation_error', message: 'Valid stepGoal is required (min 1000)' });
      return;
    }

    const result = await healthService.updateStepGoal(req.user.id, stepGoal, req.token!);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * GET /health/today
 * Get today's steps
 */
export const getTodaySteps = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const data = await healthService.getTodaySteps(req.user.id, req.token!);
    res.status(200).json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};
