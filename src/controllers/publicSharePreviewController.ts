import { NextFunction, Request, Response } from 'express';
import {
  getPublicSharePreview,
  isValidSharePreviewType,
  isValidUuid,
} from '../services/publicSharePreviewService';

export async function getSharePreview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawType = typeof req.params.type === 'string' ? req.params.type.trim().toLowerCase() : '';
    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (!isValidSharePreviewType(rawType)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(400).json({
        error: 'invalid_type',
        message: 'Unsupported share preview type. Supported types: challenges, posts, news, clubs.',
      });
      return;
    }

    if (!isValidUuid(rawId)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({
        error: 'not_found',
        message: 'Share preview not found.',
      });
      return;
    }

    const preview = await getPublicSharePreview(rawType, rawId);

    if (!preview) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({
        error: 'not_found',
        message: 'Share preview not found.',
      });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
    });
  } catch (err: any) {
    if (err?.code === '22P02') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({
        error: 'not_found',
        message: 'Share preview not found.',
      });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next(err);
  }
}
