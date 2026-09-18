import { Request, Response, NextFunction } from 'express';
import * as communityService from '../services/communityService';

export const getFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(50, Math.max(1, Number(req.query.size) || 10));

    const feed = await communityService.getFeed(page, size, req.user?.sub);
    res.status(200).json({ success: true, data: feed });
  } catch (error) {
    next(error);
  }
};

export const createPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, tag, imagesUrl, imagesBase64, clubId } = req.body ?? {};

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, message: 'title is required' });
      return;
    }

    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ success: false, message: 'description is required' });
      return;
    }

    const post = await communityService.createPost(
      {
        title: title.trim(),
        description: description.trim(),
        tag: typeof tag === 'string' && tag.trim() ? tag.trim() : undefined,
        imagesUrl: Array.isArray(imagesUrl) ? imagesUrl : undefined,
        imagesBase64: Array.isArray(imagesBase64) ? imagesBase64 : undefined,
        clubId: typeof clubId === 'string' && clubId.trim() ? clubId.trim() : undefined,
      },
      req.user!
    );

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

export const likePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await communityService.likePost(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const unlikePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await communityService.unlikePost(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const addComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postId = req.params.id;
    const { text, parentCommentId } = req.body ?? {};

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'text is required' });
      return;
    }

    const result = await communityService.addComment(
      postId,
      text.trim(),
      req.user!.id,
      typeof parentCommentId === 'string' && parentCommentId.trim() ? parentCommentId.trim() : undefined
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getComments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await communityService.getComments(req.params.id);
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
};

export const getPostById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await communityService.getPostById(req.params.id, req.user?.sub);
    if (!post) {
      res.status(404).json({ success: false, message: 'Post not found' });
      return;
    }
    res.status(200).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

export const createClub = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, tag, locationText, coverImageUrl, profileImageUrl, theme } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }

    const club = await communityService.createClub(
      {
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        tag: typeof tag === 'string' ? tag.trim() : undefined,
        locationText: typeof locationText === 'string' ? locationText.trim() : undefined,
        coverImageUrl: typeof coverImageUrl === 'string' ? coverImageUrl.trim() : undefined,
        profileImageUrl: typeof profileImageUrl === 'string' ? profileImageUrl.trim() : undefined,
        theme: typeof theme === 'string' ? theme.trim() : undefined,
      },
      req.user!
    );

    res.status(201).json({ success: true, data: club });
  } catch (error) {
    next(error);
  }
};

export const getClubs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubs = await communityService.getClubs(req.user?.sub);
    res.status(200).json({ success: true, data: clubs });
  } catch (error) {
    next(error);
  }
};
