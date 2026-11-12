/**
 * Notification Admin Controller
 * Handlers for internal dispatching, testing, and cron maintenance triggers.
 */

import { Request, Response, NextFunction } from 'express';
import { dispatchNotification } from '../services/notificationDispatcher';
import { sendPushChunked } from '../services/expoPushService';
import { runAllCronTasks } from '../services/notificationCronService';
import { disburseChallengeRewards } from '../services/notificationEventService';
import { checkAndAwardSabiLevelMilestones } from '../services/sabiLevelService';

export const dispatchToUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, title, body, data, type, imageUrl, channel, emailSubject, emailHtml } = req.body;

    if (!userId || !title || !body) {
      res.status(400).json({ success: false, message: 'userId, title, and body are required' });
      return;
    }

    const result = await dispatchNotification({
      userId,
      type: type || data?.type || 'CUSTOM_NOTIFICATION',
      title,
      body,
      imageUrl,
      data: data || {},
      channel: channel || 'all',
      emailSubject,
      emailHtml,
    });

    res.status(200).json({
      ok: true,
      success: true,
      data: result,
      sent: result.pushTicketsCount,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestPush = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, title, body, data } = req.body;

    if (!token || !title || !body) {
      res.status(400).json({ success: false, message: 'token, title, and body are required' });
      return;
    }

    const results = await sendPushChunked([
      {
        to: token,
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: 'high',
      },
    ]);

    const ticket = results[0]?.ticket;
    res.status(200).json({
      ok: ticket?.status === 'ok',
      ticket,
      messageId: ticket?.id,
    });
  } catch (error) {
    next(error);
  }
};

export const runCron = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const results = await runAllCronTasks();
    res.status(200).json({
      ok: true,
      success: true,
      processed: results.schedules.processed + results.receipts.checked,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

export const disburseRewards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const challengeId = req.params.challengeId || req.body?.challengeId;
    if (!challengeId) {
      res.status(400).json({ success: false, error: 'challengeId is required' });
      return;
    }
    const result = await disburseChallengeRewards(challengeId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const reconcileSabiLevel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.body?.userId || req.params?.userId;
    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required' });
      return;
    }
    const result = await checkAndAwardSabiLevelMilestones(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
