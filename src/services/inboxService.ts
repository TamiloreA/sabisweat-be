/**
 * In-App Notification Inbox Service
 * Handles notification storage, pagination, read/unread states, and badge counts.
 */

import { supabase } from '../config/database';
import {
  NotificationRow,
  InAppNotificationItem,
  NotificationsInboxResponse,
  UnreadCountResponse,
} from '../models/notificationModel';

const TABLE_NOTIFICATIONS = 'notifications';

export interface CreateInAppNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  description?: string;
  imageUrl?: string | null;
  data?: Record<string, any>;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Creates an in-app notification record with idempotency support
 */
export async function createInAppNotification(
  input: CreateInAppNotificationInput
): Promise<{ notification: InAppNotificationItem; isNew: boolean }> {
  const {
    userId,
    type,
    title,
    body,
    description = body,
    imageUrl = null,
    data = {},
    expiresAt = null,
    idempotencyKey = null,
  } = input;

  // Check idempotency if key provided
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from(TABLE_NOTIFICATIONS)
      .select('*')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return {
        notification: mapNotificationRow(existing as NotificationRow),
        isNew: false,
      };
    }
  }

  const now = new Date().toISOString();
  const insertPayload = {
    user_id: userId,
    type,
    title,
    body,
    description,
    image_url: imageUrl,
    data,
    read_at: null,
    expires_at: expiresAt,
    idempotency_key: idempotencyKey,
    created_at: now,
    updated_at: now,
  };

  const { data: created, error } = await supabase
    .from(TABLE_NOTIFICATIONS)
    .insert(insertPayload)
    .select()
    .single();

  if (error || !created) {
    console.error('[inboxService] Failed to create notification:', error);
    throw { status: 500, message: error?.message || 'Failed to create in-app notification' };
  }

  return {
    notification: mapNotificationRow(created as NotificationRow),
    isNew: true,
  };
}

/**
 * Fetch authoritative unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<UnreadCountResponse> {
  const now = new Date().toISOString();

  // Try DB RPC function first for high performance
  try {
    const { data: count, error } = await supabase.rpc('get_unread_notification_count', {
      p_user_id: userId,
    });

    if (!error && typeof count === 'number') {
      return {
        unreadCount: count,
        badge: count,
        updatedAt: now,
      };
    }
  } catch {
    // Fall back to direct query
  }

  const { count, error } = await supabase
    .from(TABLE_NOTIFICATIONS)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  const unreadCount = error || count === null ? 0 : count;

  return {
    unreadCount,
    badge: unreadCount,
    updatedAt: now,
  };
}

/**
 * Fetch paginated in-app notifications
 */
export async function getNotifications(
  userId: string,
  options: { page?: number; size?: number; includeExpired?: boolean } = {}
): Promise<NotificationsInboxResponse> {
  const page = Math.max(0, Number(options.page) || 0);
  const size = Math.min(100, Math.max(1, Number(options.size) || 20));
  const from = page * size;
  const to = from + size - 1;
  const now = new Date().toISOString();

  let query = supabase
    .from(TABLE_NOTIFICATIONS)
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  if (!options.includeExpired) {
    query = query.or(`expires_at.is.null,expires_at.gt.${now}`);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const [{ data, count, error }, unreadMeta] = await Promise.all([
    query,
    getUnreadCount(userId),
  ]);

  if (error) {
    console.error('[inboxService] Failed to fetch notifications:', error);
    throw { status: 500, message: error.message || 'Failed to fetch notifications' };
  }

  const items = (data || []).map((row) => mapNotificationRow(row as NotificationRow));

  return {
    page,
    size,
    total: count || 0,
    unreadCount: unreadMeta.unreadCount,
    data: items,
  };
}

/**
 * Fetch a single notification by ID
 */
export async function getNotificationById(
  userId: string,
  notificationId: string
): Promise<InAppNotificationItem> {
  const { data, error } = await supabase
    .from(TABLE_NOTIFICATIONS)
    .select('*')
    .eq('id', notificationId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw { status: 404, message: 'Notification not found' };
  }

  return mapNotificationRow(data as NotificationRow);
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(
  userId: string,
  notificationId: string
): Promise<{ ok: boolean; notificationId: string; unreadCount: number }> {
  return setReadState(userId, notificationId, true);
}

/**
 * Mark a single notification as unread
 */
export async function markAsUnread(
  userId: string,
  notificationId: string
): Promise<{ ok: boolean; notificationId: string; unreadCount: number }> {
  return setReadState(userId, notificationId, false);
}

/**
 * Internal helper to set read state (read or unread)
 */
async function setReadState(
  userId: string,
  notificationId: string,
  markRead: boolean
): Promise<{ ok: boolean; notificationId: string; unreadCount: number }> {
  const now = new Date().toISOString();

  // Try DB RPC first
  try {
    const { data, error } = await supabase.rpc('set_notification_read_state', {
      p_user_id: userId,
      p_notification_id: notificationId,
      p_mark_read: markRead,
    });

    if (!error && data && data.success) {
      return {
        ok: true,
        notificationId,
        unreadCount: data.unreadCount,
      };
    }
  } catch {
    // Fall back to direct query
  }

  const { error } = await supabase
    .from(TABLE_NOTIFICATIONS)
    .update({
      read_at: markRead ? now : null,
      updated_at: now,
    })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    console.error('[inboxService] Failed to set read state:', error);
    throw { status: 500, message: error.message || 'Failed to update notification' };
  }

  const unreadMeta = await getUnreadCount(userId);

  return {
    ok: true,
    notificationId,
    unreadCount: unreadMeta.unreadCount,
  };
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(
  userId: string
): Promise<{ ok: boolean; unreadCount: number }> {
  const now = new Date().toISOString();

  // Try DB RPC first
  try {
    const { data, error } = await supabase.rpc('mark_all_notifications_read', {
      p_user_id: userId,
    });

    if (!error && data && data.success) {
      return { ok: true, unreadCount: 0 };
    }
  } catch {
    // Fall back to direct query
  }

  const { error } = await supabase
    .from(TABLE_NOTIFICATIONS)
    .update({
      read_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('[inboxService] Failed to mark all as read:', error);
    throw { status: 500, message: error.message || 'Failed to mark notifications read' };
  }

  return { ok: true, unreadCount: 0 };
}

/**
 * Map database row to API response model
 */
function mapNotificationRow(row: NotificationRow): InAppNotificationItem {
  const isRead = Boolean(row.read_at);

  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description || row.body,
    imageUrl: row.image_url,
    meta: row.data || {},
    data: row.data || {},
    read: isRead,
    readAt: row.read_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
