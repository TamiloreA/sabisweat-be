/**
 * Sabi Level Milestone & Notification Service
 * Detects, persists, and dispatches push-only notifications when users
 * achieve cumulative verified lifetime step milestones.
 *
 * Sabi Levels:
 * - Starter: 0 (initial level, no notification)
 * - Mover: 1,000,000 verified lifetime steps
 * - Strider: 2,000,000 verified lifetime steps
 * - Champion: 3,000,000 verified lifetime steps
 * - Legend: 4,000,000 verified lifetime steps
 */

import { supabase } from '../config/database';
import { SabiLevel } from '../models/authModel';
import { LEVEL_RANK, normalizeSabiLevel } from './pointsService';
import { dispatchNotification } from './notificationDispatcher';
import { notificationTemplates } from './notificationTemplates';
import { NOTIFICATION_TYPES } from '../models/notificationModel';

export interface SabiLevelMilestoneDef {
  level: SabiLevel;
  threshold: number;
  badgeKey: string;
}

export const SABI_LEVEL_MILESTONES: SabiLevelMilestoneDef[] = [
  { level: 'Mover', threshold: 1_000_000, badgeKey: 'sabi_level_mover' },
  { level: 'Strider', threshold: 2_000_000, badgeKey: 'sabi_level_strider' },
  { level: 'Champion', threshold: 3_000_000, badgeKey: 'sabi_level_champion' },
  { level: 'Legend', threshold: 4_000_000, badgeKey: 'sabi_level_legend' },
];

const TABLE_USER_ACHIEVEMENTS = 'user_achievements';
const TABLE_PROFILES = 'profiles';
const TABLE_DAILY_STEPS = 'daily_steps';

/**
 * Calculates cumulative verified lifetime steps from daily_steps and profiles.steps_count
 */
export async function getVerifiedLifetimeSteps(
  userId: string
): Promise<{ lifetimeSteps: number; storedLevel: SabiLevel; profileSteps: number }> {
  const [profileRes, stepsRes] = await Promise.all([
    supabase
      .from(TABLE_PROFILES)
      .select('id, sabi_level, steps_count')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from(TABLE_DAILY_STEPS)
      .select('steps')
      .eq('user_id', userId),
  ]);

  const profileSteps = Number(profileRes.data?.steps_count || 0);
  const storedLevel = normalizeSabiLevel(profileRes.data?.sabi_level);

  const dailyStepsList = (stepsRes.data || []).map((r: any) => Number(r.steps) || 0);
  const calculatedDailySteps = dailyStepsList.reduce((acc, val) => acc + val, 0);

  const lifetimeSteps = Math.max(calculatedDailySteps, profileSteps);

  return { lifetimeSteps, storedLevel, profileSteps };
}

export interface CheckMilestoneResult {
  userId: string;
  lifetimeSteps: number;
  awardedLevels: SabiLevel[];
  highestLevel: SabiLevel;
}

/**
 * Checks if user's cumulative verified lifetime steps crossed any Sabi Level threshold.
 * Newly achieved milestones are recorded in public.user_achievements (ensuring database-level
 * unique constraint protection) and push-only notifications are dispatched in ascending order.
 *
 * Strictly push-only:
 * - Does NOT create in-app notifications
 * - Does NOT affect inbox unread count or badge counts
 */
