import { supabase } from '../config/database';
import * as streaksService from './streaksService';
import * as challengeService from './challengeService';
import {
  AchievementSummaryData,
  StepMilestoneItem,
  DailyStreakItem,
  MonthlyBadgeItem,
  InviteBadgeItem,
  ChallengeCompletedItem,
} from '../models/achievementModel';

const PROFILES_TABLE = 'profiles';
const DAILY_STEPS_TABLE = 'daily_steps';
const ACHIEVEMENTS_TABLE = 'user_achievements';

const STEP_MILESTONES = [
  { id: 'step_10k', title: '10k steps', threshold: 10000, displayValue: '10K' },
  { id: 'step_50k', title: '50k steps', threshold: 50000, displayValue: '50K' },
  { id: 'step_100k', title: '100k steps', threshold: 100000, displayValue: '100K' },
  { id: 'step_250k', title: '250k steps', threshold: 250000, displayValue: '250K' },
  { id: 'step_500k', title: '500k steps', threshold: 500000, displayValue: '500K' },
  { id: 'step_1m', title: '1M steps', threshold: 1000000, displayValue: '1M' },
];

const STREAK_MILESTONES = [
  { id: 'streak_40', title: '40 Days Streak', threshold: 40, displayValue: '40' },
  { id: 'streak_100', title: '100 Days Streak', threshold: 100, displayValue: '100' },
  { id: 'streak_365', title: '365 Days Streak', threshold: 365, displayValue: '365' },
  { id: 'streak_1000', title: '1000 Days Streak', threshold: 1000, displayValue: '1000' },
];

const MONTHLY_THRESHOLDS = [
  { threshold: 20000, label: '20k', tier: 'tier_1' as const },
  { threshold: 50000, label: '50k', tier: 'tier_1' as const },
  { threshold: 100000, label: '100k', tier: 'tier_1' as const },
  { threshold: 200000, label: '200k', tier: 'tier_1' as const },
  { threshold: 350000, label: '350k', tier: 'tier_1' as const },
  { threshold: 400000, label: '400k', tier: 'tier_2' as const },
  { threshold: 800000, label: '800k', tier: 'tier_2' as const },
];

const INVITE_MILESTONES = [
  { id: 'invite_1', title: 'Invite 1 person', threshold: 1, displayValue: '1' },
  { id: 'invite_10', title: 'Invite 10 people', threshold: 10, displayValue: '10', subValue: 'SabiSweat' },
  { id: 'invite_50', title: 'Invite 50 people', threshold: 50, displayValue: '50', subValue: 'SabiSweat' },
];

const MONTH_NAMES = [
  { long: 'January', short: 'Jan' },
  { long: 'February', short: 'Feb' },
  { long: 'March', short: 'Mar' },
  { long: 'April', short: 'Apr' },
  { long: 'May', short: 'May' },
  { long: 'June', short: 'Jun' },
  { long: 'July', short: 'Jul' },
  { long: 'August', short: 'Aug' },
  { long: 'September', short: 'Sep' },
  { long: 'October', short: 'Oct' },
  { long: 'November', short: 'Nov' },
  { long: 'December', short: 'Dec' },
];

function getMonthInfo(year: number, monthIndex: number) {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const monthPeriod = `${year}-${mm}`;
  const info = MONTH_NAMES[monthIndex];
  return {
    monthPeriod,
    longName: info.long,
    shortName: info.short,
    subtitle: `${info.short} ${year}`,
  };
}

function getMonthsRange(startMonthStr: string, activeMonthStr: string) {
  const [startYear, startMonth] = startMonthStr.split('-').map(Number);
  const [endYear, endMonth] = activeMonthStr.split('-').map(Number);

  const months: Array<{ monthPeriod: string; longName: string; shortName: string; subtitle: string }> = [];

  let curYear = startYear;
  let curMonthIndex = startMonth - 1;

  while (curYear < endYear || (curYear === endYear && curMonthIndex <= endMonth - 1)) {
    months.push(getMonthInfo(curYear, curMonthIndex));
    curMonthIndex++;
    if (curMonthIndex > 11) {
      curMonthIndex = 0;
      curYear++;
    }
  }

  return months;
}

