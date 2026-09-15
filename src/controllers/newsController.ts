import { Request, Response, NextFunction } from 'express';
import * as newsService from '../services/newsService';

export const getNews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const news = await newsService.getNews(req.user?.sub);
    res.status(200).json({ success: true, data: news });
  } catch (error) {
    next(error);
  }
};

export const getNewsById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await newsService.getNewsById(req.params.id, req.user?.sub);
    if (!item) {
      res.status(404).json({ success: false, message: 'News not found' });
      return;
    }
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const likeNews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await newsService.likeNews(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const unlikeNews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await newsService.unlikeNews(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const addNewsComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'text is required' });
      return;
    }
    const result = await newsService.addNewsComment(req.params.id, text.trim(), req.user!.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const voteOnPoll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { optionId } = req.body ?? {};
    if (typeof optionId !== 'string' || !optionId.trim()) {
      res.status(400).json({ success: false, message: 'optionId is required' });
      return;
    }
    const result = await newsService.voteOnPoll(optionId.trim(), req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getPollResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await newsService.getPollResult(req.params.id);
    if (!result) {
      res.status(404).json({ success: false, message: 'Poll not found' });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const createNews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, subtitle, description, imageUrl, kind, pollOptions, pollEndsAt } = req.body ?? {};

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, message: 'title is required' });
      return;
    }

    if (kind === 'poll' && (!Array.isArray(pollOptions) || pollOptions.filter((o: any) => typeof o === 'string' && o.trim()).length < 2)) {
      res.status(400).json({ success: false, message: 'A poll needs at least 2 options' });
      return;
    }

    const item = await newsService.createNews({
      title: title.trim(),
      subtitle: typeof subtitle === 'string' ? subtitle.trim() : undefined,
      description: typeof description === 'string' ? description.trim() : undefined,
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : undefined,
      kind: kind === 'poll' ? 'poll' : 'article',
      pollOptions: Array.isArray(pollOptions) ? pollOptions : undefined,
      pollEndsAt: typeof pollEndsAt === 'string' ? pollEndsAt.trim() : undefined,
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};
