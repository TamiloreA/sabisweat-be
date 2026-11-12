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
  { threshold: 200000, label: '200k', tier: 'tier_1' as const },
  { threshold: 250000, label: '250k', tier: 'tier_1' as const },
  { threshold: 300000, label: '300k', tier: 'tier_1' as const },
  { threshold: 350000, label: '350k', tier: 'tier_1' as const },
  { threshold: 400000, label: '400k', tier: 'tier_1' as const },
  { threshold: 450000, label: '450k', tier: 'tier_1' as const },
  { threshold: 500000, label: '500k', tier: 'tier_1' as const },
  { threshold: 600000, label: '600k', tier: 'tier_2' as const },
  { threshold: 700000, label: '700k', tier: 'tier_2' as const },
  { threshold: 800000, label: '800k', tier: 'tier_2' as const },
  { threshold: 900000, label: '900k', tier: 'tier_2' as const },
  { threshold: 1000000, label: '1m', tier: 'tier_2' as const },
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

export function getEndOfMonthTimestamp(monthPeriod: string): string {
  const [yearStr, monthStr] = monthPeriod.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthPeriod}-${String(lastDay).padStart(2, '0')}T23:59:59.000Z`;
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

  // 2. Fetch daily steps for lifetime count & monthly breakdown in chronological order
  const { data: stepRows } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('date, steps, synced_at')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  const stepsList = (stepRows ?? []).filter((r: any) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  const calculatedLifetimeSteps = stepsList.reduce((sum, r) => sum + (r.steps || 0), 0);
  const lifetimeSteps = Math.max(calculatedLifetimeSteps, profile?.steps_count || 0);

  // Group steps by month
  const monthlyStepsMap = new Map<string, number>();
  const stepsByMonth = new Map<string, Array<{ date: string; steps: number; synced_at?: string }>>();

  for (const row of stepsList) {
    const m = row.date.slice(0, 7);
    const steps = row.steps || 0;
    monthlyStepsMap.set(m, (monthlyStepsMap.get(m) || 0) + steps);

    if (!stepsByMonth.has(m)) {
      stepsByMonth.set(m, []);
    }
    stepsByMonth.get(m)!.push(row);
  }

  // Precompute crossing dates for lifetime step milestones
  const stepMilestoneCrossings = new Map<string, string>();
  let runningLifetime = 0;
  for (const r of stepsList) {
    runningLifetime += (r.steps || 0);
    for (const m of STEP_MILESTONES) {
      if (runningLifetime >= m.threshold && !stepMilestoneCrossings.has(m.id)) {
        const timestamp = (r.synced_at && r.synced_at.slice(0, 10) === r.date)
          ? r.synced_at
          : `${r.date}T23:59:59.000Z`;
        stepMilestoneCrossings.set(m.id, timestamp);
      }
    }
  }

  // 3. Fetch streak data from existing streak engine & calculate streak milestone crossings
  let currentStreak = 0;
  let longestStreak = 0;
  const streakCrossings = new Map<string, string>();

  try {
    const streakResult = await streaksService.getCurrentStreak(userId);
    currentStreak = streakResult.streakDays ?? 0;
    longestStreak = streakResult.longestStreakDays ?? 0;

    if (streakResult?.data && Array.isArray(streakResult.data)) {
      const restoredSet = new Set(streakResult.restoredDates ?? []);
      let runningStreak = 0;
      const today = streakResult.asOfDate || nowIso.slice(0, 10);

      for (const day of streakResult.data) {
        const isRestored = restoredSet.has(day.day);
        const isHit = day.status === 'hit';
        const isPendingToday = day.day === today && !isHit && !isRestored;

        if (isPendingToday) continue;
        if (isHit) {
          runningStreak += 1;
          for (const s of STREAK_MILESTONES) {
            if (runningStreak >= s.threshold && !streakCrossings.has(s.id)) {
              streakCrossings.set(s.id, `${day.day}T23:59:59.000Z`);
            }
          }
        } else if (isRestored) {
          // preserved
        } else {
          runningStreak = 0;
        }
      }
    }
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
  interface ExistingAchievement {
    id: string;
    earned_at: string | null;
    progress_value: number;
  }
  const earnedMap = new Map<string, ExistingAchievement>();

  let rawAchievements: any[] = [];
  try {
    const { data: achievements } = await supabase
      .from(ACHIEVEMENTS_TABLE)
      .select('id, category, badge_key, month_period, earned_at, progress_value, target_value, metadata')
      .eq('user_id', userId);

    rawAchievements = achievements ?? [];
    for (const a of rawAchievements) {
      const key = `${a.category}:${a.badge_key}:${a.month_period || ''}`;
      earnedMap.set(key, {
        id: a.id,
        earned_at: a.earned_at,
        progress_value: a.progress_value,
      });
    }
  } catch (err) {
    console.warn('[achievementService] user_achievements table query warning:', err);
  }

  const badgesToInsert: Array<{
    user_id: string;
    category: string;
    badge_key: string;
    earned_at: string;
    progress_value: number;
    target_value: number;
    month_period: string | null;
    metadata: Record<string, any>;
  }> = [];

  const badgesToUpdate: Array<{
    id: string;
    earned_at: string;
    progress_value: number;
  }> = [];

  // ── Step Milestones ──────────────────────────────────────────────
  const stepItems: StepMilestoneItem[] = STEP_MILESTONES.map((m) => {
    const key = `step_milestone:${m.id}:`;
    const existing = earnedMap.get(key);
    const earned = Boolean(existing || lifetimeSteps >= m.threshold);

    let earnedAt: string | null = null;
    if (earned) {
      const crossedAt = stepMilestoneCrossings.get(m.id);
      if (crossedAt) {
        earnedAt = crossedAt;
      } else if (existing?.earned_at) {
        earnedAt = existing.earned_at;
      } else {
        earnedAt = profile?.finished_onboarded_at || profile?.created_at || nowIso;
      }

      if (!existing && earnedAt) {
        badgesToInsert.push({
          user_id: userId,
          category: 'step_milestone',
          badge_key: m.id,
          earned_at: earnedAt,
          progress_value: lifetimeSteps,
          target_value: m.threshold,
          month_period: null,
          metadata: { title: m.title, displayValue: m.displayValue },
        });
      } else if (existing?.id && earnedAt && existing.earned_at !== earnedAt) {
        badgesToUpdate.push({
          id: existing.id,
          earned_at: earnedAt,
          progress_value: lifetimeSteps,
        });
      }
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

    let earnedAt: string | null = null;
    if (earned) {
      const crossedAt = streakCrossings.get(s.id);
      if (crossedAt) {
        earnedAt = crossedAt;
      } else if (existing?.earned_at) {
        earnedAt = existing.earned_at;
      } else {
        earnedAt = nowIso;
      }

      if (!existing && earnedAt) {
        badgesToInsert.push({
          user_id: userId,
          category: 'daily_streak',
          badge_key: s.id,
          earned_at: earnedAt,
          progress_value: maxStreak,
          target_value: s.threshold,
          month_period: null,
          metadata: { title: s.title, displayValue: s.displayValue },
        });
      } else if (existing?.id && earnedAt && existing.earned_at !== earnedAt) {
        badgesToUpdate.push({
          id: existing.id,
          earned_at: earnedAt,
          progress_value: maxStreak,
        });
      }
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
    const monthRows = stepsByMonth.get(month.monthPeriod) || [];

    // Precompute milestone crossing dates in date order for this month
    const monthlyCrossings = new Map<number, string>();
    let runningMonthSteps = 0;
    for (const r of monthRows) {
      runningMonthSteps += (r.steps || 0);
      for (const t of MONTHLY_THRESHOLDS) {
        if (runningMonthSteps >= t.threshold && !monthlyCrossings.has(t.threshold)) {
          const timestamp = (r.synced_at && r.synced_at.slice(0, 10) === r.date)
            ? r.synced_at
            : `${r.date}T23:59:59.000Z`;
          monthlyCrossings.set(t.threshold, timestamp);
        }
      }
    }

    for (const t of MONTHLY_THRESHOLDS) {
      const badgeId = `monthly_${month.monthPeriod.replace('-', '_')}_${t.label}`;
      const key = `monthly_badge:${badgeId}:${month.monthPeriod}`;
      const existing = earnedMap.get(key);
      const earned = Boolean(existing || stepsInMonth >= t.threshold);

      let earnedAt: string | null = null;
      if (earned) {
        const crossedAt = monthlyCrossings.get(t.threshold);
        if (crossedAt) {
          // 1. Exact day threshold crossed within this month
          earnedAt = crossedAt;
        } else if (existing?.earned_at && existing.earned_at.startsWith(month.monthPeriod)) {
          // 2. Existing saved timestamp validly belongs to this month
          earnedAt = existing.earned_at;
        } else {
          // 3. Fallback for historical badges without exact day logs: end of that specific month
          earnedAt = getEndOfMonthTimestamp(month.monthPeriod);
        }

        if (!existing) {
          badgesToInsert.push({
            user_id: userId,
            category: 'monthly_badge',
            badge_key: badgeId,
            earned_at: earnedAt,
            progress_value: stepsInMonth,
            target_value: t.threshold,
            month_period: month.monthPeriod,
            metadata: {
              title: `${month.longName} ${t.label} steps`,
              subtitle: month.subtitle,
              tier: t.tier,
            },
          });
        } else if (existing.id && existing.earned_at !== earnedAt) {
          badgesToUpdate.push({
            id: existing.id,
            earned_at: earnedAt,
            progress_value: stepsInMonth,
          });
        }
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

  // Preserve previously earned historical monthly badges that were awarded under legacy thresholds
  const emittedBadgeIds = new Set(monthlyItems.map((item) => item.id));
  for (const a of rawAchievements) {
    if (a.category === 'monthly_badge' && a.earned_at && !emittedBadgeIds.has(a.badge_key)) {
      const meta = (a.metadata && typeof a.metadata === 'object') ? a.metadata : {};
      monthlyItems.push({
        id: a.badge_key,
        title: meta.title || `Monthly ${a.badge_key}`,
        subtitle: meta.subtitle || 'Monthly Milestone',
        month: a.month_period || a.earned_at.slice(0, 7),
        threshold: a.target_value || 0,
        tier: meta.tier || 'tier_1',
        earned: true,
        earnedAt: a.earned_at,
      });
    }
  }

  // ── Invite Badges ────────────────────────────────────────────────
  const inviteItems: InviteBadgeItem[] = INVITE_MILESTONES.map((inv) => {
    const key = `invite_badge:${inv.id}:`;
    const existing = earnedMap.get(key);
    const earned = Boolean(existing || successfulReferralCount >= inv.threshold);
    const earnedAt = existing ? existing.earned_at : earned ? (profile?.created_at || nowIso) : null;

    if (earned && !existing && earnedAt) {
      badgesToInsert.push({
        user_id: userId,
        category: 'invite_badge',
        badge_key: inv.id,
        earned_at: earnedAt,
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
    const earnedAt = existing?.earned_at || c.earnedAt || nowIso;

    if (!existing) {
      badgesToInsert.push({
        user_id: userId,
        category: 'challenge_completed',
        badge_key: c.id,
        earned_at: earnedAt,
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
    } else if (existing.id && existing.earned_at !== earnedAt) {
      badgesToUpdate.push({
        id: existing.id,
        earned_at: earnedAt,
        progress_value: 100,
      });
    }
  }

  // Persist newly earned badges and update any historical badges with corrected timestamps
  if (badgesToInsert.length > 0 || badgesToUpdate.length > 0) {
    (async () => {
      try {
        if (badgesToInsert.length > 0) {
          const { error: insertErr } = await supabase
            .from(ACHIEVEMENTS_TABLE)
            .insert(badgesToInsert);
          if (insertErr) {
            console.warn('[achievementService] Badge insert warning:', insertErr.message || insertErr);
          }
        }

        if (badgesToUpdate.length > 0) {
          await Promise.allSettled(
            badgesToUpdate.map((b) =>
              supabase
                .from(ACHIEVEMENTS_TABLE)
                .update({
                  earned_at: b.earned_at,
                  progress_value: b.progress_value,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', b.id)
            )
          );
        }
      } catch (err) {
        console.warn('[achievementService] Badge persistence error:', err);
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
