/**
 * Notification Business Events Service
 * Implements business event triggers, schedulers, and rich payloads for:
 * 1. Home Screen: Daily Steps & Streak Lifecycle
 * 2. Challenges Engine: Daily Step, Steps Goal, and Most Steps
 */

import { supabase } from '../config/database';
import { dispatchNotification } from './notificationDispatcher';
import { notificationTemplates, resolveChallengeNotificationImage } from './notificationTemplates';
import { getCurrentStreak } from './streaksService';
import { getLeaderboard } from './challengeService';

const TABLE_PROFILES = 'profiles';
const TABLE_DAILY_STEPS = 'daily_steps';
const TABLE_CHALLENGES = 'challenges';
const TABLE_PARTICIPANTS = 'challenge_participants';
const TABLE_CLUBS = 'clubs';
const TABLE_CLUB_MEMBERS = 'club_members';
const TABLE_USER_DEVICES = 'user_devices';
const TABLE_NOTIFICATIONS = 'notifications';
const TABLE_ACHIEVEMENTS = 'user_achievements';

/**
 * Extracts local date and time parts from a Date object using an IANA timezone
 */
export function getLocalParts(
  date: Date = new Date(),
  timeZone: string = 'Africa/Lagos'
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateStr: string; // YYYY-MM-DD
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const year = Number(getPart('year'));
    const month = Number(getPart('month'));
    const day = Number(getPart('day'));
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, hour, minute, dateStr };
  } catch {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const dateStr = date.toISOString().slice(0, 10);
    return { year, month, day, hour, minute, dateStr };
  }
}

/**
 * Checks if a notification with the given idempotency key was already created for user
 */
