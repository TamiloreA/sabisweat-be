/**
 * Notification Preference Service
 * Manages per-category push & email preferences, quiet hours, and daily limits.
 */

import { supabase } from '../config/database';
import {
  NotificationPreferencesRow,
  NotificationPreferencesData,
  UpdatePreferencesInput,
  PUSH_CATEGORIES,
  EMAIL_CATEGORIES,
} from '../models/notificationModel';

const TABLE_PREFERENCES = 'notification_preferences';

/**
 * Normalizes slug or enum category names to canonical keys
 */
export function normalizeCategoryKey(key: string): string {
  const clean = key.trim().toLowerCase().replace(/-/g, '_');
  const mapping: Record<string, string> = {
    daily_steps_reminder: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
    daily_step_reminder: PUSH_CATEGORIES.DAILY_STEP_REMINDER,
    streak_alerts: PUSH_CATEGORIES.STREAK_ALERT,
    streak_alert: PUSH_CATEGORIES.STREAK_ALERT,
    challenge_updates: PUSH_CATEGORIES.CHALLENGE_UPDATE,
    challenge_update: PUSH_CATEGORIES.CHALLENGE_UPDATE,
    rewards_earned_alerts: PUSH_CATEGORIES.REWARD_EARNED,
    reward_earned: PUSH_CATEGORIES.REWARD_EARNED,
    weekly_activity_summary: EMAIL_CATEGORIES.WEEKLY_ACTIVITY_SUMMARY,
    coins_rewards_updates: EMAIL_CATEGORIES.COINS_REWARD_UPDATE,
    coins_reward_update: EMAIL_CATEGORIES.COINS_REWARD_UPDATE,
  };

  return mapping[clean] || key;
}

const DEFAULT_PUSH_CATEGORIES: Record<string, boolean> = {
  [PUSH_CATEGORIES.DAILY_STEP_REMINDER]: true,
  [PUSH_CATEGORIES.STREAK_ALERT]: true,
  [PUSH_CATEGORIES.CHALLENGE_UPDATE]: true,
  [PUSH_CATEGORIES.REWARD_EARNED]: true,
  proximity_reward: true,
  streak_saver: true,
  streak_milestone: true,
  life_happens_pass: true,
  challenge_reminder: true,
  challenge_completion: true,
  club_leaderboard: true,
  new_reward: true,
  referral_reward: true,
  event_reminder: true,
  welcome_onboarding: true,
};

const DEFAULT_EMAIL_CATEGORIES: Record<string, boolean> = {
  [EMAIL_CATEGORIES.WEEKLY_ACTIVITY_SUMMARY]: true,
  [EMAIL_CATEGORIES.COINS_REWARD_UPDATE]: true,
};

/**
 * Fetch or lazily initialize preferences for a user
 */
export async function getPreferences(userId: string): Promise<NotificationPreferencesData> {
  const { data, error } = await supabase
    .from(TABLE_PREFERENCES)
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Lazily create default preferences row
    const defaultRow = {
      user_id: userId,
      push_categories: DEFAULT_PUSH_CATEGORIES,
      email_categories: DEFAULT_EMAIL_CATEGORIES,
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      daily_cap: 10,
    };

    const { data: created, error: insertError } = await supabase
      .from(TABLE_PREFERENCES)
      .upsert(defaultRow, { onConflict: 'user_id' })
      .select()
      .single();

    if (insertError || !created) {
      console.warn('[preferenceService] Error creating default preferences, returning memory fallback:', insertError);
      return {
        categories: { ...DEFAULT_PUSH_CATEGORIES },
        emailCategories: { ...DEFAULT_EMAIL_CATEGORIES },
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        dailyCap: 10,
      };
    }

    return mapPreferencesRow(created as NotificationPreferencesRow);
  }

  return mapPreferencesRow(data as NotificationPreferencesRow);
}

/**
 * Map database preferences row to API format
 */
