/**
 * Admin Challenge Controller
 *
 * Handles management of challenges from the Sabi Sweat Admin Web Portal.
 * Automatically marks admin-created challenges as official Sabi Sweat challenges (is_official: true).
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database';
import * as challengeService from '../services/challengeService';
import type { ChallengeRow } from '../models/challengeModel';

export const createAdminChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title,
      subtitle,
      description,
      rewardText,
      heroImageBase64,
      challengeImageBase64,
      startAt,
      endAt,
      goalType,
      goalValue,
      cityTag,
      country,
      region,
      hasPrizeDraw,
      prizeAmount,
      prizeCurrency,
    } = req.body ?? {};

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

    const userId = req.user?.id || 'admin-system';

    const challenge = await challengeService.createChallenge(
      {
        title: title.trim(),
        subtitle: typeof subtitle === 'string' ? subtitle.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined,
        rewardText: typeof rewardText === 'string' ? rewardText.trim() : undefined,
        heroImageBase64: typeof heroImageBase64 === 'string' ? heroImageBase64 : undefined,
        challengeImageBase64: typeof challengeImageBase64 === 'string' ? challengeImageBase64 : undefined,
        startAt: startAt.trim(),
        endAt: endAt.trim(),
        goalType: typeof goalType === 'string' ? goalType.trim() : 'steps',
        goalValue: typeof goalValue === 'number' ? goalValue : (Number(goalValue) || 10000),
        cityTag: typeof cityTag === 'string' ? cityTag.trim() : undefined,
        country: typeof country === 'string' ? country.trim() : (cityTag === 'London' ? 'United Kingdom' : 'Nigeria'),
        region: typeof region === 'string' ? region.trim() : cityTag,
        isOfficial: true,
        hostName: 'Sabi Sweat',
        whoCanJoin: 'everyone',
        leaderboardVisibility: 'public',
        hasPrizeDraw: hasPrizeDraw === true || hasPrizeDraw === 'true',
        prizeAmount: typeof prizeAmount === 'number' ? prizeAmount : (Number(prizeAmount) || undefined),
        prizeCurrency: typeof prizeCurrency === 'string' ? prizeCurrency.trim() : 'NGN',
      },
      userId
    );

    // Return format expected by CreateChallengeResponse in admin frontend
    res.status(201).json({
      id: challenge.id,
      title: challenge.title,
      startAt: challenge.startAt,
      endAt: challenge.endAt,
      goalType: challenge.goalType || 'steps',
      goalValue: challenge.goalValue || 0,
      published: true,
      visible: true,
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const getAdminChallengeOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 10));
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const region = typeof req.query.region === 'string' ? req.query.region : undefined;

    let query = supabase.from('challenges').select('*', { count: 'exact' });

    const now = new Date().toISOString();
    if (status === 'active') {
      query = query.lte('start_at', now).gte('end_at', now);
    } else if (status === 'upcoming') {
      query = query.gt('start_at', now);
    } else if (status === 'past') {
      query = query.lt('end_at', now);
    }

    if (region && region !== 'all') {
      query = query.or(`region.ilike.%${region}%,city_tag.ilike.%${region}%`);
    }

    const start = (page - 1) * size;
    const { data: rows, count, error } = await query
      .order('start_at', { ascending: false })
      .range(start, start + size - 1);

    if (error) throw error;

    const challenges = (rows || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle || '',
      startAt: c.start_at,
      endAt: c.end_at,
      goalType: c.goal_type || 'steps',
      goalValue: c.goal_value || 0,
      rewardText: c.reward_text || '',
      cityTag: c.city_tag || '',
      isOfficial: Boolean(c.is_official),
      hasPrizeDraw: Boolean(c.has_prize_draw),
      prizeAmount: c.prize_amount,
      prizeCurrency: c.prize_currency,
      published: true,
      visible: true,
    }));

    res.status(200).json({
      challenges,
      total: count ?? challenges.length,
      page,
      size,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminChallengeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const { data: challenge, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !challenge) {
      res.status(404).json({ success: false, message: 'Challenge not found' });
      return;
    }

    res.status(200).json(challenge);
  } catch (error) {
    next(error);
  }
};

export const updateAdminChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    const allowed = [
      'title',
      'subtitle',
      'description',
      'rewardText',
      'cityTag',
      'startAt',
      'endAt',
      'goalType',
      'goalValue',
      'hasPrizeDraw',
      'prizeAmount',
      'prizeCurrency',
      'isOfficial',
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        updates[dbKey] = req.body[key];
      }
    }

    const { data, error } = await supabase
      .from('challenges')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const deleteAdminChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const { error } = await supabase
      .from('challenges')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(200).json({ success: true, message: 'Challenge deleted successfully' });
  } catch (error) {
    next(error);
  }
};

