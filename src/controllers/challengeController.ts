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

export const getClubChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubId = (req.params.id || req.params.clubId) as string;
    if (!clubId) {
      res.status(400).json({ success: false, message: 'Club ID is required' });
      return;
    }
    const statusParam = req.query.status;
    const status = typeof statusParam === 'string' && ['all', 'active', 'upcoming', 'past'].includes(statusParam)
      ? (statusParam as 'all' | 'active' | 'upcoming' | 'past')
      : undefined;

    const challenges = await challengeService.getChallengesByClubId(clubId, req.user?.id, { status });
    res.status(200).json({ success: true, data: challenges });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
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

export const createChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title,
      subtitle,
      description,
      rewardText,
      heroImageUrl,
      heroImageBase64,
      challengeImage,
      challengeImageBase64,
      rules,
      goals,
      sponsorText,
      cityTag,
      country,
      region,
      goalType,
      goalValue,
      maxParticipants,
      hostName,
      hostLogoUrl,
      hostClubId: bodyHostClubId,
      startAt,
      endAt,
    } = req.body ?? {};

    const hostClubId = req.params.id || req.params.clubId || bodyHostClubId;

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, message: 'title is required' });
      return;
    }
    if (typeof startAt !== 'string' || !startAt.trim()) {
      res.status(400).json({ success: false, message: 'startAt is required' });
      return;
    }
    if (typeof endAt !== 'string' || !endAt.trim()) {
      res.status(400).json({ success: false, message: 'endAt is required' });
      return;
    }

    const challenge = await challengeService.createChallenge(
      {
        title: title.trim(),
        subtitle: typeof subtitle === 'string' ? subtitle.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined,
        rewardText: typeof rewardText === 'string' ? rewardText.trim() : undefined,
        heroImageUrl: typeof heroImageUrl === 'string' ? heroImageUrl.trim() : undefined,
        heroImageBase64: typeof heroImageBase64 === 'string' ? heroImageBase64 : undefined,
        challengeImage: typeof challengeImage === 'string' ? challengeImage.trim() : undefined,
        challengeImageBase64: typeof challengeImageBase64 === 'string' ? challengeImageBase64 : undefined,
        rules: Array.isArray(rules) ? rules : undefined,
        goals: Array.isArray(goals) ? goals : undefined,
        sponsorText: typeof sponsorText === 'string' ? sponsorText.trim() : undefined,
        cityTag: typeof cityTag === 'string' ? cityTag.trim() : undefined,
        country: typeof country === 'string' ? country.trim() : undefined,
        region: typeof region === 'string' ? region.trim() : undefined,
        goalType: typeof goalType === 'string' ? goalType.trim() : undefined,
        goalValue: typeof goalValue === 'number' ? goalValue : (Number(goalValue) || undefined),
        maxParticipants: typeof maxParticipants === 'number' ? maxParticipants : (Number(maxParticipants) || undefined),
        hostName: typeof hostName === 'string' ? hostName.trim() : undefined,
        hostLogoUrl: typeof hostLogoUrl === 'string' ? hostLogoUrl.trim() : undefined,
        hostClubId: typeof hostClubId === 'string' ? hostClubId.trim() : undefined,
        startAt: startAt.trim(),
        endAt: endAt.trim(),
      },
      req.user!.id
    );

    res.status(201).json({ success: true, data: challenge });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};