export async function getAchievementsSummary(
  userId: string,
  timezone = 'Africa/Lagos'
): Promise<AchievementSummaryData> {
  const now = new Date();
  const nowIso = now.toISOString();

  // Active month in user's timezone
  let activeMonth: string;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    });
    activeMonth = formatter.format(now).slice(0, 7);
  } catch {
    activeMonth = nowIso.slice(0, 7);
  }

  // 1. Fetch user profile
  const { data: profile } = await supabase
    .from(PROFILES_TABLE)
    .select('id, created_at, finished_onboarded_at, steps_count, referral_code')
    .eq('id', userId)
    .single();

  const joinedMonth = (profile?.finished_onboarded_at || profile?.created_at || nowIso).slice(0, 7);
  const startMonth = joinedMonth <= activeMonth ? joinedMonth : activeMonth;

  // 2. Fetch daily steps for lifetime count & monthly breakdown
  const { data: stepRows } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('date, steps')
    .eq('user_id', userId);

  const stepsList = stepRows ?? [];
  const calculatedLifetimeSteps = stepsList.reduce((sum, r) => sum + (r.steps || 0), 0);
  const lifetimeSteps = Math.max(calculatedLifetimeSteps, profile?.steps_count || 0);

  // Group steps by month
  const monthlyStepsMap = new Map<string, number>();
  for (const row of stepsList) {
    if (!row.date) continue;
    const m = row.date.slice(0, 7);
    monthlyStepsMap.set(m, (monthlyStepsMap.get(m) || 0) + (row.steps || 0));
  }

  // 3. Fetch streak data from existing streak engine
  let currentStreak = 0;
  let longestStreak = 0;
  try {
    const streakResult = await streaksService.getCurrentStreak(userId);
    currentStreak = streakResult.streakDays ?? 0;
    longestStreak = streakResult.longestStreakDays ?? 0;
  } catch (err) {
    console.warn('[achievementService] Failed to fetch current streak:', err);
  }
  const maxStreak = Math.max(currentStreak, longestStreak);

  // 4. Fetch referrals count
  let successfulReferralCount = 0;
  if (profile?.referral_code) {
    try {
      const { count } = await supabase
        .from(PROFILES_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'completed')
        .neq('id', userId)
        .or(`referred_by_code.eq.${profile.referral_code},referral_code.eq.${profile.referral_code}`);

      successfulReferralCount = count ?? 0;
    } catch {
      successfulReferralCount = 0;
    }
  }

  // 5. Fetch completed challenges from challenge service
  let completedChallenges: Array<{
    id: string;
    challengeId: string;
    title: string;
    subtitle: string;
    rewardId: string;
    earned: boolean;
    earnedAt: string | null;
  }> = [];

  try {
    const rawCompleted = await challengeService.getCompletedChallenges(userId);
    completedChallenges = rawCompleted.map((c) => ({
      id: `challenge_${c.id}`,
      challengeId: c.id,
      title: c.title,
      subtitle: c.subtitle,
      rewardId: c.rewardId,
      earned: true,
      earnedAt: c.completedAt,
    }));
  } catch (err) {
    console.warn('[achievementService] Failed to fetch completed challenges:', err);
  }

  // 6. Fetch existing persisted achievements
  const earnedMap = new Map<string, { earned_at: string | null; progress_value?: number }>();
  try {
    const { data: achievements } = await supabase
      .from(ACHIEVEMENTS_TABLE)
      .select('*')
      .eq('user_id', userId);

    for (const a of achievements ?? []) {
      const key = `${a.category}:${a.badge_key}:${a.month_period || ''}`;
      earnedMap.set(key, { earned_at: a.earned_at, progress_value: a.progress_value });
    }
  } catch (err) {
    // If table doesn't exist yet, we still compute dynamically
    console.warn('[achievementService] user_achievements table query warning:', err);
  }

  const newBadgesToPersist: Array<{
    user_id: string;
    category: string;
    badge_key: string;
    earned_at: string;
    progress_value: number;
    target_value: number;
    month_period: string | null;
    metadata: Record<string, any>;
  }> = [];

  // ── Step Milestones ──────────────────────────────────────────────
  const stepItems: StepMilestoneItem[] = STEP_MILESTONES.map((m) => {
    const key = `step_milestone:${m.id}:`;
    const existing = earnedMap.get(key);
    const earned = Boolean(existing || lifetimeSteps >= m.threshold);
    const earnedAt = existing ? existing.earned_at : earned ? nowIso : null;

    if (earned && !existing) {
      newBadgesToPersist.push({
        user_id: userId,
        category: 'step_milestone',
        badge_key: m.id,
        earned_at: nowIso,
        progress_value: lifetimeSteps,
        target_value: m.threshold,
        month_period: null,
        metadata: { title: m.title, displayValue: m.displayValue },
      });
    }

    return {
      id: m.id,
      title: m.title,
      threshold: m.threshold,
      displayValue: m.displayValue,
      earned,
      earnedAt,
    };
  });

  // ── Daily Streaks ────────────────────────────────────────────────
  const streakItems: DailyStreakItem[] = STREAK_MILESTONES.map((s) => {
    const key = `daily_streak:${s.id}:`;
    const existing = earnedMap.get(key);
    const earned = Boolean(existing || maxStreak >= s.threshold);
    const earnedAt = existing ? existing.earned_at : earned ? nowIso : null;

    if (earned && !existing) {
      newBadgesToPersist.push({
        user_id: userId,
        category: 'daily_streak',
        badge_key: s.id,
        earned_at: nowIso,
        progress_value: maxStreak,
        target_value: s.threshold,
        month_period: null,
        metadata: { title: s.title, displayValue: s.displayValue },
      });
    }

    return {
      id: s.id,
      title: s.title,
      threshold: s.threshold,
      displayValue: s.displayValue,
      earned,
      earnedAt,
    };
  });

  // ── Monthly Badges ───────────────────────────────────────────────
  const monthsInRange = getMonthsRange(startMonth, activeMonth);
  const monthlyItems: MonthlyBadgeItem[] = [];

  for (const month of monthsInRange) {
    const stepsInMonth = monthlyStepsMap.get(month.monthPeriod) || 0;

    for (const t of MONTHLY_THRESHOLDS) {
      const badgeId = `monthly_${month.monthPeriod.replace('-', '_')}_${t.label}`;
      const key = `monthly_badge:${badgeId}:${month.monthPeriod}`;
      const existing = earnedMap.get(key);
      const earned = Boolean(existing || stepsInMonth >= t.threshold);
      const earnedAt = existing ? existing.earned_at : earned ? nowIso : null;

      if (earned && !existing) {
        newBadgesToPersist.push({
          user_id: userId,
          category: 'monthly_badge',
          badge_key: badgeId,
          earned_at: nowIso,
          progress_value: stepsInMonth,
          target_value: t.threshold,
          month_period: month.monthPeriod,
          metadata: {
            title: `${month.longName} ${t.label} steps`,
            subtitle: month.subtitle,
            tier: t.tier,
          },
        });
      }

      monthlyItems.push({
        id: badgeId,
        title: `${month.longName} ${t.label} steps`,
        subtitle: month.subtitle,
        month: month.monthPeriod,
        threshold: t.threshold,
        tier: t.tier,
        earned,
        earnedAt,
      });
    }
  }

  // ── Invite Badges ────────────────────────────────────────────────
  const inviteItems: InviteBadgeItem[] = INVITE_MILESTONES.map((inv) => {
    const key = `invite_badge:${inv.id}:`;
    const existing = earnedMap.get(key);
    const earned = Boolean(existing || successfulReferralCount >= inv.threshold);
    const earnedAt = existing ? existing.earned_at : earned ? nowIso : null;

    if (earned && !existing) {
      newBadgesToPersist.push({
        user_id: userId,
        category: 'invite_badge',
        badge_key: inv.id,
        earned_at: nowIso,
        progress_value: successfulReferralCount,
        target_value: inv.threshold,
        month_period: null,
        metadata: { title: inv.title, displayValue: inv.displayValue, subValue: inv.subValue },
      });
    }

    const item: InviteBadgeItem = {
      id: inv.id,
      title: inv.title,
      threshold: inv.threshold,
      displayValue: inv.displayValue,
      earned,
      earnedAt,
    };
    if (inv.subValue) item.subValue = inv.subValue;
    return item;
  });

  // ── Challenges Completed ─────────────────────────────────────────
  for (const c of completedChallenges) {
    const key = `challenge_completed:${c.id}:`;
    const existing = earnedMap.get(key);
    if (!existing) {
      newBadgesToPersist.push({
        user_id: userId,
        category: 'challenge_completed',
        badge_key: c.id,
        earned_at: c.earnedAt || nowIso,
        progress_value: 100,
        target_value: 100,
        month_period: null,
        metadata: {
          challengeId: c.challengeId,
          title: c.title,
          subtitle: c.subtitle,
          rewardId: c.rewardId,
        },
      });
    }
  }

  // Persist newly earned badges in the background
  if (newBadgesToPersist.length > 0) {
    (async () => {
      try {
        await supabase
          .from(ACHIEVEMENTS_TABLE)
          .upsert(newBadgesToPersist, {
            onConflict: 'user_id,category,badge_key,month_period',
          });
      } catch (err) {
        console.warn('[achievementService] Async persistence error:', err);
      }
    })();
  }

  return {
    stepMilestones: {
      currentProgress: lifetimeSteps,
      items: stepItems,
    },
    dailyStreaks: {
      currentStreak,
      longestStreak,
      items: streakItems,
    },
    monthlyBadges: {
      activeMonth,
      currentProgress: monthlyStepsMap.get(activeMonth) || 0,
      items: monthlyItems,
    },
    inviteBadges: {
      successfulReferralCount,
      items: inviteItems,
    },
    challengesCompleted: {
      totalCompleted: completedChallenges.length,
      items: completedChallenges,
    },
  };
}