async function hasNotification(userId: string, idempotencyKey: string): Promise<boolean> {
  const { data } = await supabase
    .from(TABLE_NOTIFICATIONS)
    .select('id')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Internal helper to query raw challenge row
 */
async function fetchChallengeRow(challengeId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from(TABLE_CHALLENGES)
    .select('*')
    .eq('id', challengeId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — HOME SCREEN: DAILY STEPS & STREAK LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates step milestone events (50%, 80%, 100%) during/after step synchronization
 */
export async function handleStepSyncEvents(
  userId: string,
  dateStr: string,
  currentSteps: number,
  _timeZone?: string
): Promise<{
  milestone50: boolean;
  milestone80: boolean;
  goalCompleted: boolean;
}> {
  const result = { milestone50: false, milestone80: false, goalCompleted: false };

  // 1. Get user step goal
  const { data: profile } = await supabase
    .from(TABLE_PROFILES)
    .select('step_goal')
    .eq('id', userId)
    .single();

  const stepGoal = profile?.step_goal || 10000;
  if (stepGoal <= 0) return result;

  const key100 = `step_goal_100:${userId}:${dateStr}`;
  const already100 = await hasNotification(userId, key100);

  // 2. 100% Daily Goal Completed
  if (currentSteps >= stepGoal) {
    if (!already100) {
      // Query authoritative streak logic
      try {
        const streakInfo = await getCurrentStreak(userId);
        const streakDays = streakInfo?.streakDays || 1;

        const payload = notificationTemplates.dailyGoalCompleted(stepGoal, streakDays);
        await dispatchNotification({
          userId,
          type: payload.category,
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
          data: payload.data,
          idempotencyKey: key100,
        });
        result.goalCompleted = true;
      } catch (err) {
        console.warn('[notificationEvent] Error computing streak for 100% notification:', err);
      }
    }
  }

  // If user has already reached 100%, 50% and 80% notifications are suppressed
  if (already100 || currentSteps >= stepGoal) {
    // Proceed to challenge progress evaluation
    await evaluateActiveChallengesForUser(userId, currentSteps);
    return result;
  }

  // 3. 80% Step Goal Milestone
  if (currentSteps >= Math.floor(stepGoal * 0.8)) {
    const key80 = `step_milestone_80:${userId}:${dateStr}`;
    const already80 = await hasNotification(userId, key80);
    if (!already80) {
      const remainingSteps = Math.max(0, stepGoal - currentSteps);
      const payload = notificationTemplates.stepMilestone80(remainingSteps);
      await dispatchNotification({
        userId,
        type: payload.category,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        idempotencyKey: key80,
      });
      result.milestone80 = true;
    }
  }

  // 4. 50% Step Goal Milestone
  if (currentSteps >= Math.floor(stepGoal * 0.5)) {
    const key50 = `step_milestone_50:${userId}:${dateStr}`;
    const already50 = await hasNotification(userId, key50);
    if (!already50) {
      const payload = notificationTemplates.stepMilestone50(currentSteps);
      await dispatchNotification({
        userId,
        type: payload.category,
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
        data: payload.data,
        idempotencyKey: key50,
      });
      result.milestone50 = true;
    }
  }

  // Proceed to challenge progress evaluation
  await evaluateActiveChallengesForUser(userId, currentSteps);

  return result;
}

/**
 * Evaluates Morning Kickoff (7:00 AM local time) for all active users
 */
export async function processMorningKickoffJob(now: Date = new Date()): Promise<{ evaluated: number; sent: number }> {
  // 1. Fetch active devices with user timezone
  const { data: devices, error } = await supabase
    .from(TABLE_USER_DEVICES)
    .select('user_id, timezone')
    .eq('is_active', true)
    .eq('notifications_enabled', true);

  if (error || !devices || devices.length === 0) {
    return { evaluated: 0, sent: 0 };
  }

  // Group by unique user
  const userTimezoneMap = new Map<string, string>();
  for (const d of devices) {
    if (!userTimezoneMap.has(d.user_id)) {
      userTimezoneMap.set(d.user_id, d.timezone || 'Africa/Lagos');
    }
  }

  let sent = 0;
  for (const [userId, tz] of userTimezoneMap.entries()) {
    const local = getLocalParts(now, tz);

    // Only fire during the 7:00 AM hour (07:00 - 07:59)
    if (local.hour === 7) {
      const idempotencyKey = `morning_kickoff:${userId}:${local.dateStr}`;
      const already = await hasNotification(userId, idempotencyKey);
      if (already) continue;

      // Query steps recorded today up to 7:00 AM
      const { data: stepRow } = await supabase
        .from(TABLE_DAILY_STEPS)
        .select('steps')
        .eq('user_id', userId)
        .eq('date', local.dateStr)
        .maybeSingle();

      const steps = stepRow?.steps || 0;
      const payload = notificationTemplates.morningKickoff(steps);

      await dispatchNotification({
        userId,
        type: payload.category,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        idempotencyKey,
      });

      sent++;
    }
  }

  return { evaluated: userTimezoneMap.size, sent };
}

/**
 * Evaluates Streak at Risk (8:30 PM local time) for all eligible users
 */
export async function processStreakAtRiskJob(now: Date = new Date()): Promise<{ evaluated: number; sent: number }> {
  const { data: devices, error } = await supabase
    .from(TABLE_USER_DEVICES)
    .select('user_id, timezone')
    .eq('is_active', true)
    .eq('notifications_enabled', true);

  if (error || !devices || devices.length === 0) {
    return { evaluated: 0, sent: 0 };
  }

  const userTimezoneMap = new Map<string, string>();
  for (const d of devices) {
    if (!userTimezoneMap.has(d.user_id)) {
      userTimezoneMap.set(d.user_id, d.timezone || 'Africa/Lagos');
    }
  }

  let sent = 0;
  for (const [userId, tz] of userTimezoneMap.entries()) {
    const local = getLocalParts(now, tz);

    // Matches 8:30 PM (20:30 - 20:59, or 20:00 - 20:59 during hourly runs)
    if (local.hour === 20 && local.minute >= 30) {
      const idempotencyKey = `streak_at_risk:${userId}:${local.dateStr}`;
      const already = await hasNotification(userId, idempotencyKey);
      if (already) continue;

      // 1. Get profile goal
      const { data: profile } = await supabase
        .from(TABLE_PROFILES)
        .select('step_goal')
        .eq('id', userId)
        .single();

      const stepGoal = profile?.step_goal || 10000;

      // 2. Get today steps
      const { data: stepRow } = await supabase
        .from(TABLE_DAILY_STEPS)
        .select('steps')
        .eq('user_id', userId)
        .eq('date', local.dateStr)
        .maybeSingle();

      const todaySteps = stepRow?.steps || 0;

      // Strict Rule 1: User has NOT completed 100% of their daily goal
      if (todaySteps >= stepGoal) continue;

      // Strict Rule 2: User's current streak is greater than or equal to 1
      let streakDays = 0;
      try {
        const streakInfo = await getCurrentStreak(userId);
        streakDays = streakInfo?.streakDays || 0;
      } catch {}

      if (streakDays < 1) continue;

      // Strict Rule 3: User still has steps remaining before midnight
      const remainingSteps = stepGoal - todaySteps;
      if (remainingSteps <= 0) continue;

      const payload = notificationTemplates.streakAtRisk(streakDays, remainingSteps);
      await dispatchNotification({
        userId,
        type: payload.category,
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
        data: payload.data,
        idempotencyKey,
      });

      sent++;
    }
  }

  return { evaluated: userTimezoneMap.size, sent };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — CHALLENGES ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatches challenge creation discovery notifications based on club privacy rules
 */
export async function handleChallengeCreatedEvent(challengeId: string): Promise<{ notifiedCount: number }> {
  // 1. Load challenge
  const challenge = await fetchChallengeRow(challengeId);
  if (!challenge) return { notifiedCount: 0 };

  const isClubPrivate = challenge.who_can_join === 'club_members' && challenge.host_club_id;
  let targetUserIds: string[] = [];

  let clubName = challenge.host_name || 'Your Club';
  let clubLogo: string | undefined;

  if (isClubPrivate) {
    // Strictly fetch active members of host_club_id
    const { data: members, error } = await supabase
      .from(TABLE_CLUB_MEMBERS)
      .select('user_id')
      .eq('club_id', challenge.host_club_id);

    if (!error && members) {
      targetUserIds = members.map((m) => m.user_id);
    }

    const { data: club } = await supabase
      .from(TABLE_CLUBS)
      .select('name, profile_image_url')
      .eq('id', challenge.host_club_id)
      .maybeSingle();

    if (club) {
      if (club.name) clubName = club.name;
      if (club.profile_image_url) clubLogo = club.profile_image_url;
    }
  } else {
    // Public challenge: send to active registered devices / profiles
    const { data: devices, error } = await supabase
      .from(TABLE_USER_DEVICES)
      .select('user_id')
      .eq('is_active', true)
      .eq('notifications_enabled', true);

    if (!error && devices) {
      targetUserIds = [...new Set(devices.map((d) => d.user_id))];
    }
  }

  let count = 0;
  for (const userId of targetUserIds) {
    const idempotencyKey = `challenge_discovery:${challengeId}:${userId}`;
    const already = await hasNotification(userId, idempotencyKey);
    if (already) continue;

    const challengeImage = resolveChallengeNotificationImage(challenge);

    const payload = isClubPrivate
      ? notificationTemplates.clubChallengeCreated(
          challengeId,
          challenge.title,
          clubName,
          challengeImage
        )
      : notificationTemplates.publicChallengeCreated(
          challengeId,
          challenge.title,
          clubName,
          challengeImage
        );

    await dispatchNotification({
      userId,
      type: payload.category,
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
      data: payload.data,
      idempotencyKey,
    });

    count++;
  }

  return { notifiedCount: count };
}

/**
 * Evaluates 75% challenge milestone and leaderboard overtake when user steps update
 */
async function evaluateActiveChallengesForUser(userId: string, _todaySteps: number): Promise<void> {
  // Find active challenges the user is participating in
  const nowIso = new Date().toISOString();
  const { data: participations } = await supabase
    .from(TABLE_PARTICIPANTS)
    .select('challenge_id, challenges!inner(*)')
    .eq('user_id', userId)
    .is('left_at', null)
    .lte('challenges.start_at', nowIso)
    .gte('challenges.end_at', nowIso);

  if (!participations || participations.length === 0) return;

  for (const part of participations) {
    const ch = (part as any).challenges;
    if (!ch) continue;

    const goalType = ch.goal_type || 'steps_goal';

    // 1. 75% Milestone (steps_goal & daily_step only, NOT most_steps)
    if (goalType !== 'most_steps') {
      const milestoneKey = `challenge_milestone_75:${ch.id}:${userId}`;
      const already = await hasNotification(userId, milestoneKey);

      if (!already) {
        let reached75 = false;

        if (goalType === 'steps_goal') {
          // Check total steps in challenge
          const startDate = new Date(ch.start_at).toISOString().split('T')[0];
          const endDate = new Date(ch.end_at).toISOString().split('T')[0];
          const { data: stepsRows } = await supabase
            .from(TABLE_DAILY_STEPS)
            .select('steps')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate);

          const totalSteps = (stepsRows || []).reduce((sum, r) => sum + (r.steps || 0), 0);
          const goalValue = ch.goal_value || 1;
          if (totalSteps >= Math.floor(goalValue * 0.75)) {
            reached75 = true;
          }
        } else if (goalType === 'daily_step') {
          // Check completed days
          const startDate = new Date(ch.start_at).toISOString().split('T')[0];
          const endDate = new Date(ch.end_at).toISOString().split('T')[0];
          const goalValue = ch.goal_value || 1;

          const { data: stepsRows } = await supabase
            .from(TABLE_DAILY_STEPS)
            .select('steps')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate);

          const daysCompleted = (stepsRows || []).filter((r) => r.steps >= goalValue).length;
          const totalDays = Math.max(
            1,
            Math.round(
              (new Date(ch.end_at).getTime() - new Date(ch.start_at).getTime()) / (1000 * 60 * 60 * 24)
            )
          );

          if (daysCompleted >= Math.ceil(totalDays * 0.75)) {
            reached75 = true;
          }
        }

        if (reached75) {
          const payload = notificationTemplates.challengeMilestone75(ch.id, ch.title);
          await dispatchNotification({
            userId,
            type: payload.category,
            title: payload.title,
            body: payload.body,
            data: payload.data,
            idempotencyKey: milestoneKey,
          });
        }
      }
    }

    // 2. Leaderboard Overtake (Club challenges only)
    if (ch.host_club_id) {
      try {
        await evaluateLeaderboardOvertake(ch.id, ch.title, userId);
      } catch (err) {
        console.warn('[notificationEvent] Error evaluating leaderboard overtake:', err);
      }
    }
  }
}

/**
 * Evaluates if the current user just overtook another participant on the club challenge leaderboard
 */
async function evaluateLeaderboardOvertake(
  challengeId: string,
  challengeTitle: string,
  overtakerId: string
): Promise<void> {
  const leaderboard = await getLeaderboard(challengeId, 0, 50);
  if (!leaderboard || !leaderboard.data || leaderboard.data.length < 2) return;

  const entries = leaderboard.data;
  const overtakerIndex = entries.findIndex((e) => e.user.id === overtakerId);
  if (overtakerIndex === -1) return;

  // The participant right behind the overtaker (who may have been overtaken)
  const overtakenParticipant = entries[overtakerIndex + 1];
  if (!overtakenParticipant || overtakenParticipant.user.id === overtakerId) return;

  const overtakenUserId = overtakenParticipant.user.id;

  // Throttling: Maximum once per 24 hours per user per challenge
  const todayStr = new Date().toISOString().slice(0, 10);
  const overtakeKey = `challenge_overtake:${challengeId}:${overtakenUserId}:${todayStr}`;
  const alreadySent = await hasNotification(overtakenUserId, overtakeKey);
  if (alreadySent) return;

  // Fetch overtaker display name
  const { data: overtakerProfile } = await supabase
    .from(TABLE_PROFILES)
    .select('first_name, last_name, username')
    .eq('id', overtakerId)
    .single();

  const overtakerName =
    [overtakerProfile?.first_name, overtakerProfile?.last_name].filter(Boolean).join(' ') ||
    overtakerProfile?.username ||
    'A fellow club member';

  const payload = notificationTemplates.leaderboardOvertake(challengeId, challengeTitle, overtakerName);
  await dispatchNotification({
    userId: overtakenUserId,
    type: payload.category,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    idempotencyKey: overtakeKey,
  });
}

/**
 * Evaluates Challenge Ending Soon (24 hours remaining)
 */
export async function processChallengeEndingSoonJob(now: Date = new Date()): Promise<{ challengesChecked: number; sent: number }> {
  // Find challenges ending within approximately 24 hours (between 23h and 25h from now)
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  const { data: challenges, error } = await supabase
    .from(TABLE_CHALLENGES)
    .select('*')
    .gte('end_at', windowStart)
    .lte('end_at', windowEnd);

  if (error || !challenges || challenges.length === 0) {
    return { challengesChecked: 0, sent: 0 };
  }

  let sent = 0;
  for (const ch of challenges) {
    const goalType = ch.goal_type || 'steps_goal';

    if (goalType === 'most_steps') {
      // Top 10 participants only
      const leaderboard = await getLeaderboard(ch.id, 0, 10);
      for (const entry of leaderboard.data) {
        if (entry.rank <= 10) {
          const idempotencyKey = `challenge_ending_24h:${ch.id}:${entry.user.id}`;
          const already = await hasNotification(entry.user.id, idempotencyKey);
          if (already) continue;

          const payload = notificationTemplates.challengeEndingSoonMostSteps(ch.id, ch.title, entry.rank);
          await dispatchNotification({
            userId: entry.user.id,
            type: payload.category,
            title: payload.title,
            body: payload.body,
            data: payload.data,
            idempotencyKey,
          });
          sent++;
        }
      }
    } else {
      // steps_goal or daily_step: Only send to participants who achieved >= 90% completion
      const { data: participants } = await supabase
        .from(TABLE_PARTICIPANTS)
        .select('user_id')
        .eq('challenge_id', ch.id)
        .is('left_at', null);

      if (!participants) continue;

      const startDate = new Date(ch.start_at).toISOString().split('T')[0];
      const endDate = new Date(ch.end_at).toISOString().split('T')[0];
      const goalValue = ch.goal_value || 1;

      for (const p of participants) {
        const idempotencyKey = `challenge_ending_24h:${ch.id}:${p.user_id}`;
        const already = await hasNotification(p.user_id, idempotencyKey);
        if (already) continue;

        const { data: stepRows } = await supabase
          .from(TABLE_DAILY_STEPS)
          .select('steps')
          .eq('user_id', p.user_id)
          .gte('date', startDate)
          .lte('date', endDate);

        const rows = stepRows || [];

        if (goalType === 'steps_goal') {
          const totalSteps = rows.reduce((sum, r) => sum + (r.steps || 0), 0);
          const percent = (totalSteps / goalValue) * 100;
          if (percent >= 90 && percent < 100) {
            const remainingSteps = Math.max(0, goalValue - totalSteps);
            const payload = notificationTemplates.challengeEndingSoonStepsGoal(ch.id, ch.title, remainingSteps);
            await dispatchNotification({
              userId: p.user_id,
              type: payload.category,
              title: payload.title,
              body: payload.body,
              data: payload.data,
              idempotencyKey,
            });
            sent++;
          }
        } else if (goalType === 'daily_step') {
          const daysCompleted = rows.filter((r) => r.steps >= goalValue).length;
          const totalDays = Math.max(
            1,
            Math.round(
              (new Date(ch.end_at).getTime() - new Date(ch.start_at).getTime()) / (1000 * 60 * 60 * 24)
            )
          );
          const percent = (daysCompleted / totalDays) * 100;
          if (percent >= 90 && percent < 100) {
            const remainingDays = Math.max(1, totalDays - daysCompleted);
            const payload = notificationTemplates.challengeEndingSoonDailyStep(ch.id, ch.title, remainingDays);
            await dispatchNotification({
              userId: p.user_id,
              type: payload.category,
              title: payload.title,
              body: payload.body,
              data: payload.data,
              idempotencyKey,
            });
            sent++;
          }
        }
      }
    }
  }

  return { challengesChecked: challenges.length, sent };
}

/**
 * Challenge Completion & Rewards Disbursement
 * Disburses SabiCoins, awards badges, and sends push notifications
 */
export async function disburseChallengeRewards(challengeId: string): Promise<{
  challengeId: string;
  disbursedCount: number;
}> {
  const challenge = await fetchChallengeRow(challengeId);
  if (!challenge) throw new Error('Challenge not found');

  const now = new Date();
  if (now < new Date(challenge.end_at)) {
    console.log(`[notificationEvent] Challenge ${challengeId} has not ended yet.`);
    return { challengeId, disbursedCount: 0 };
  }

  const goalType = challenge.goal_type || 'steps_goal';
  const challengeImage = resolveChallengeNotificationImage(challenge);
  let disbursedCount = 0;

  if (goalType === 'most_steps') {
    // Competitive / Leaderboard challenge
    const leaderboard = await getLeaderboard(challengeId, 0, 50);
    const rewardAmounts: Record<number, number> = { 1: 1000, 2: 500, 3: 300, 4: 200, 5: 100 };

    for (const entry of leaderboard.data) {
      const idempotencyKey = `challenge_reward:${challengeId}:${entry.user.id}`;
      const already = await hasNotification(entry.user.id, idempotencyKey);
      if (already) continue;

      if (entry.rank === 1) {
        const coins = rewardAmounts[1];
        // 1. Credit wallet
        await creditUserPoints(entry.user.id, coins);
        // 2. Mark claimed
        await markParticipantClaimed(challengeId, entry.user.id);
        // 3. Dispatch Champion notification
        const payload = notificationTemplates.challengeCompletionChampion(challengeId, challenge.title, coins, challengeImage);
        await dispatchNotification({
          userId: entry.user.id,
          type: payload.category,
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
          data: payload.data,
          idempotencyKey,
        });
        disbursedCount++;
      } else if (entry.rank >= 2 && entry.rank <= 5) {
        const coins = rewardAmounts[entry.rank] || 100;
        await creditUserPoints(entry.user.id, coins);
        await markParticipantClaimed(challengeId, entry.user.id);
        const payload = notificationTemplates.challengeCompletionTop5(
          challengeId,
          challenge.title,
          entry.rank,
          coins,
          challengeImage
        );
        await dispatchNotification({
          userId: entry.user.id,
          type: payload.category,
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
          data: payload.data,
          idempotencyKey,
        });
        disbursedCount++;
      } else {
        // Rank 6 and above: No coins
        const payload = notificationTemplates.challengeCompletionParticipant(challengeId, challenge.title, challengeImage);
        await dispatchNotification({
          userId: entry.user.id,
          type: payload.category,
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
          data: payload.data,
          idempotencyKey,
        });
        disbursedCount++;
      }
    }
  } else {
    // Goal-based: steps_goal or daily_step
    const { data: participants } = await supabase
      .from(TABLE_PARTICIPANTS)
      .select('user_id, claimed_at')
      .eq('challenge_id', challengeId)
      .is('left_at', null);

    if (!participants) return { challengeId, disbursedCount: 0 };

    const startDate = new Date(challenge.start_at).toISOString().split('T')[0];
    const endDate = new Date(challenge.end_at).toISOString().split('T')[0];
    const goalValue = challenge.goal_value || 1;
    const defaultCoins = 250;

    for (const p of participants) {
      const idempotencyKey = `challenge_reward:${challengeId}:${p.user_id}`;
      const already = await hasNotification(p.user_id, idempotencyKey);
      if (already) continue;

      const { data: stepRows } = await supabase
        .from(TABLE_DAILY_STEPS)
        .select('steps')
        .eq('user_id', p.user_id)
        .gte('date', startDate)
        .lte('date', endDate);

      const rows = stepRows || [];
      let is100Percent = false;

      if (goalType === 'steps_goal') {
        const totalSteps = rows.reduce((sum, r) => sum + (r.steps || 0), 0);
        is100Percent = totalSteps >= goalValue;
      } else if (goalType === 'daily_step') {
        const daysCompleted = rows.filter((r) => r.steps >= goalValue).length;
        const totalDays = Math.max(
          1,
          Math.round(
            (new Date(challenge.end_at).getTime() - new Date(challenge.start_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        );
        is100Percent = daysCompleted >= totalDays;
      }

      if (is100Percent) {
        // 1. Credit wallet
        await creditUserPoints(p.user_id, defaultCoins);
        // 2. Award badge
        await awardChallengeBadge(p.user_id, challengeId, challenge.reward_id || 'challenge_completed');
        // 3. Mark claimed
        await markParticipantClaimed(challengeId, p.user_id);
        // 4. Dispatch notification
        const payload = notificationTemplates.challengeCompletionGoalMet(
          challengeId,
          challenge.title,
          challengeImage
        );
        await dispatchNotification({
          userId: p.user_id,
          type: payload.category,
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
          data: payload.data,
          idempotencyKey,
        });
        disbursedCount++;
      }
    }
  }

  return { challengeId, disbursedCount };
}

/**
 * Atomically credit SabiCoins to user points_balance in profiles
 */
async function creditUserPoints(userId: string, coins: number): Promise<void> {
  const { data: profile } = await supabase
    .from(TABLE_PROFILES)
    .select('points_balance')
    .eq('id', userId)
    .single();

  const current = profile?.points_balance || 0;
  const nextBalance = current + coins;

  await supabase
    .from(TABLE_PROFILES)
    .update({ points_balance: nextBalance })
    .eq('id', userId);
}

/**
 * Marks participant reward claimed in challenge_participants
 */
async function markParticipantClaimed(challengeId: string, userId: string): Promise<void> {
  await supabase
    .from(TABLE_PARTICIPANTS)
    .update({ claimed_at: new Date().toISOString() })
    .eq('challenge_id', challengeId)
    .eq('user_id', userId);
}

/**
 * Awards completion badge in user_achievements
 */
async function awardChallengeBadge(userId: string, challengeId: string, badgeKey: string): Promise<void> {
  try {
    await supabase.from(TABLE_ACHIEVEMENTS).insert({
      user_id: userId,
      category: 'challenges',
      badge_key: badgeKey,
      metadata: { challengeId, awardedAt: new Date().toISOString() },
    });
  } catch (err) {
    // If table or unique constraint catches it, ignore duplicate
  }
}
