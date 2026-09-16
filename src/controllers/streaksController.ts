import { Request, Response, NextFunction } from 'express';
import * as streaksService from '../services/streaksService';

export const getCurrentStreak = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await streaksService.getCurrentStreak(req.user!.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getStreakCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    const result = await streaksService.getStreakCalendar(req.user!.id, month);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getPassBalance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await streaksService.getPassBalance(req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const redeemPass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.body ?? {};
    if (typeof date !== 'string' || !date.trim()) {
      res.status(400).json({ success: false, message: 'date is required (YYYY-MM-DD)' });
      return;
    }
    const result = await streaksService.redeemPass(req.user!.id, date.trim());
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const purchasePass = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await streaksService.purchasePass(req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
