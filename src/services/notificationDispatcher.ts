/**
 * Notification Dispatcher
 * Coordinates in-app creation, unread badge calculation, preference checks,
 * Expo push dispatch, Resend email dispatch, and delivery attempt logging.
 */

import { supabase } from '../config/database';
import {
  DispatchNotificationInput,
  DispatchResult,
  ExpoPushMessage,
} from '../models/notificationModel';
import { createInAppNotification, getUnreadCount } from './inboxService';
import { getActiveDevicesForUser } from './deviceService';
import { isPushCategoryEnabled, isEmailCategoryEnabled } from './preferenceService';
import { sendPushChunked } from './expoPushService';
import { sendEmail } from './resendEmailService';

const TABLE_ATTEMPTS = 'notification_delivery_attempts';

/**
 * Dispatches a notification across applicable channels (in-app, push, email)
 */
export async function dispatchNotification(
  input: DispatchNotificationInput
): Promise<DispatchResult> {
  const {
    userId,
    type,
    title,
    body,
    imageUrl,
    data = {},
    channel = 'all',
    idempotencyKey,
    expiresAt,
    emailSubject,
    emailHtml,
  } = input;

  const result: DispatchResult = {
    inAppCreated: false,
    unreadCount: 0,
    pushAttempts: 0,
    pushTicketsCount: 0,
    emailSent: false,
    errors: [],
  };

  // 1. Create In-App Notification (unless channel is email-only)
  let notificationId: string | undefined;
  if (channel === 'all' || channel === 'in_app' || channel === 'push') {
    try {
      const { notification, isNew } = await createInAppNotification({
        userId,
        type,
        title,
        body,
        description: body,
        imageUrl,
        data,
        expiresAt,
        idempotencyKey,
      });

      notificationId = notification.id;
      result.inAppCreated = isNew;
      result.notificationId = notificationId;

      // If notification already exists for this idempotency key, suppress duplicate push and email
      if (!isNew) {
        console.log(`[dispatcher] Idempotent notification already dispatched: ${idempotencyKey}`);
        return result;
      }
    } catch (err: any) {
      console.error('[dispatcher] Failed to create in-app notification:', err);
      result.errors?.push(`In-App error: ${err?.message || err}`);
    }
  }

  // 2. Compute Authoritative Unread Count for Badge
  const unreadMeta = await getUnreadCount(userId);
  result.unreadCount = unreadMeta.unreadCount;

  // 3. Dispatch Push Notification (if channel allows)
  if (channel === 'all' || channel === 'push') {
    const isPushEnabled = await isPushCategoryEnabled(userId, type);

    const dataPayload: Record<string, any> = data || {};

    if (isPushEnabled) {
      const activeDevices = await getActiveDevicesForUser(userId);

      if (activeDevices.length > 0) {
        const pushMessages: ExpoPushMessage[] = activeDevices.map((device) => {
          const msg: ExpoPushMessage = {
            to: device.expo_push_token,
            title,
            body,
            badge: result.unreadCount, // Authoritative badge count
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            data: {
              ...dataPayload,
              notificationId: notificationId || dataPayload.notificationId,
              type,
              screen: dataPayload.screen,
              params: dataPayload.params,
              deepLink: dataPayload.deepLink,
              ...(imageUrl ? { imageUrl } : {}),
            },
          };

          if (imageUrl) {
            msg.richContent = { image: imageUrl };
          }

          return msg;
        });

        const sendResults = await sendPushChunked(pushMessages);
        result.pushAttempts = sendResults.length;

        // Record delivery attempts in database
        for (let i = 0; i < sendResults.length; i++) {
          const { ticket } = sendResults[i];
          const device = activeDevices[i];

          const isAccepted = ticket.status === 'ok';
          if (isAccepted) result.pushTicketsCount++;

          const attemptPayload = {
            notification_id: notificationId || null,
            user_id: userId,
            device_id: device.id,
            channel: 'push',
            provider: 'expo',
            provider_ticket_id: ticket.id || null,
            status: isAccepted ? 'ticket_accepted' : 'failed',
            attempt_count: 1,
            error_code: ticket.details?.error || null,
            error_message: ticket.message || null,
            payload_summary: {
              token: device.expo_push_token.slice(0, 20) + '...',
              platform: device.platform,
              badge: result.unreadCount,
            },
            created_at: new Date().toISOString(),
          };

          try {
            await supabase.from(TABLE_ATTEMPTS).insert(attemptPayload);
          } catch (dbErr) {
            console.warn('[dispatcher] Could not save push delivery attempt log:', dbErr);
          }
        }
      }
    } else {
      console.log(`[dispatcher] Push skipped for user ${userId} (category ${type} disabled)`);
    }
  }

  // 4. Dispatch Email (if channel is email or all with email template)
  if ((channel === 'all' || channel === 'email') && emailSubject && emailHtml) {
    const isEmailEnabled = await isEmailCategoryEnabled(userId, type);

    if (isEmailEnabled) {
      // Fetch user email from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name')
        .eq('id', userId)
        .single();

      if (profile?.email) {
        const emailResult = await sendEmail({
          to: profile.email,
          subject: emailSubject,
          html: emailHtml,
          category: type,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:email` : undefined,
        });

        result.emailSent = emailResult.success;

        try {
          await supabase.from(TABLE_ATTEMPTS).insert({
            notification_id: notificationId || null,
            user_id: userId,
            channel: 'email',
            provider: 'resend',
            provider_ticket_id: emailResult.id || null,
            status: emailResult.success ? 'submitted' : 'failed',
            attempt_count: 1,
            error_message: emailResult.error || null,
            payload_summary: { recipient: profile.email, subject: emailSubject },
            created_at: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.warn('[dispatcher] Could not save email delivery attempt log:', dbErr);
        }
      }
    }
  }

  return result;
}
