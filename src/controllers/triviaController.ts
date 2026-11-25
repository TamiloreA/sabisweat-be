import { Request, Response, NextFunction } from 'express';
import * as triviaService from '../services/triviaService';

function handleKnownError(error: any, res: Response, next: NextFunction) {
  if (error?.status) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  next(error);
}

export const getOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.getTriviaOverview(req.user?.sub || req.user?.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const getRoundDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.getTriviaRoundDetail(req.params.id, req.user?.sub || req.user?.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Trivia round not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const saveDraft = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { answers } = req.body ?? {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      res.status(400).json({ success: false, message: 'answers object is required' });
      return;
    }
    const data = await triviaService.saveTriviaDraft(req.params.id, req.user!.id, answers);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const submitAnswers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { answers } = req.body ?? {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      res.status(400).json({ success: false, message: 'answers object is required' });
      return;
    }
    const data = await triviaService.submitTriviaAnswers(req.params.id, req.user!.id, answers);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const toggleNotify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { notifyOnResults } = req.body ?? {};
    if (typeof notifyOnResults !== 'boolean') {
      res.status(400).json({ success: false, message: 'notifyOnResults boolean is required' });
      return;
    }
    const data = await triviaService.setTriviaNotifyPreference(
      req.params.id,
      req.user!.id,
      notifyOnResults
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const getResults = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.getTriviaResults(req.params.id, req.user!.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Trivia round not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = req.query.scope === 'all_time' ? 'all_time' : 'week';
    const roundId = typeof req.query.roundId === 'string' && req.query.roundId.trim()
      ? req.query.roundId.trim()
      : undefined;
    const data = await triviaService.getTriviaLeaderboard(
      scope,
      req.user?.sub || req.user?.id,
      roundId
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const createAdminRound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.createAdminTriviaRound(req.body ?? {}, req.user?.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const listAdminRounds = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.listAdminTriviaRounds();
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const updateAdminRound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.updateAdminTriviaRound(req.params.id, req.body ?? {});
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const deleteAdminRound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await triviaService.deleteAdminTriviaRound(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};
