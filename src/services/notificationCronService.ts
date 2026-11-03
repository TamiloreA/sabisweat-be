/**
 * Notification Cron & Scheduling Service
 * Processes pending scheduled notifications and reconciles Expo push receipts.
 */

import { supabase } from '../config/database';
import { ScheduleNotificationInput } from '../models/notificationModel';
import { dispatchNotification } from './notificationDispatcher';
import { fetchReceipts } from './expoPushService';
import { deactivateInvalidToken } from './deviceService';

const TABLE_SCHEDULES = 'notification_schedules';
const TABLE_ATTEMPTS = 'notification_delivery_attempts';

/**
 * Schedule a notification for future dispatch
 */
export async function scheduleNotification(
  input: ScheduleNotificationInput
): Promise<{ id: string; scheduledFor: string }> {
  const {
    userId,
    type,
    title,
    body,
    data = {},
    channel = 'push',
    scheduledFor,
    timezone = 'Africa/Lagos',
    idempotencyKey,
    expiresAt,
  } = input;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from(TABLE_SCHEDULES)
      .select('id, scheduled_for')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return { id: existing.id, scheduledFor: existing.scheduled_for };
    }
  }

  const { data: created, error } = await supabase
    .from(TABLE_SCHEDULES)
    .insert({
      user_id: userId,
      type,
      title,
      body,
      data,
      channel,
      scheduled_for: scheduledFor,
      timezone,
      status: 'pending',
      idempotency_key: idempotencyKey || null,
      expires_at: expiresAt || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, scheduled_for')
    .single();

  if (error || !created) {
    console.error('[cronService] Failed to schedule notification:', error);
    throw { status: 500, message: error?.message || 'Failed to schedule notification' };
  }

  return { id: created.id, scheduledFor: created.scheduled_for };
}

/**
 * Process due scheduled notifications
 */
export async function processScheduledNotifications(batchSize = 50): Promise<{
  processed: number;
  completed: number;
  expired: number;
  failed: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Fetch due pending jobs
  const { data: dueSchedules, error } = await supabase
    .from(TABLE_SCHEDULES)
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(batchSize);

  if (error || !dueSchedules || dueSchedules.length === 0) {
    return { processed: 0, completed: 0, expired: 0, failed: 0 };
  }

  let completed = 0;
  let expired = 0;
  let failed = 0;

  for (const schedule of dueSchedules) {
    // Check expiry
    if (schedule.expires_at && new Date(schedule.expires_at) <= now) {
      await supabase
        .from(TABLE_SCHEDULES)
        .update({ status: 'expired', processed_at: nowIso, updated_at: nowIso })
        .eq('id', schedule.id);
      expired++;
      continue;
    }

    // Atomically transition status to processing to avoid double-dispatch
    const { data: locked } = await supabase
      .from(TABLE_SCHEDULES)
      .update({ status: 'processing', updated_at: nowIso })
      .eq('id', schedule.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (!locked) {
      // Concurrently grabbed by another worker
      continue;
    }

    try {
      await dispatchNotification({
        userId: schedule.user_id,
        type: schedule.type,
        title: schedule.title,
        body: schedule.body,
        data: schedule.data || {},
        channel: schedule.channel || 'push',
        idempotencyKey: schedule.idempotency_key
          ? `${schedule.idempotency_key}:exec`
          : `sched_${schedule.id}`,
      });

      await supabase
        .from(TABLE_SCHEDULES)
        .update({
          status: 'completed',
          processed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', schedule.id);

      completed++;
    } catch (err: any) {
      console.error(`[cronService] Failed to dispatch scheduled notification ${schedule.id}:`, err);
      failed++;
      await supabase
        .from(TABLE_SCHEDULES)
        .update({
          status: schedule.retry_count >= 3 ? 'failed' : 'pending',
          retry_count: (schedule.retry_count || 0) + 1,
          last_error: err?.message || 'Dispatch error',
          updated_at: nowIso,
        })
        .eq('id', schedule.id);
    }
  }

  return {
    processed: dueSchedules.length,
    completed,
    expired,
    failed,
  };
}

/**
 * Reconcile pending Expo receipts
 */
export async function processPendingReceipts(batchSize = 100): Promise<{
  checked: number;
  ok: number;
  failed: number;
  deactivatedTokens: number;
}> {
  // Find attempts that have ticket IDs and are waiting for receipt verification
  const { data: pendingAttempts, error } = await supabase
    .from(TABLE_ATTEMPTS)
    .select('id, provider_ticket_id, device_id')
    .eq('status', 'ticket_accepted')
    .eq('provider', 'expo')
    .not('provider_ticket_id', 'is', null)
    .limit(batchSize);

  if (error || !pendingAttempts || pendingAttempts.length === 0) {
    return { checked: 0, ok: 0, failed: 0, deactivatedTokens: 0 };
  }

  const ticketIds = pendingAttempts.map((a) => a.provider_ticket_id);
  const receipts = await fetchReceipts(ticketIds);

  let ok = 0;
  let failed = 0;
  let deactivatedTokens = 0;
  const now = new Date().toISOString();

  for (const attempt of pendingAttempts) {
    const receipt = receipts[attempt.provider_ticket_id];
    if (!receipt) continue; // Receipt not ready yet

    if (receipt.status === 'ok') {
      ok++;
      await supabase
        .from(TABLE_ATTEMPTS)
        .update({ status: 'receipt_ok', updated_at: now })
        .eq('id', attempt.id);
    } else {
      failed++;
      const errDetail = receipt.details?.error || receipt.message || 'Push delivery failed';

      await supabase
        .from(TABLE_ATTEMPTS)
        .update({
          status: 'failed',
          error_code: receipt.details?.error || 'ReceiptError',
          error_message: receipt.message || null,
          updated_at: now,
        })
        .eq('id', attempt.id);

      if (receipt.details?.error === 'DeviceNotRegistered') {
        // Look up the device token to deactivate
        if (attempt.device_id) {
          const { data: device } = await supabase
            .from('user_devices')
            .select('expo_push_token')
            .eq('id', attempt.device_id)
            .single();

          if (device?.expo_push_token) {
            await deactivateInvalidToken(device.expo_push_token, 'DeviceNotRegistered');
            deactivatedTokens++;
          }
        }
      }
    }
  }

  return {
    checked: pendingAttempts.length,
    ok,
    failed,
    deactivatedTokens,
  };
}

/**
 * Master runner to execute all cron tasks
 */
export async function runAllCronTasks(): Promise<{
  schedules: { processed: number; completed: number; expired: number; failed: number };
  receipts: { checked: number; ok: number; failed: number; deactivatedTokens: number };
}> {
  const [schedules, receipts] = await Promise.all([
    processScheduledNotifications(),
    processPendingReceipts(),
  ]);

  return { schedules, receipts };
}