function mapPreferencesRow(row: NotificationPreferencesRow): NotificationPreferencesData {
  const mergedPush = { ...DEFAULT_PUSH_CATEGORIES, ...(row.push_categories || {}) };
  const mergedEmail = { ...DEFAULT_EMAIL_CATEGORIES, ...(row.email_categories || {}) };

  return {
    categories: mergedPush,
    emailCategories: mergedEmail,
    quietHours: {
      enabled: row.quiet_hours_enabled,
      start: row.quiet_hours_start || '22:00',
      end: row.quiet_hours_end || '07:00',
    },
    dailyCap: row.daily_cap || 10,
  };
}

/**
 * Update notification preferences
 */
export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput
): Promise<NotificationPreferencesData> {
  const current = await getPreferences(userId);

  const updatedPush = { ...current.categories };
  if (input.categories) {
    for (const [key, val] of Object.entries(input.categories)) {
      if (typeof val === 'boolean') {
        updatedPush[key] = val;
        // Also map alias if applicable
        const normalized = normalizeCategoryKey(key);
        updatedPush[normalized] = val;
      }
    }
  }

  const updatedEmail = { ...current.emailCategories };
  if (input.emailCategories) {
    for (const [key, val] of Object.entries(input.emailCategories)) {
      if (typeof val === 'boolean') {
        updatedEmail[key] = val;
        const normalized = normalizeCategoryKey(key);
        updatedEmail[normalized] = val;
      }
    }
  }

  const quietHours = input.quietHours || {};
  const quietHoursEnabled =
    typeof quietHours.enabled === 'boolean' ? quietHours.enabled : current.quietHours.enabled;
  const quietHoursStart = quietHours.start || current.quietHours.start;
  const quietHoursEnd = quietHours.end || current.quietHours.end;
  const dailyCap = typeof input.dailyCap === 'number' ? input.dailyCap : current.dailyCap;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE_PREFERENCES)
    .upsert(
      {
        user_id: userId,
        push_categories: updatedPush,
        email_categories: updatedEmail,
        quiet_hours_enabled: quietHoursEnabled,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
        daily_cap: dailyCap,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error || !data) {
    console.error('[preferenceService] Error updating preferences:', error);
    throw { status: 500, message: error?.message || 'Failed to update preferences' };
  }

  return mapPreferencesRow(data as NotificationPreferencesRow);
}

/**
 * Toggle a single push notification category
 */
export async function togglePushCategory(
  userId: string,
  categoryKey: string,
  enabled: boolean
): Promise<{ key: string; enabled: boolean }> {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const current = await getPreferences(userId);

  const updatedPush = {
    ...current.categories,
    [categoryKey]: enabled,
    [normalizedKey]: enabled,
  };

  await updatePreferences(userId, { categories: updatedPush });
  return { key: categoryKey, enabled };
}

/**
 * Toggle a single email notification category
 */
export async function toggleEmailCategory(
  userId: string,
  categoryKey: string,
  enabled: boolean
): Promise<{ key: string; enabled: boolean }> {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const current = await getPreferences(userId);

  const updatedEmail = {
    ...current.emailCategories,
    [categoryKey]: enabled,
    [normalizedKey]: enabled,
  };

  await updatePreferences(userId, { emailCategories: updatedEmail });
  return { key: categoryKey, enabled };
}

/**
 * Check if push is enabled for a given category
 */
export async function isPushCategoryEnabled(
  userId: string,
  category: string
): Promise<boolean> {
  const prefs = await getPreferences(userId);
  const normalized = normalizeCategoryKey(category);

  if (prefs.categories[normalized] !== undefined) {
    return Boolean(prefs.categories[normalized]);
  }
  if (prefs.categories[category] !== undefined) {
    return Boolean(prefs.categories[category]);
  }

  // Default to true for recognized categories
  return true;
}

/**
 * Check if email is enabled for a given category
 */
export async function isEmailCategoryEnabled(
  userId: string,
  category: string
): Promise<boolean> {
  const prefs = await getPreferences(userId);
  const normalized = normalizeCategoryKey(category);

  if (prefs.emailCategories[normalized] !== undefined) {
    return Boolean(prefs.emailCategories[normalized]);
  }
  if (prefs.emailCategories[category] !== undefined) {
    return Boolean(prefs.emailCategories[category]);
  }

  return true;
}
