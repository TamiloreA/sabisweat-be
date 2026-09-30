/**
 * Challenge Controller
 *
 * Request handlers for challenge endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import * as challengeService from '../services/challengeService';

export const getActiveChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const challenges = await challengeService.getActiveChallenges(req.user!.id);
    res.status(200).json({ success: true, data: challenges });
  } catch (error) {
    next(error);
  }
};

export const getAvailableChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const region = typeof req.query.region === 'string' ? req.query.region : undefined;

    const challenges = await challengeService.getAvailableChallenges(req.user!.id, { country, region });
    res.status(200).json({ success: true, data: challenges });
  } catch (error) {
    next(error);
  }
};

export const getChallengeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const challenge = await challengeService.getChallengeById(req.params.id, req.user!.id);
    if (!challenge) {
      res.status(404).json({ success: false, message: 'Challenge not found' });
      return;
    }
    res.status(200).json({ success: true, data: challenge });
  } catch (error) {
    next(error);
  }
};

export const joinChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await challengeService.joinChallenge(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const leaveChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await challengeService.leaveChallenge(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(0, Number(req.query.page) || 0);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));

    const leaderboard = await challengeService.getLeaderboard(req.params.id, page, size);
    res.status(200).json(leaderboard);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const claimReward = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await challengeService.claimReward(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};
