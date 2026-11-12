/**
 * Notification Models and Type Definitions
 * SabiSweat Push Notification Infrastructure V2
 */

export type NotificationChannel = 'push' | 'email' | 'in_app' | 'push_only';

export type PushPlatform = 'ios' | 'android' | 'web';

export type Environment = 'development' | 'uat' | 'production' | 'staging';

export type DeliveryStatus =
  | 'queued'
  | 'submitted'
  | 'ticket_accepted'
  | 'receipt_ok'
  | 'failed'
  | 'retry_scheduled'
  | 'expired';

export type ScheduleStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled';

/**
 * Standard Push Categories
 */
export const PUSH_CATEGORIES = {
  DAILY_STEP_REMINDER: 'DAILY_STEP_REMINDER',
  STREAK_ALERT: 'STREAK_ALERT',
  CHALLENGE_UPDATE: 'CHALLENGE_UPDATE',
  REWARD_EARNED: 'REWARD_EARNED',
  COMMUNITY_UPDATE: 'COMMUNITY_UPDATE',
  PROXIMITY_REWARD: 'proximity_reward',
  STREAK_SAVER: 'streak_saver',
  STREAK_MILESTONE: 'streak_milestone',
  LIFE_HAPPENS_PASS: 'life_happens_pass',
  CHALLENGE_REMINDER: 'challenge_reminder',
  CHALLENGE_COMPLETION: 'challenge_completion',
  CLUB_LEADERBOARD: 'club_leaderboard',
  NEW_REWARD: 'new_reward',
  REFERRAL_REWARD: 'referral_reward',
  EVENT_REMINDER: 'event_reminder',
  WELCOME_ONBOARDING: 'welcome_onboarding',
} as const;

export const NOTIFICATION_TYPES = {
  SABI_LEVEL_UP: 'sabi_level_up',
} as const;

export type ClubNotificationPreference = 'all_posts' | 'announcements' | 'admin_posts' | 'off';

export type PushCategoryType = (typeof PUSH_CATEGORIES)[keyof typeof PUSH_CATEGORIES] | string;

/**
 * Standard Email Categories
 */
export const EMAIL_CATEGORIES = {
  WEEKLY_ACTIVITY_SUMMARY: 'WEEKLY_ACTIVITY_SUMMARY',
  COINS_REWARD_UPDATE: 'COINS_REWARD_UPDATE',
} as const;

export type EmailCategoryType = (typeof EMAIL_CATEGORIES)[keyof typeof EMAIL_CATEGORIES] | string;

/**
 * Device Registry Types
 */
export interface UserDeviceRow {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: PushPlatform;
  device_id: string | null;
  device_name: string | null;
  app_id: string | null;
  app_version: string | null;
  expo_project_id: string | null;
  environment: Environment;
  timezone: string;
  locale: string;
  notifications_enabled: boolean;
  is_active: boolean;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface RegisterDeviceInput {
  token: string; // Expo push token: ExponentPushToken[...] or ExpoPushToken[...]
  platform: PushPlatform;
  deviceId?: string;
  deviceName?: string;
  appId?: string;
  appVersion?: string;
  expoProjectId?: string;
  environment?: Environment;
  timezone?: string;
  locale?: string;
  notificationsEnabled?: boolean;
}

export interface UnregisterDeviceInput {
  token: string;
}

/**
 * Notification Preferences Types
 */
export interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  push_categories: Record<string, boolean>;
  email_categories: Record<string, boolean>;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  daily_cap: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesData {
  categories: Record<string, boolean>;
  emailCategories: Record<string, boolean>;
  quietHours: {
    enabled?: boolean;
    start: string;
    end: string;
  };
  dailyCap: number;
}

export interface UpdatePreferencesInput {
  categories?: Record<string, boolean>;
  emailCategories?: Record<string, boolean>;
  quietHours?: {
    enabled?: boolean;
    start?: string;
    end?: string;
  };
  dailyCap?: number;
}

/**
 * In-App Notification (Inbox) Types
 */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  description: string | null;
  image_url: string | null;
  data: Record<string, any>;
  read_at: string | null;
  expires_at: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface InAppNotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  meta?: Record<string, any>;
  data?: Record<string, any>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface NotificationsInboxResponse {
  page: number;
  size: number;
  total: number;
  unreadCount: number;
  data: InAppNotificationItem[];
}

export interface UnreadCountResponse {
  unreadCount: number;
  badge: number;
  updatedAt: string;
}

/**
 * Dispatch & Delivery Types
 */
export interface NotificationDataPayload {
  notificationId?: string;
  type?: string;
  screen?: string;
  params?: Record<string, any>;
  entityId?: string;
  deepLink?: string;
  campaignId?: string;
  [key: string]: any;
}

export interface DispatchNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  imageUrl?: string;
  data?: NotificationDataPayload;
  channel?: 'all' | 'push' | 'email' | 'in_app' | 'push_only';
  idempotencyKey?: string;
  expiresAt?: string;
  emailSubject?: string;
  emailHtml?: string;
}

export interface DispatchResult {
  inAppCreated: boolean;
  notificationId?: string;
  unreadCount: number;
  pushAttempts: number;
  pushTicketsCount: number;
  emailSent: boolean;
  errors?: string[];
}

/**
 * Expo Push Types
 */
export interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  categoryId?: string;
  richContent?: {
    image?: string;
  };
  ttl?: number;
  expiration?: number;
  subtitle?: string;
}

export interface ExpoPushTicket {
  id?: string;
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?:
      | 'DeviceNotRegistered'
      | 'MessageTooBig'
      | 'MessageRateExceeded'
      | 'InvalidCredentials'
      | string;
    [key: string]: any;
  };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?:
      | 'DeviceNotRegistered'
      | 'MessageTooBig'
      | 'MessageRateExceeded'
      | 'InvalidCredentials'
      | string;
    [key: string]: any;
  };
}

/**
 * Scheduled Notification Types
 */
export interface ScheduleNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  channel?: 'push' | 'email' | 'both';
  scheduledFor: string; // ISO string
  timezone?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}
