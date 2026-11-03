/**
 * Device Registry Service
 * Manages Expo push tokens, active devices, and token deactivation.
 */

import { supabase } from '../config/database';
import {
  RegisterDeviceInput,
  UserDeviceRow,
  PushPlatform,
  Environment,
} from '../models/notificationModel';

const TABLE_USER_DEVICES = 'user_devices';

/**
 * Validates if a token matches the Expo push token pattern
 */
export function isExpoPushToken(token: string): boolean {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  return (
    (trimmed.startsWith('ExponentPushToken[') || trimmed.startsWith('ExpoPushToken[')) &&
    trimmed.endsWith(']')
  );
}

/**
 * Register or update a user device with push token
 * Idempotent upsert ensuring active state and refreshed metadata.
 */
export async function registerDevice(
  userId: string,
  input: RegisterDeviceInput
): Promise<UserDeviceRow> {
  const token = (input.token || '').trim();
  if (!token) {
    throw { status: 400, message: 'Push token is required' };
  }

  // Allow standard Expo push tokens or clean alphanumeric tokens
  if (!isExpoPushToken(token) && token.length < 10) {
    throw { status: 400, message: 'Invalid push token format' };
  }

  const platform: PushPlatform =
    input.platform === 'ios' || input.platform === 'android' || input.platform === 'web'
      ? input.platform
      : 'ios';

  const environment: Environment = input.environment || 'production';
  const now = new Date().toISOString();

  // If this token was registered by another user previously, deactivate it for that user
  try {
    await supabase
      .from(TABLE_USER_DEVICES)
      .update({
        is_active: false,
        invalidated_at: now,
        invalidation_reason: 'rebound_to_new_user',
        updated_at: now,
      })
      .eq('expo_push_token', token)
      .neq('user_id', userId);
  } catch (err) {
    console.warn('[deviceService] Token rebinding cleanup warning:', err);
  }

  // Upsert the device for the current user
  const payload = {
    user_id: userId,
    expo_push_token: token,
    platform,
    device_id: input.deviceId || null,
    device_name: input.deviceName || null,
    app_id: input.appId || null,
    app_version: input.appVersion || null,
    expo_project_id: input.expoProjectId || null,
    environment,
    timezone: input.timezone || 'Africa/Lagos',
    locale: input.locale || 'en',
    notifications_enabled: input.notificationsEnabled !== false,
    is_active: true,
    invalidated_at: null,
    invalidation_reason: null,
    last_seen_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(TABLE_USER_DEVICES)
    .upsert(payload, { onConflict: 'user_id,expo_push_token' })
    .select()
    .single();

  if (error || !data) {
    console.error('[deviceService] Failed to upsert device:', error);
    throw { status: 500, message: error?.message || 'Failed to register device' };
  }

  return data as UserDeviceRow;
}

/**
 * Unregister or deactivate a push token
 */
export async function unregisterDevice(
  userId: string,
  token: string
): Promise<{ success: boolean }> {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    throw { status: 400, message: 'Push token is required' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE_USER_DEVICES)
    .update({
      is_active: false,
      invalidated_at: now,
      invalidation_reason: 'unregistered_by_user',
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('expo_push_token', cleanToken);

  if (error) {
    console.error('[deviceService] Failed to unregister device:', error);
    throw { status: 500, message: error.message || 'Failed to unregister device' };
  }

  return { success: true };
}

/**
 * Deactivate a token across all records (e.g. when Expo reports DeviceNotRegistered)
 */
export async function deactivateInvalidToken(
  token: string,
  reason = 'DeviceNotRegistered'
): Promise<void> {
  const cleanToken = (token || '').trim();
  if (!cleanToken) return;

  const now = new Date().toISOString();
  try {
    await supabase
      .from(TABLE_USER_DEVICES)
      .update({
        is_active: false,
        invalidated_at: now,
        invalidation_reason: reason,
        updated_at: now,
      })
      .eq('expo_push_token', cleanToken);
  } catch (err) {
    console.error('[deviceService] Error deactivating invalid token:', err);
  }
}

/**
 * Fetch all active devices for a user
 */
export async function getActiveDevicesForUser(
  userId: string,
  environment?: Environment
): Promise<UserDeviceRow[]> {
  let query = supabase
    .from(TABLE_USER_DEVICES)
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('notifications_enabled', true);

  if (environment) {
    query = query.eq('environment', environment);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[deviceService] Error fetching user devices:', error);
    return [];
  }

  return (data || []) as UserDeviceRow[];
}

/**
 * Fetch all registered devices for user (both active and inactive)
 */
export async function getUserDevices(userId: string): Promise<UserDeviceRow[]> {
  const { data, error } = await supabase
    .from(TABLE_USER_DEVICES)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[deviceService] Error fetching all user devices:', error);
    throw { status: 500, message: error.message || 'Failed to fetch user devices' };
  }

  return (data || []) as UserDeviceRow[];
}
