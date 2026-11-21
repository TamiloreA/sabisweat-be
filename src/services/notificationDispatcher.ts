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
const PUSH_DATA_IMAGE_KEYS = ['image', 'imageUrl', 'image_url', 'mediaUrl'] as const;

export interface RichImagePayloadSources {
  imageUrl?: unknown;
  image?: unknown;
  image_url?: unknown;
  mediaUrl?: unknown;
  richContent?: { image?: unknown } | null;
  fcm_options?: { image?: unknown } | null;
  data?: Record<string, any> | null;
}

/**
 * Validates that a candidate push image URL is a well-formed HTTPS URL.
 * Rejects empty values, cleartext http:// URLs, and inline data:image/ base64 strings
 * (which cannot be fetched by the iOS Notification Service Extension and risk APNs MessageTooBig).
 */
export function isValidHttpsImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves the first valid HTTPS image URL from supported top-level and data payload keys.
 */
export function resolveRichPushImageUrl(sources: RichImagePayloadSources): string | undefined {
  const candidates: unknown[] = [
    sources.richContent?.image,
    sources.imageUrl,
    sources.image,
    sources.image_url,
    sources.mediaUrl,
    sources.fcm_options?.image,
    sources.data?.imageUrl,
    sources.data?.image,
    sources.data?.image_url,
    sources.data?.mediaUrl,
  ];

  for (const candidate of candidates) {
    if (isValidHttpsImageUrl(candidate)) {
      return candidate.trim();
    }
  }

  return undefined;
}

/**
 * Sanitizes push data image fields (removing non-HTTPS/base64 values that cannot be used in push)
 * and attaches Expo rich image fields (`mutableContent: true`, `richContent: { image }`, `data.imageUrl`)
 * strictly when a valid HTTPS image URL is present.
 */
export function applyRichPushImage(
  msg: ExpoPushMessage,
  httpsImageUrl?: string
): ExpoPushMessage {
  const sanitizedData: Record<string, any> = { ...(msg.data || {}) };

  for (const key of PUSH_DATA_IMAGE_KEYS) {
    if (key in sanitizedData && !isValidHttpsImageUrl(sanitizedData[key])) {
      delete sanitizedData[key];
    }
  }

  if (httpsImageUrl && isValidHttpsImageUrl(httpsImageUrl)) {
    const cleanUrl = httpsImageUrl.trim();
    sanitizedData.imageUrl = cleanUrl;
    msg.data = sanitizedData;
    msg.mutableContent = true;
    msg.richContent = { image: cleanUrl };
  } else {
    msg.data = sanitizedData;
    delete msg.mutableContent;
    delete msg.richContent;
  }

  return msg;
}

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

  const richPushImageUrl = resolveRichPushImageUrl({ imageUrl, data });

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
        imageUrl: imageUrl ?? richPushImageUrl,
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
  if (channel !== 'push_only') {
    const unreadMeta = await getUnreadCount(userId);
    result.unreadCount = unreadMeta.unreadCount;
  }

  // 3. Dispatch Push Notification (if channel allows)
  if (channel === 'all' || channel === 'push' || channel === 'push_only') {
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
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            data: {
              ...dataPayload,
              ...(notificationId ? { notificationId } : (dataPayload.notificationId ? { notificationId: dataPayload.notificationId } : {})),
              type,
              screen: dataPayload.screen,
              params: dataPayload.params,
              deepLink: dataPayload.deepLink,
            },
          };

          if (channel !== 'push_only') {
            msg.badge = result.unreadCount; // Authoritative badge count
          }

          return applyRichPushImage(msg, richPushImageUrl);
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
              ...(channel !== 'push_only' ? { badge: result.unreadCount } : {}),
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