export async function checkAndAwardSabiLevelMilestones(
  userId: string,
  options?: { precomputedLifetimeSteps?: number }
): Promise<CheckMilestoneResult> {
  // 1. Resolve lifetime steps
  let lifetimeSteps = options?.precomputedLifetimeSteps;
  let storedLevel: SabiLevel = 'Starter';
  let profileSteps = 0;

  if (lifetimeSteps === undefined) {
    const res = await getVerifiedLifetimeSteps(userId);
    lifetimeSteps = res.lifetimeSteps;
    storedLevel = res.storedLevel;
    profileSteps = res.profileSteps;
  } else {
    const { data: profile } = await supabase
      .from(TABLE_PROFILES)
      .select('sabi_level, steps_count')
      .eq('id', userId)
      .maybeSingle();
    storedLevel = normalizeSabiLevel(profile?.sabi_level);
    profileSteps = Number(profile?.steps_count || 0);
    lifetimeSteps = Math.max(lifetimeSteps, profileSteps);
  }

  const result: CheckMilestoneResult = {
    userId,
    lifetimeSteps,
    awardedLevels: [],
    highestLevel: storedLevel,
  };

  // If user has not reached the first milestone (Mover: 1,000,000), skip milestone checks
  if (lifetimeSteps < SABI_LEVEL_MILESTONES[0].threshold) {
    return result;
  }

  // 2. Fetch already awarded Sabi Level milestones for this user
  const { data: existingAchievements, error: fetchError } = await supabase
    .from(TABLE_USER_ACHIEVEMENTS)
    .select('badge_key, earned_at')
    .eq('user_id', userId)
    .eq('category', 'sabi_level');

  if (fetchError) {
    console.warn('[sabiLevelService] Failed to query existing user_achievements:', fetchError);
  }

  const existingKeys = new Set(
    (existingAchievements || []).map((a: any) => String(a.badge_key).toLowerCase())
  );

  let currentHighestLevel = storedLevel;

  // 3. Process milestones in strictly ascending order: Mover -> Strider -> Champion -> Legend
  for (const milestone of SABI_LEVEL_MILESTONES) {
    // Only consider milestones the user has actually crossed
    if (lifetimeSteps < milestone.threshold) {
      continue;
    }

    // If milestone is already awarded, do not re-award or re-notify
    if (existingKeys.has(milestone.badgeKey.toLowerCase())) {
      if (LEVEL_RANK[milestone.level] > LEVEL_RANK[currentHighestLevel]) {
        currentHighestLevel = milestone.level;
      }
      continue;
    }

    // 4. Atomically persist milestone achievement in public.user_achievements
    const earnedAt = new Date().toISOString();
    const achievementRecord = {
      user_id: userId,
      category: 'sabi_level',
      badge_key: milestone.badgeKey,
      earned_at: earnedAt,
      progress_value: lifetimeSteps,
      target_value: milestone.threshold,
      month_period: null,
      metadata: {
        level: milestone.level,
        title: `Level Up: ${milestone.level}`,
        push_dispatched: false,
      },
      updated_at: earnedAt,
    };

    let insertedRecord: any = null;
    try {
      const insertRes = await supabase
        .from(TABLE_USER_ACHIEVEMENTS)
        .insert(achievementRecord)
        .select()
        .maybeSingle();

      if (insertRes.error) {
        // Code 23505 is PostgreSQL unique_violation (already awarded concurrently)
        if (insertRes.error.code === '23505') {
          console.log(`[sabiLevelService] Milestone ${milestone.level} already recorded concurrently for user ${userId}`);
          existingKeys.add(milestone.badgeKey.toLowerCase());
          continue;
        }
        console.warn(`[sabiLevelService] Insert error for milestone ${milestone.level}:`, insertRes.error);
        continue;
      }

      insertedRecord = insertRes.data;
    } catch (dbErr: any) {
      if (dbErr?.code === '23505') {
        console.log(`[sabiLevelService] Milestone ${milestone.level} already recorded concurrently for user ${userId}`);
        existingKeys.add(milestone.badgeKey.toLowerCase());
        continue;
      }
      console.warn(`[sabiLevelService] Unexpected error persisting milestone ${milestone.level}:`, dbErr);
      continue;
    }

    // Successfully recorded!
    existingKeys.add(milestone.badgeKey.toLowerCase());
    result.awardedLevels.push(milestone.level);

    if (LEVEL_RANK[milestone.level] > LEVEL_RANK[currentHighestLevel]) {
      currentHighestLevel = milestone.level;
    }

    // 5. Dispatch Push Notification (push-only, bypasses inbox and unread counts)
    try {
      const template = notificationTemplates.sabiLevelUp(milestone.level);
      const dispatchResult = await dispatchNotification({
        userId,
        type: NOTIFICATION_TYPES.SABI_LEVEL_UP,
        title: template.title,
        body: template.body,
        data: template.data,
        channel: 'push_only',
        idempotencyKey: `sabi_level_up:${userId}:${milestone.level}`,
      });

      const pushAccepted = dispatchResult.pushTicketsCount > 0 || dispatchResult.pushAttempts > 0;

      // Update metadata on achievement record
      await supabase
        .from(TABLE_USER_ACHIEVEMENTS)
        .update({
          metadata: {
            level: milestone.level,
            title: `Level Up: ${milestone.level}`,
            push_dispatched: pushAccepted,
            push_dispatched_at: new Date().toISOString(),
            push_tickets_count: dispatchResult.pushTicketsCount,
          },
        })
        .eq('user_id', userId)
        .eq('category', 'sabi_level')
        .eq('badge_key', milestone.badgeKey);
    } catch (pushErr) {
      console.error(`[sabiLevelService] Push notification dispatch failed for ${milestone.level}:`, pushErr);
      // Note: user_achievements record remains intact and is never lost
    }
  }

  // 6. Update user's profile with highest Sabi Level and latest lifetime steps
  result.highestLevel = currentHighestLevel;
  if (
    LEVEL_RANK[currentHighestLevel] > LEVEL_RANK[storedLevel] ||
    lifetimeSteps > profileSteps
  ) {
    try {
      await supabase
        .from(TABLE_PROFILES)
        .update({
          sabi_level: currentHighestLevel,
          steps_count: lifetimeSteps,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } catch (profErr) {
      console.warn('[sabiLevelService] Failed to update profile sabi_level/steps_count:', profErr);
    }
  }

  return result;
}
