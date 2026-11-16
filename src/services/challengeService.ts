/**
 * Challenge Service
 *
 * Business logic for challenges: CRUD, join/leave, leaderboard, progress computation.
 */

import { randomUUID } from 'crypto';
import { supabase } from '../config/database';
import type {
  ChallengeRow,
  ChallengeResponse,
  ChallengeProgress,
  ChallengeGoalType,
  ChallengeHost,
  LeaderboardEntry,
  LeaderboardResponse,
  CreateChallengeInput,
  PaginatedChallengesResponse,
  WinnerInfo,
  QualifiedParticipant,
  QualifiedParticipantsResponse,
} from '../models/challengeModel';
import type { CompletedChallengeDetail } from '../models/achievementModel';
import { handleChallengeCreatedEvent } from './notificationEventService';
import { getGeoPriority } from '../utils/geoHierarchy';
import { recordPointsTransaction } from './pointsService';

const CHALLENGES_TABLE = 'challenges';
const PARTICIPANTS_TABLE = 'challenge_participants';
const DAILY_STEPS_TABLE = 'daily_steps';
const PROFILES_TABLE = 'profiles';
const CLUBS_TABLE = 'clubs';
const CLUB_MEMBERS_TABLE = 'club_members';
const IMAGES_BUCKET = 'community-images';

const DATA_URL_PREFIX = /^data:(image\/[\w+.-]+);base64,/;

function parseBase64Image(input: string): { buffer: Buffer; contentType: string; extension: string } | null {
  if (!input || typeof input !== 'string') return null;

  const match = input.match(DATA_URL_PREFIX);
  const base64Data = match ? input.replace(DATA_URL_PREFIX, '') : input;
  const contentType = match ? match[1] : 'image/jpeg';
  const extension = contentType.split('/')[1]?.replace('+xml', '') || 'jpg';

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) return null;
    return { buffer, contentType, extension };
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  photo_base64: string | null;
  avatar_id: string | null;
}

async function fetchProfilesMap(ids: string[]): Promise<Map<string, ProfileRow>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('id, username, first_name, last_name, photo_url, photo_base64, avatar_id')
    .in('id', uniqueIds);

  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p as ProfileRow]));
}

interface ClubHostInfo {
  id: string;
  name: string;
  profile_image_url: string | null;
  theme: string | null;
}

async function fetchClubsMap(ids: (string | null | undefined)[]): Promise<Map<string, ClubHostInfo>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from(CLUBS_TABLE)
    .select('id, name, profile_image_url, theme')
    .in('id', uniqueIds);

  if (error) return new Map();
  return new Map((data ?? []).map((c) => [c.id, c as ClubHostInfo]));
}

function mapProfileToUser(profile: ProfileRow | undefined, fallbackId: string) {
  if (!profile) return { id: fallbackId };
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || undefined;
  return {
    id: profile.id,
    username: profile.username ?? undefined,
    displayName,
    photoUrl: profile.photo_url || profile.photo_base64 || undefined,
    avatarId: profile.avatar_id ?? undefined,
  };
}

function daysBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function resolveChallengeTimezone(challenge: any): string {
  if (challenge?.timezone || challenge?.time_zone) {
    return challenge.timezone || challenge.time_zone;
  }
  if (challenge?.country === 'United Kingdom' || challenge?.region === 'Greater London') {
    return 'Europe/London';
  }
  if (challenge?.country === 'United States' || challenge?.country === 'USA') {
    return 'America/New_York';
  }
  return 'Africa/Lagos';
}

function formatDateInTimezone(dateInput: string | Date, timezone: string): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Date(dateInput).toISOString().split('T')[0];
  }
}

function formatStepsAsScore(steps: number): string {
  return String(steps);
}

/**
 * Get participants count for a challenge (active only: left_at IS NULL).
 */
async function getParticipantsCount(challengeId: string): Promise<number> {
  const { count, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Normalize raw goal_type into one of the three supported challenge types:
 * 'daily_step' | 'steps_goal' | 'most_steps'.
 * Falls back using title/subtitle cues for legacy rows.
 */
export function normalizeGoalType(
  rawGoalType?: string | null,
  title?: string | null,
  subtitle?: string | null
): ChallengeGoalType {
  const normalized = (rawGoalType || '').trim().toLowerCase();
  if (normalized === 'daily_step' || normalized === 'daily_steps' || normalized === 'daily') {
    return 'daily_step';
  }
  if (normalized === 'steps_goal' || normalized === 'step_goal' || normalized === 'cumulative') {
    return 'steps_goal';
  }
  if (normalized === 'most_steps' || normalized === 'highest_steps' || normalized === 'race') {
    return 'most_steps';
  }

  // Fallback for legacy 'steps' or unspecified: infer from title/subtitle
  const combined = `${title || ''} ${subtitle || ''}`.toLowerCase();
  if (combined.includes('streak') || combined.includes('every day') || combined.includes('daily') || combined.includes('blitz')) {
    return 'daily_step';
  }
  if (combined.includes('most steps') || combined.includes('leaderboard race')) {
    return 'most_steps';
  }

  return 'steps_goal';
}

/**
 * Helper to fetch the leader's step count and total active participants for 'most_steps' challenges.
 */
async function getMostStepsLeaderStats(
  challengeId: string,
  startAt: string,
  endAt: string
): Promise<{ leaderSteps: number; totalParticipants: number }> {
  const startDate = new Date(startAt).toISOString().split('T')[0];
  const endDate = new Date(endAt).toISOString().split('T')[0];

  const { data: participants, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('user_id, joined_at')
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (pError || !participants || participants.length === 0) {
    return { leaderSteps: 0, totalParticipants: 0 };
  }

  const participantIds = participants.map((p) => p.user_id);
  const partMap = new Map(participants.map((p) => [p.user_id, p.joined_at]));

  const { data: stepsData, error: sError } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('user_id, steps, date')
    .in('user_id', participantIds)
    .gte('date', startDate)
    .lte('date', endDate);

  if (sError || !stepsData) {
    return { leaderSteps: 0, totalParticipants: participants.length };
  }

  const stepsMap = new Map<string, number>();
  for (const row of stepsData) {
    const pJoinedAt = partMap.get(row.user_id);
    const challengeStartStr = new Date(startAt).toISOString().split('T')[0];
    const effectiveStart = pJoinedAt
      ? new Date(Math.max(new Date(startAt).getTime(), new Date(pJoinedAt).getTime())).toISOString().split('T')[0]
      : challengeStartStr;

    if (row.date >= effectiveStart) {
      stepsMap.set(row.user_id, (stepsMap.get(row.user_id) || 0) + (row.steps || 0));
    }
  }

  let maxSteps = 0;
  for (const uid of participantIds) {
    const total = stepsMap.get(uid) || 0;
    if (total > maxSteps) {
      maxSteps = total;
    }
  }

  return { leaderSteps: maxSteps, totalParticipants: participants.length };
}

export interface ComputeProgressResult extends ChallengeProgress {
  effectiveGoalType: ChallengeGoalType;
  effectiveGoalValue: number;
}

/**
 * Compute a user's progress in a challenge from daily_steps according to goalType rules.
 */
export async function computeProgress(
  userId: string,
  challengeRow: ChallengeRow,
  joinedAtStr?: string
): Promise<ComputeProgressResult> {
  const challengeTimezone = resolveChallengeTimezone(challengeRow);
  const challengeStartDateStr = formatDateInTimezone(challengeRow.start_at, challengeTimezone);
  const challengeEndDateStr = formatDateInTimezone(challengeRow.end_at, challengeTimezone);
  const joinedDateStr = joinedAtStr ? formatDateInTimezone(joinedAtStr, challengeTimezone) : challengeStartDateStr;
  const startDate = joinedDateStr > challengeStartDateStr ? joinedDateStr : challengeStartDateStr;
  const endDate = challengeEndDateStr;
  const today = formatDateInTimezone(new Date(), challengeTimezone);

  // Fetch daily steps for the user within the challenge date range
  const { data: stepsData, error } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('date, steps, distance_km')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) throw error;

  const rows = stepsData ?? [];
  const totalSteps = rows.reduce((sum, r) => sum + (r.steps || 0), 0);
  const totalDistanceKm = rows.reduce((sum, r) => sum + (parseFloat(r.distance_km) || 0), 0);
  const totalDistanceMeters = Math.round(totalDistanceKm * 1000);

  const todayRow = rows.find((r) => r.date === today);
  const todaySteps = todayRow ? todayRow.steps : 0;

  const goalType = normalizeGoalType(challengeRow.goal_type, challengeRow.title, challengeRow.subtitle);
  const challengeTotalDays = daysBetween(challengeRow.start_at, challengeRow.end_at);
  const effectiveEnd = today < endDate ? today : endDate;
  const evaluatedDays = daysBetween(startDate, effectiveEnd);
  const daysRemaining = Math.max(0, daysBetween(today, endDate));
  const bonusDaysAdded = 0;

  let percent = 0;
  let effectiveGoalValue = challengeRow.goal_value || 0;
  let daysCompletedRaw = 0;

  if (goalType === 'daily_step') {
    // A. daily_step:
    // progress.todaySteps: Total steps taken today
    // goalValue: The daily step target (e.g. 10000)
    // progress.percent: Percentage of today's target completed: min(100, round((todaySteps / goalValue) * 100))
    // progress.steps: Total steps accumulated across the challenge so far
    // progress.daysCompleted: Number of days where user reached or exceeded goalValue
    effectiveGoalValue = challengeRow.goal_value || 10000;
    percent = effectiveGoalValue > 0
      ? Math.min(100, Math.round((todaySteps / effectiveGoalValue) * 100))
      : 0;
    daysCompletedRaw = rows.filter((r) => (r.steps || 0) >= effectiveGoalValue).length;
  } else if (goalType === 'steps_goal') {
    // B. steps_goal:
    // progress.steps: Total cumulative steps accumulated within challenge duration
    // goalValue: The total step goal for the challenge (e.g. 50000)
    // progress.percent: Percentage of total goal completed: min(100, round((progress.steps / goalValue) * 100))
    // progress.todaySteps: Steps taken today
    effectiveGoalValue = challengeRow.goal_value || 50000;
    percent = effectiveGoalValue > 0
      ? Math.min(100, Math.round((totalSteps / effectiveGoalValue) * 100))
      : 0;
    const avgDailyTarget = challengeTotalDays > 0 ? Math.round(effectiveGoalValue / challengeTotalDays) : effectiveGoalValue;
    daysCompletedRaw = rows.filter((r) => (r.steps || 0) >= avgDailyTarget).length;
  } else if (goalType === 'most_steps') {
    // C. most_steps (Leaderboard Pace):
    // progress.steps: Total cumulative steps accumulated within challenge duration
    // goalValue: Total steps of participant currently in 1st place
    const { leaderSteps, totalParticipants } = await getMostStepsLeaderStats(
      challengeRow.id,
      challengeRow.start_at,
      challengeRow.end_at
    );

    if (totalParticipants <= 1) {
      if (totalSteps > 0) {
        percent = 100;
        effectiveGoalValue = totalSteps;
      } else {
        percent = 0;
        effectiveGoalValue = 0;
      }
    } else {
      if (totalSteps >= leaderSteps && totalSteps > 0) {
        percent = 100;
        effectiveGoalValue = leaderSteps;
      } else if (leaderSteps > 0) {
        percent = Math.min(100, Math.round((totalSteps / leaderSteps) * 100));
        effectiveGoalValue = leaderSteps;
      } else {
        percent = 0;
        effectiveGoalValue = 0;
      }
    }
    daysCompletedRaw = rows.filter((r) => (r.steps || 0) > 0).length;
  }

  const daysCompleted = daysCompletedRaw + bonusDaysAdded;

  const progress: ChallengeProgress = {
    steps: totalSteps,
    distanceMeters: totalDistanceMeters,
    percent,
    todaySteps,
    daysCompleted,
    daysCompletedRaw,
    bonusDaysAdded,
    challengeTotalDays,
    evaluatedDays,
    daysRemaining,
  };

  return {
    ...progress,
    effectiveGoalType: goalType,
    effectiveGoalValue,
  };
}

/**
 * Map a DB row + user context into the API response shape.
 */
function mapChallengeRow(
  row: ChallengeRow,
  participantsCount: number,
  participantInfo?: { joined: boolean; joinedAt?: string; claimedAt?: string | null; notifyAnnouncement?: boolean },
  progress?: ComputeProgressResult | ChallengeProgress,
  clubInfo?: ClubHostInfo,
  coHostClubInfo?: ClubHostInfo,
  winnerProfile?: ProfileRow | null
): ChallengeResponse {
  const joined = participantInfo?.joined ?? false;

  const effectiveGoalType = (progress && 'effectiveGoalType' in progress)
    ? progress.effectiveGoalType
    : normalizeGoalType(row.goal_type, row.title, row.subtitle);

  let effectiveGoalValue: number | undefined;
  if (progress && 'effectiveGoalValue' in progress) {
    effectiveGoalValue = progress.effectiveGoalValue;
  } else if (effectiveGoalType === 'most_steps') {
    effectiveGoalValue = row.goal_value || 0;
  } else {
    effectiveGoalValue = row.goal_value ?? undefined;
  }

  // Eligibility: user has met the goal
  const eligible = joined && progress ? progress.percent >= 100 : false;
  // Can claim: eligible and hasn't claimed yet
  const canClaim = eligible && !participantInfo?.claimedAt;

  const hostName = clubInfo?.name ?? row.host_name ?? (row.is_official ? 'Sabi Sweat' : undefined);
  const hostLogoUrl = clubInfo?.profile_image_url ?? row.host_logo_url;
  const hostClubId = clubInfo?.id ?? row.host_club_id;
  const hostTheme = clubInfo?.theme || (row.is_official ? 'green' : undefined);

  const host: ChallengeHost | undefined = (hostName || hostClubId)
    ? {
        name: hostName ?? '',
        logoUrl: hostLogoUrl ?? undefined,
        clubId: hostClubId ?? undefined,
        theme: hostTheme,
      }
    : undefined;

  const coHosts: ChallengeHost[] = coHostClubInfo
    ? [
        {
          name: coHostClubInfo.name,
          logoUrl: coHostClubInfo.profile_image_url ?? undefined,
          clubId: coHostClubInfo.id,
          theme: coHostClubInfo.theme || undefined,
        },
      ]
    : [];

  const now = new Date();
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  const announcementTime = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  let status: 'upcoming' | 'active' | 'verifying' | 'completed' = 'active';
  if (now < start) {
    status = 'upcoming';
  } else if (now < end) {
    status = 'active';
  } else if (now < announcementTime) {
    status = 'verifying';
  } else {
    status = 'completed';
  }

  let winner: WinnerInfo | null = null;
  if (status === 'completed' && row.winner_user_id) {
    const userObj = winnerProfile ? mapProfileToUser(winnerProfile, row.winner_user_id) : { id: row.winner_user_id };
    winner = {
      id: row.winner_user_id,
      username: userObj.username,
      displayName: userObj.displayName,
      photoUrl: userObj.photoUrl,
      avatarId: userObj.avatarId,
      announcedAt: row.winner_announced_at || row.winner_selected_at || announcementTime.toISOString(),
    };
  }

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description ?? undefined,
    rewardText: row.reward_text || '',
    rewardId: row.reward_id ?? null,
    heroImageBase64: row.hero_image_url ?? undefined,
    challengeImage: row.challenge_image ?? undefined,
    rules: row.rules ?? undefined,
    goals: row.goals ?? undefined,
    host,
    coHosts,
    isOfficial: Boolean(row.is_official),
    hasPrizeDraw: Boolean(row.has_prize_draw),
    prizeAmount: row.prize_amount != null ? Number(row.prize_amount) : undefined,
    prizeCurrency: row.prize_currency || 'NGN',
    status,
    announcementAt: announcementTime.toISOString(),
    serverTime: now.toISOString(),
    winner,
    subscribedAnnouncement: Boolean(participantInfo?.notifyAnnouncement),
    sponsorText: row.sponsor_text ?? undefined,
    cityTag: row.city_tag ?? undefined,
    country: row.country ?? undefined,
    region: row.region ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    goalType: effectiveGoalType,
    goalValue: effectiveGoalValue,
    participantsCount,
    maxParticipants: row.max_participants ?? undefined,
    joined,
    joinedAt: participantInfo?.joinedAt,
    eligible,
    canClaim,
    claimedAt: participantInfo?.claimedAt ?? null,
    progress,
    whoCanJoin: row.who_can_join ?? 'everyone',
    leaderboardVisibility: row.leaderboard_visibility ?? 'public',
  };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * GET /challenges/active
 * Returns challenges the user has joined (paginated).
 */
export async function getActiveChallenges(
  userId: string,
  page: number = 1,
  size: number = 10
): Promise<PaginatedChallengesResponse> {
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, size);

  // 1. Get user's active participations
  let participations: any[] | null = null;
  let pError: any = null;
  const initialFetch = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('challenge_id, joined_at, claimed_at, notify_announcement')
    .eq('user_id', userId)
    .is('left_at', null);

  if (initialFetch.error && initialFetch.error.message?.includes('notify_announcement')) {
    const fallbackFetch = await supabase
      .from(PARTICIPANTS_TABLE)
      .select('challenge_id, joined_at, claimed_at')
      .eq('user_id', userId)
      .is('left_at', null);
    participations = fallbackFetch.data;
    pError = fallbackFetch.error;
  } else {
    participations = initialFetch.data;
    pError = initialFetch.error;
  }

  if (pError) throw pError;
  if (!participations || participations.length === 0) {
    return { page: currentPage, size: pageSize, total: 0, hasMore: false, data: [] };
  }

  const challengeIds = participations.map((p) => p.challenge_id);

  // 2. Get challenge rows
  const { data: challenges, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .in('id', challengeIds)
    .order('start_at', { ascending: false });

  if (cError) throw cError;
  if (!challenges || challenges.length === 0) {
    return { page: currentPage, size: pageSize, total: 0, hasMore: false, data: [] };
  }

  const total = challenges.length;
  const start = (currentPage - 1) * pageSize;
  const pageChallenges = challenges.slice(start, start + pageSize);
  const hasMore = currentPage * pageSize < total;

  // Build a map of participations for quick lookup
  const partMap = new Map(participations.map((p) => [p.challenge_id, p]));

  // Resolve clubs for challenges with host_club_id and co_host_club_id
  const allClubIds = pageChallenges.flatMap((c) => [c.host_club_id, c.co_host_club_id]);
  const clubsMap = await fetchClubsMap(allClubIds);

  // 3. Get participants count for each page challenge
  const countPromises = pageChallenges.map((c) => getParticipantsCount(c.id));
  const counts = await Promise.all(countPromises);

  // 4. Compute progress for each page challenge
  const progressPromises = pageChallenges.map((c) => {
    const part = partMap.get(c.id);
    return computeProgress(userId, c as ChallengeRow, part?.joined_at);
  });
  const progressResults = await Promise.all(progressPromises);

  // 5. Map to response
  const data = pageChallenges.map((c, i) => {
    const part = partMap.get(c.id);
    return mapChallengeRow(
      c as ChallengeRow,
      counts[i],
      {
        joined: true,
        joinedAt: part?.joined_at,
        claimedAt: part?.claimed_at ?? null,
        notifyAnnouncement: part?.notify_announcement,
      },
      progressResults[i],
      clubsMap.get(c.host_club_id),
      c.co_host_club_id ? clubsMap.get(c.co_host_club_id) : undefined
    );
  });

  // Sort: official first, then by start_at descending (already ordered)
  data.sort((a, b) => {
    if (a.isOfficial && !b.isOfficial) return -1;
    if (!a.isOfficial && b.isOfficial) return 1;
    return 0;
  });

  return {
    page: currentPage,
    size: pageSize,
    total,
    hasMore,
    data,
  };
}

/**
 * GET /challenges/available
 * Returns challenges the user has NOT joined (paginated), with geographic relevance ranking.
 * Official Sabi Sweat challenges are always prioritised first.
 */
export async function getAvailableChallenges(
  userId: string,
  filters?: { page?: number; size?: number; country?: string; region?: string }
): Promise<PaginatedChallengesResponse> {
  const currentPage = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(1, filters?.size ?? 10);

  // 1. Get challenge IDs user has already joined (and not left)
  const { data: participations, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('challenge_id')
    .eq('user_id', userId)
    .is('left_at', null);

  if (pError) throw pError;
  const joinedIds = new Set((participations ?? []).map((p) => p.challenge_id));

  // 2. Get all challenges that haven't ended (no hard country filter — we rank instead)
  const { data: challenges, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .gte('end_at', new Date().toISOString())
    .order('start_at', { ascending: false });

  if (cError) throw cError;
  if (!challenges || challenges.length === 0) {
    return { page: currentPage, size: pageSize, total: 0, hasMore: false, data: [] };
  }

  // 3. Filter out joined challenges, then sort by geographic relevance
  const available = challenges.filter((c) => !joinedIds.has(c.id));

  // Apply geographic priority ranking
  available.sort((a, b) => {
    const aPriority = getGeoPriority(filters?.country, filters?.region, {
      isOfficial: a.is_official,
      country: a.country,
      region: a.region,
    });
    const bPriority = getGeoPriority(filters?.country, filters?.region, {
      isOfficial: b.is_official,
      country: b.country,
      region: b.region,
    });
    if (aPriority !== bPriority) return aPriority - bPriority;
    // Same tier: sort by start_at descending
    return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
  });

  const total = available.length;
  const start = (currentPage - 1) * pageSize;
  const pageChallenges = available.slice(start, start + pageSize);
  const hasMore = currentPage * pageSize < total;

  // Resolve clubs for available challenges on this page (host + co-host)
  const allClubIds = pageChallenges.flatMap((c) => [c.host_club_id, c.co_host_club_id]);
  const clubsMap = await fetchClubsMap(allClubIds);

  // 4. Get participant counts for page challenges
  const countPromises = pageChallenges.map((c) => getParticipantsCount(c.id));
  const counts = await Promise.all(countPromises);

  const data = pageChallenges.map((c, i) =>
    mapChallengeRow(
      c as ChallengeRow,
      counts[i],
      { joined: false },
      undefined,
      clubsMap.get(c.host_club_id),
      c.co_host_club_id ? clubsMap.get(c.co_host_club_id) : undefined
    )
  );

  return {
    page: currentPage,
    size: pageSize,
    total,
    hasMore,
    data,
  };
}

/**
 * GET /challenges/past
 * Returns challenges whose endAt timestamp has elapsed, ordered by endAt DESC (paginated).
 */
export async function getPastChallenges(
  userId?: string,
  page: number = 1,
  size: number = 10
): Promise<PaginatedChallengesResponse> {
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, size);
  const now = new Date().toISOString();

  // 1. Query challenges whose end_at is in the past, ordered by most recently ended first
  const { data: challenges, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .lt('end_at', now)
    .order('end_at', { ascending: false });

  if (cError) throw cError;
  if (!challenges || challenges.length === 0) {
    return { page: currentPage, size: pageSize, total: 0, hasMore: false, data: [] };
  }

  const total = challenges.length;
  const start = (currentPage - 1) * pageSize;
  const pageChallenges = challenges.slice(start, start + pageSize);
  const hasMore = currentPage * pageSize < total;

  if (pageChallenges.length === 0) {
    return { page: currentPage, size: pageSize, total, hasMore: false, data: [] };
  }

  const pageChallengeIds = pageChallenges.map((c) => c.id);

  // 2. If userId is provided, get user's participations for these challenges
  let partMap = new Map<string, { joined: boolean; joinedAt?: string; claimedAt?: string | null }>();
  if (userId) {
    const { data: participations } = await supabase
      .from(PARTICIPANTS_TABLE)
      .select('challenge_id, joined_at, claimed_at')
      .eq('user_id', userId)
      .in('challenge_id', pageChallengeIds)
      .is('left_at', null);

    for (const p of participations ?? []) {
      partMap.set(p.challenge_id, {
        joined: true,
        joinedAt: p.joined_at,
        claimedAt: p.claimed_at,
      });
    }
  }

  // 3. Resolve clubs for host_club_id and co_host_club_id
  const allClubIds = pageChallenges.flatMap((c) => [c.host_club_id, c.co_host_club_id]);
  const clubsMap = await fetchClubsMap(allClubIds);

  // 4. Get participant counts
  const countPromises = pageChallenges.map((c) => getParticipantsCount(c.id));
  const counts = await Promise.all(countPromises);

  // 5. If user joined any of these, compute their progress too
  const progressPromises = pageChallenges.map((c) => {
    const part = partMap.get(c.id);
    if (userId && part?.joined) {
      return computeProgress(userId, c as ChallengeRow, part.joinedAt);
    }
    return Promise.resolve(undefined);
  });
  const progressResults = await Promise.all(progressPromises);

  const data = pageChallenges.map((c, i) => {
    const part = partMap.get(c.id);
    return mapChallengeRow(
      c as ChallengeRow,
      counts[i],
      part ?? { joined: false },
      progressResults[i],
      clubsMap.get(c.host_club_id),
      c.co_host_club_id ? clubsMap.get(c.co_host_club_id) : undefined
    );
  });

  return {
    page: currentPage,
    size: pageSize,
    total,
    hasMore,
    data,
  };
}

export interface ClubChallengesOptions {
  status?: 'all' | 'active' | 'upcoming' | 'past';
}

/**
 * GET challenges owned by a club
 * Returns all challenges hosted by a specific club.
 */
export async function getChallengesByClubId(
  clubId: string,
  userId?: string,
  options?: ClubChallengesOptions
): Promise<ChallengeResponse[]> {
  // 1. Resolve club ID and ensure club exists
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clubId);
  let resolvedClub: ClubHostInfo | null = null;
  if (!isUuid) {
    const sanitizedTag = clubId.replace(/^@/, '');
    const { data: club } = await supabase
      .from(CLUBS_TABLE)
      .select('id, name, profile_image_url, theme')
      .eq('tag', sanitizedTag)
      .maybeSingle();
    if (!club) {
      throw { status: 404, message: 'Club not found' };
    }
    resolvedClub = club as ClubHostInfo;
  } else {
    const { data: club } = await supabase
      .from(CLUBS_TABLE)
      .select('id, name, profile_image_url, theme')
      .eq('id', clubId)
      .maybeSingle();
    if (!club) {
      throw { status: 404, message: 'Club not found' };
    }
    resolvedClub = club as ClubHostInfo;
  }
  const resolvedClubId = resolvedClub.id;

  // 2. Query challenges for this club (ordered newest first)
  let query = supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .eq('host_club_id', resolvedClubId);

  const now = new Date().toISOString();
  if (options?.status === 'active') {
    query = query.lte('start_at', now).gte('end_at', now);
  } else if (options?.status === 'upcoming') {
    query = query.gt('start_at', now);
  } else if (options?.status === 'past') {
    query = query.lt('end_at', now);
  }

  const { data: challenges, error: cError } = await query.order('start_at', { ascending: false });

  if (cError) throw cError;
  if (!challenges || challenges.length === 0) return [];

  // 3. User participations (if userId provided)
  let partMap = new Map<string, any>();
  if (userId) {
    const challengeIds = challenges.map((c) => c.id);
    const { data: participations, error: pError } = await supabase
      .from(PARTICIPANTS_TABLE)
      .select('challenge_id, joined_at, claimed_at')
      .eq('user_id', userId)
      .in('challenge_id', challengeIds)
      .is('left_at', null);

    if (pError) throw pError;
    partMap = new Map((participations ?? []).map((p) => [p.challenge_id, p]));
  }

  // 4. Participant counts
  const countPromises = challenges.map((c) => getParticipantsCount(c.id));
  const counts = await Promise.all(countPromises);

  // 5. Compute user progress if joined
  const progressPromises = challenges.map((c) => {
    const part = partMap.get(c.id);
    if (userId && part) {
      return computeProgress(userId, c as ChallengeRow, part.joined_at);
    }
    return Promise.resolve(undefined);
  });
  const progressResults = await Promise.all(progressPromises);

  // 6. Map to response
  return challenges.map((c, i) => {
    const part = partMap.get(c.id);
    return mapChallengeRow(
      c as ChallengeRow,
      counts[i],
      {
        joined: !!part,
        joinedAt: part?.joined_at,
        claimedAt: part?.claimed_at ?? null,
      },
      progressResults[i],
      resolvedClub ?? undefined
    );
  });
}

/**
 * GET /challenges/:id
 * Returns a single challenge with user's join status and progress.
 */
export async function getChallengeById(
  challengeId: string,
  userId: string
): Promise<ChallengeResponse | null> {
  // 1. Get challenge
  const { data: challenge, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .eq('id', challengeId)
    .single();

  if (cError) {
    if (cError.code === 'PGRST116') return null; // Not found
    throw cError;
  }
  if (!challenge) return null;

  // Resolve host details from club if host_club_id is present
  let clubInfo: ClubHostInfo | undefined;
  let coHostClubInfo: ClubHostInfo | undefined;
  const clubIdsToFetch = [challenge.host_club_id, challenge.co_host_club_id].filter(Boolean);
  if (clubIdsToFetch.length > 0) {
    const clubsMap = await fetchClubsMap(clubIdsToFetch);
    if (challenge.host_club_id) clubInfo = clubsMap.get(challenge.host_club_id);
    if (challenge.co_host_club_id) coHostClubInfo = clubsMap.get(challenge.co_host_club_id);
  }

  // 2. Check participation (include notify_announcement)
  let participantRes = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('joined_at, claimed_at, left_at, notify_announcement')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (participantRes.error && participantRes.error.message?.includes('notify_announcement')) {
    participantRes = await supabase
      .from(PARTICIPANTS_TABLE)
      .select('joined_at, claimed_at, left_at')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .maybeSingle();
  }

  const { data: participant, error: pError } = participantRes;

  if (pError) throw pError;

  const joined = !!participant && !participant.left_at;

  // 3. Get participants count
  const participantsCount = await getParticipantsCount(challengeId);

  // 4. Compute progress if joined
  let progress: ChallengeProgress | undefined;
  if (joined) {
    progress = await computeProgress(userId, challenge as ChallengeRow, participant.joined_at);
  }

  // 5. Resolve winner profile if winner exists
  let winnerProfile: ProfileRow | undefined;
  if (challenge.winner_user_id) {
    const profilesMap = await fetchProfilesMap([challenge.winner_user_id]);
    winnerProfile = profilesMap.get(challenge.winner_user_id);
  }

  return mapChallengeRow(
    challenge as ChallengeRow,
    participantsCount,
    {
      joined,
      joinedAt: participant?.joined_at,
      claimedAt: participant?.claimed_at ?? null,
      notifyAnnouncement: participant?.notify_announcement,
    },
    progress,
    clubInfo,
    coHostClubInfo,
    winnerProfile
  );
}

/**
 * POST /challenges/:id/join
 */
export async function joinChallenge(
  challengeId: string,
  userId: string
): Promise<{ ok: boolean }> {
  // Check challenge exists
  const { data: challenge, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('id, end_at, max_participants')
    .eq('id', challengeId)
    .single();

  if (cError || !challenge) {
    throw { status: 404, message: 'Challenge not found' };
  }

  // Check if challenge has ended
  if (new Date(challenge.end_at) < new Date()) {
    throw { status: 400, message: 'Challenge has already ended' };
  }

  // Check max participants
  if (challenge.max_participants) {
    const currentCount = await getParticipantsCount(challengeId);
    if (currentCount >= challenge.max_participants) {
      throw { status: 400, message: 'Challenge is full' };
    }
  }

  // Upsert: if user previously left, re-join by clearing left_at
  const { error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .upsert(
      {
        challenge_id: challengeId,
        user_id: userId,
        joined_at: new Date().toISOString(),
        left_at: null,
        claimed_at: null,
      },
      { onConflict: 'challenge_id,user_id' }
    );

  if (error) throw error;

  return { ok: true };
}

/**
 * POST /challenges/:id/leave
 */
export async function leaveChallenge(
  challengeId: string,
  userId: string
): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .update({ left_at: new Date().toISOString() })
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .is('left_at', null);

  if (error) throw error;

  return { ok: true };
}

/**
 * GET /challenges/:id/leaderboard
 */
export async function getLeaderboard(
  challengeId: string,
  page: number = 0,
  size: number = 20,
  currentUserId?: string
): Promise<LeaderboardResponse> {
  // 1. Get challenge dates and goal configuration
  const { data: challenge, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('start_at, end_at, goal_type, goal_value, title, subtitle')
    .eq('id', challengeId)
    .single();

  if (cError || !challenge) {
    throw { status: 404, message: 'Challenge not found' };
  }

  const challengeTimezone = resolveChallengeTimezone(challenge);
  const startDate = formatDateInTimezone(challenge.start_at, challengeTimezone);
  const endDate = formatDateInTimezone(challenge.end_at, challengeTimezone);
  const goalType = normalizeGoalType(challenge.goal_type, challenge.title, challenge.subtitle);
  const isDailyStep = goalType === 'daily_step';
  const dailyTarget = typeof challenge.goal_value === 'number' && challenge.goal_value > 0 ? challenge.goal_value : 10000;
  const challengeTotalDays = daysBetween(challenge.start_at, challenge.end_at);

  // 2. Get all active participants
  const { data: participants, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('user_id, joined_at')
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (pError) throw pError;
  if (!participants || participants.length === 0) {
    return { page, size, total: 0, goalType, currentUser: null, data: [] };
  }

  const participantIds = participants.map((p) => p.user_id);
  const partMap = new Map(participants.map((p) => [p.user_id, p.joined_at]));

  // 3. Get daily_steps aggregated per user for the challenge period
  const { data: stepsData, error: sError } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('user_id, steps, date')
    .in('user_id', participantIds)
    .gte('date', startDate)
    .lte('date', endDate);

  if (sError) throw sError;

  // Aggregate daily steps and cumulative total per user (only counting on or after they joined)
  const userDailyMap = new Map<string, Map<string, number>>();
  for (const uid of participantIds) {
    userDailyMap.set(uid, new Map());
  }

  for (const row of stepsData ?? []) {
    const pJoinedAt = partMap.get(row.user_id);
    const pJoinedDateStr = pJoinedAt ? formatDateInTimezone(pJoinedAt, challengeTimezone) : startDate;
    const effectiveStart = pJoinedDateStr > startDate ? pJoinedDateStr : startDate;
      
    if (row.date >= effectiveStart && row.date <= endDate) {
      const userDays = userDailyMap.get(row.user_id);
      if (userDays) {
        userDays.set(row.date, (userDays.get(row.date) || 0) + (row.steps || 0));
      }
    }
  }

  // Calculate metrics per user
  const userMetrics = participantIds.map((uid) => {
    const userDays = userDailyMap.get(uid);
    let totalSteps = 0;
    let successfulDays = 0;
    if (userDays) {
      for (const steps of userDays.values()) {
        totalSteps += steps;
        if (steps >= dailyTarget) {
          successfulDays++;
        }
      }
    }
    return {
      userId: uid,
      steps: totalSteps,
      successfulDays,
    };
  });

  // Sort based on goalType: daily_step sorts by successfulDays DESC, then steps DESC
  // steps_goal and most_steps sort by steps DESC
  const ranked = userMetrics.sort((a, b) => {
    if (isDailyStep) {
      if (b.successfulDays !== a.successfulDays) {
        return b.successfulDays - a.successfulDays;
      }
      if (b.steps !== a.steps) {
        return b.steps - a.steps;
      }
      return a.userId.localeCompare(b.userId);
    }
    if (b.steps !== a.steps) {
      return b.steps - a.steps;
    }
    return a.userId.localeCompare(b.userId);
  });

  const total = ranked.length;

  // Paginate
  const start = page * size;
  const pageData = ranked.slice(start, start + size);

  // 4. Find currentUser ranking object (if authenticated and participant with progress)
  let currentUser: LeaderboardEntry | null = null;
  const userIndex = currentUserId ? ranked.findIndex((r) => r.userId === currentUserId) : -1;
  const hasUserProgress = userIndex !== -1 && (isDailyStep ? ranked[userIndex].successfulDays > 0 || ranked[userIndex].steps > 0 : ranked[userIndex].steps > 0);

  // 5. Fetch profiles for page + current user (if needed)
  const profileIdsToFetch = [...pageData.map((r) => r.userId)];
  if (currentUserId && hasUserProgress && !profileIdsToFetch.includes(currentUserId)) {
    profileIdsToFetch.push(currentUserId);
  }

  const profileMap = await fetchProfilesMap(profileIdsToFetch);

  if (currentUserId && hasUserProgress) {
    const userRank = userIndex + 1;
    const userMetric = ranked[userIndex];
    currentUser = {
      rank: userRank,
      user: mapProfileToUser(profileMap.get(currentUserId), currentUserId),
      steps: userMetric.steps,
      score: isDailyStep ? `${userMetric.successfulDays}/${challengeTotalDays}` : formatStepsAsScore(userMetric.steps),
      ...(isDailyStep ? { successfulDays: userMetric.successfulDays, totalDays: challengeTotalDays } : {}),
    };
  }

  const entries: LeaderboardEntry[] = pageData.map((r, i) => ({
    rank: start + i + 1,
    user: mapProfileToUser(profileMap.get(r.userId), r.userId),
    steps: r.steps,
    score: isDailyStep ? `${r.successfulDays}/${challengeTotalDays}` : formatStepsAsScore(r.steps),
    ...(isDailyStep ? { successfulDays: r.successfulDays, totalDays: challengeTotalDays } : {}),
  }));

  return { page, size, total, goalType, currentUser, data: entries };
}

/**
 * POST /challenges/:id/claim
 */
export async function claimReward(
  challengeId: string,
  userId: string
): Promise<{ ok: boolean }> {
  // 1. Get challenge
  const { data: challenge, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .eq('id', challengeId)
    .single();

  if (cError || !challenge) {
    throw { status: 404, message: 'Challenge not found' };
  }

  // 2. Check participation
  const { data: participant, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('id, claimed_at, left_at')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .single();

  if (pError || !participant) {
    throw { status: 400, message: 'You have not joined this challenge' };
  }

  if (participant.left_at) {
    throw { status: 400, message: 'You have left this challenge' };
  }

  if (participant.claimed_at) {
    throw { status: 400, message: 'Reward already claimed' };
  }

  // 3. Check eligibility (progress >= 100%)
  const progress = await computeProgress(userId, challenge as ChallengeRow);
  if (progress.percent < 100) {
    throw { status: 400, message: 'You have not completed this challenge yet' };
  }

  // 4. Mark as claimed
  const { error: uError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', participant.id);

  if (uError) throw uError;

  // 5. Disburse SabiCoins if reward has a numeric points value
  const rewardText = challenge.reward_text || '';
  const pointsMatch = rewardText.match(/(\d[\d,]*)\s*(?:sabi\s*coins?|points?|sc)/i);
  if (pointsMatch) {
    const pointsAmount = parseInt(pointsMatch[1].replace(/,/g, ''), 10);
    if (pointsAmount > 0) {
      try {
        await recordPointsTransaction(
          userId,
          pointsAmount,
          'challenge_reward',
          `Reward for completing challenge: ${challenge.title}`,
          `challenge_claim:${challengeId}:${userId}`,
          { challengeId, challengeTitle: challenge.title }
        );
      } catch (err: any) {
        // already_processed is fine (idempotent), otherwise log and continue
        if (err?.message !== 'already_processed' && !(typeof err === 'object' && err?.reason === 'already_processed')) {
          console.warn('[challengeService] Failed to disburse SabiCoins for challenge claim:', err);
        }
      }
    }
  }

  return { ok: true };
}

/**
 * POST /challenges
 * Create a new challenge (standalone or club-hosted).
 */
export async function createChallenge(
  input: CreateChallengeInput,
  userId: string
): Promise<ChallengeResponse> {
  const challengeId = randomUUID();

  // Validate dates
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    throw { status: 400, message: 'Invalid startAt or endAt date format' };
  }
  if (endAt <= startAt) {
    throw { status: 400, message: 'endAt must be after startAt' };
  }

  let hostClubId: string | null = null;
  let hostName = input.hostName;
  let hostLogoUrl = input.hostLogoUrl;
  let clubInfo: ClubHostInfo | undefined;

  // If club specified, verify club & verify user is admin
  if (input.hostClubId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.hostClubId);
    let club: any = null;

    if (!isUuid) {
      const sanitizedTag = input.hostClubId.replace(/^@/, '');
      const { data } = await supabase
        .from(CLUBS_TABLE)
        .select('id, name, profile_image_url, theme')
        .eq('tag', sanitizedTag)
        .maybeSingle();
      club = data;
    } else {
      const { data } = await supabase
        .from(CLUBS_TABLE)
        .select('id, name, profile_image_url, theme')
        .eq('id', input.hostClubId)
        .maybeSingle();
      club = data;
    }

    if (!club) {
      throw { status: 404, message: 'Club not found' };
    }

    hostClubId = club.id;
    clubInfo = club as ClubHostInfo;

    // Verify admin membership
    const { data: member } = await supabase
      .from(CLUB_MEMBERS_TABLE)
      .select('role')
      .eq('club_id', club.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member || member.role !== 'admin') {
      throw { status: 403, message: 'Only club admins can create challenges for this club' };
    }

    // Always use club name and logo as the challenge host
    hostName = club.name;
    hostLogoUrl = club.profile_image_url;
  } else if (!hostName) {
    // Default hostName to user's displayName or 'Sabi Sweat'
    const profileMap = await fetchProfilesMap([userId]);
    const userProfile = profileMap.get(userId);
    hostName = [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') || userProfile?.username || 'Sabi Sweat';
  }

  // Upload hero image if base64 provided
  let heroImageUrl = input.heroImageUrl ?? null;
  if (input.heroImageBase64) {
    const parsed = parseBase64Image(input.heroImageBase64);
    if (parsed) {
      const path = `challenges/${challengeId}/hero_${randomUUID()}.${parsed.extension}`;
      const { error: uploadErr } = await supabase.storage
        .from(IMAGES_BUCKET)
        .upload(path, parsed.buffer, { contentType: parsed.contentType });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
        heroImageUrl = urlData.publicUrl;
      } else {
        console.warn('Hero image upload failed:', uploadErr.message);
      }
    }
  }

  // Upload challenge image if base64 provided
  let challengeImageUrl = input.challengeImage ?? null;
  if (input.challengeImageBase64) {
    const parsed = parseBase64Image(input.challengeImageBase64);
    if (parsed) {
      const path = `challenges/${challengeId}/challenge_${randomUUID()}.${parsed.extension}`;
      const { error: uploadErr } = await supabase.storage
        .from(IMAGES_BUCKET)
        .upload(path, parsed.buffer, { contentType: parsed.contentType });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
        challengeImageUrl = urlData.publicUrl;
      } else {
        console.warn('Challenge image upload failed:', uploadErr.message);
      }
    }
  }

  const validatedGoalType = normalizeGoalType(input.goalType, input.title, input.subtitle);
  const defaultGoalValue = validatedGoalType === 'most_steps' ? 0 : (validatedGoalType === 'steps_goal' ? 50000 : 10000);
  const validatedGoalValue = input.goalValue !== undefined ? input.goalValue : defaultGoalValue;

  // Insert challenge row
  const rowToInsert: Record<string, any> = {
    id: challengeId,
    title: input.title,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    reward_text: input.rewardText ?? null,
    reward_id: input.rewardId ?? null,
    hero_image_url: heroImageUrl,
    challenge_image: challengeImageUrl,
    rules: input.rules ?? null,
    goals: input.goals ?? null,
    sponsor_text: input.sponsorText ?? null,
    city_tag: input.cityTag ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    goal_type: validatedGoalType,
    goal_value: validatedGoalValue,
    max_participants: input.maxParticipants ?? null,
    host_name: hostName ?? null,
    host_logo_url: hostLogoUrl ?? null,
    host_club_id: hostClubId,
    co_host_club_id: input.coHostClubId ?? null,
    is_official: Boolean(input.isOfficial),
    has_prize_draw: Boolean(input.hasPrizeDraw),
    prize_amount: input.prizeAmount ?? 0,
    prize_currency: input.prizeCurrency ?? 'NGN',
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    who_can_join: input.whoCanJoin ?? 'everyone',
    leaderboard_visibility: input.leaderboardVisibility ?? 'public',
    created_by: userId,
  };

  if (input.heroImageBase64) {
    rowToInsert.hero_image_base64 = input.heroImageBase64;
  }

  let { data: created, error: insertError } = await supabase
    .from(CHALLENGES_TABLE)
    .insert(rowToInsert)
    .select()
    .single();

  if (insertError && (insertError.message?.includes('hero_image_base64') || insertError.message?.includes('reward_id'))) {
    if (insertError.message?.includes('hero_image_base64')) {
      delete rowToInsert.hero_image_base64;
    }
    if (insertError.message?.includes('reward_id')) {
      delete rowToInsert.reward_id;
    }
    const retry = await supabase
      .from(CHALLENGES_TABLE)
      .insert(rowToInsert)
      .select()
      .single();
    created = retry.data;
    insertError = retry.error;
  }

  if (insertError) throw insertError;

  if (created && input.rewardId && created.reward_id === undefined) {
    created.reward_id = input.rewardId;
  }

  // Asynchronously dispatch challenge discovery notifications based on club privacy
  if (created?.id) {
    handleChallengeCreatedEvent(created.id).catch((err) => {
      console.warn('[challengeService] Error dispatching challenge discovery notifications:', err);
    });
  }

  // Resolve co-host club info
  let coHostClubInfo: ClubHostInfo | undefined;
  if (input.coHostClubId) {
    const { data: coClub } = await supabase
      .from(CLUBS_TABLE)
      .select('id, name, profile_image_url, theme')
      .eq('id', input.coHostClubId)
      .maybeSingle();
    if (coClub) coHostClubInfo = coClub as ClubHostInfo;
  }

  return mapChallengeRow(created as ChallengeRow, 0, { joined: false }, undefined, clubInfo, coHostClubInfo);
}

/**
 * GET /challenges/completed
 * Returns all challenges the user completed (met goal or claimed).
 */
export async function getCompletedChallenges(userId: string): Promise<CompletedChallengeDetail[]> {
  const { data: participations, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('challenge_id, joined_at, claimed_at')
    .eq('user_id', userId)
    .is('left_at', null);

  if (pError) throw pError;
  if (!participations || participations.length === 0) return [];

  const challengeIds = participations.map((p) => p.challenge_id);

  const { data: challenges, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .in('id', challengeIds);

  if (cError) throw cError;
  if (!challenges || challenges.length === 0) return [];

  const partMap = new Map(participations.map((p) => [p.challenge_id, p]));
  const now = new Date();

  const progressPromises = challenges.map((c) => {
    const part = partMap.get(c.id);
    return computeProgress(userId, c as ChallengeRow, part?.joined_at);
  });
  const progressResults = await Promise.all(progressPromises);

  const completedList: CompletedChallengeDetail[] = [];

  for (let i = 0; i < challenges.length; i++) {
    const c = challenges[i] as ChallengeRow;
    const part = partMap.get(c.id);
    const prog = progressResults[i];
    const isEnded = now >= new Date(c.end_at);
    const isGoalMet = prog.percent >= 100;
    const isClaimed = Boolean(part?.claimed_at);

    if (isClaimed || (isEnded && isGoalMet) || isGoalMet) {
      const endDate = new Date(c.end_at);
      const subtitle = c.subtitle || endDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const rawRewardId = (c.reward_id || '').toLowerCase().trim();
      const rewardId = rawRewardId || 'emerald';

      completedList.push({
        id: c.id,
        challengeId: c.id,
        title: c.title,
        subtitle,
        rewardId,
        rewardText: c.reward_text || `${rewardId.charAt(0).toUpperCase() + rewardId.slice(1)} Badge`,
        startAt: c.start_at,
        endAt: c.end_at,
        completedAt: part?.claimed_at || c.end_at,
        claimedAt: part?.claimed_at ?? null,
        finalSteps: prog.steps,
        stepsContributed: prog.steps,
        goalSteps: c.goal_value || 0,
        percentage: Math.min(100, Math.round(prog.percent || 100)),
      });
    }
  }

  return completedList;
}


// ─── Qualified Participants & Announcement Subscription ──────────

/**
 * GET /challenges/:id/qualified-participants
 * Returns participants who have met the challenge goal.
 */
export async function getQualifiedParticipants(
  challengeId: string,
  page: number = 1,
  size: number = 20
): Promise<QualifiedParticipantsResponse> {
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, Math.min(100, size));

  // 1. Get challenge
  const { data: challenge, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .eq('id', challengeId)
    .single();

  if (cError || !challenge) {
    throw { status: 404, message: 'Challenge not found' };
  }

  const now = new Date();
  const start = new Date(challenge.start_at);
  const end = new Date(challenge.end_at);
  const announcementTime = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  let status: 'upcoming' | 'active' | 'verifying' | 'completed' = 'active';
  if (now < start) status = 'upcoming';
  else if (now < end) status = 'active';
  else if (now < announcementTime) status = 'verifying';
  else status = 'completed';

  const goalType = normalizeGoalType(challenge.goal_type, challenge.title, challenge.subtitle);

  // 2. Get all active participants
  const { data: participants, error: partError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('user_id, joined_at')
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (partError) throw partError;
  if (!participants || participants.length === 0) {
    return {
      challengeId,
      status,
      announcementAt: announcementTime.toISOString(),
      serverTime: now.toISOString(),
      winner: null,
      totalQualified: 0,
      page: currentPage,
      size: pageSize,
      data: [],
    };
  }

  // 3. Compute progress for each participant to determine qualification
  const progressPromises = participants.map((p) =>
    computeProgress(p.user_id, challenge as ChallengeRow, p.joined_at)
  );
  const progressResults = await Promise.all(progressPromises);

  // Filter to qualified participants (100% completion)
  const qualified: Array<{ userId: string; joinedAt: string; progress: ComputeProgressResult }> = [];
  for (let i = 0; i < participants.length; i++) {
    if (progressResults[i].percent >= 100) {
      qualified.push({
        userId: participants[i].user_id,
        joinedAt: participants[i].joined_at,
        progress: progressResults[i],
      });
    }
  }

  // Sort by steps descending for consistent ordering
  qualified.sort((a, b) => b.progress.steps - a.progress.steps);

  const totalQualified = qualified.length;
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = qualified.slice(startIdx, startIdx + pageSize);

  // 4. Resolve profiles
  const profileIds = pageItems.map((q) => q.userId);
  if (challenge.winner_user_id) profileIds.push(challenge.winner_user_id);
  const profilesMap = await fetchProfilesMap(profileIds);

  // 5. Build winner info
  let winner: WinnerInfo | null = null;
  if (status === 'completed' && challenge.winner_user_id) {
    const wp = profilesMap.get(challenge.winner_user_id);
    const userObj = mapProfileToUser(wp, challenge.winner_user_id);
    winner = {
      id: challenge.winner_user_id,
      username: userObj.username,
      displayName: userObj.displayName,
      photoUrl: userObj.photoUrl,
      avatarId: userObj.avatarId,
      announcedAt: challenge.winner_announced_at || challenge.winner_selected_at || announcementTime.toISOString(),
    };
  }

  // 6. Build metric description
  let metricLabel = 'steps';
  if (goalType === 'daily_step') {
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    metricLabel = `${totalDays}/${totalDays} days`;
  } else if (goalType === 'steps_goal') {
    metricLabel = `${challenge.goal_value?.toLocaleString()} steps`;
  } else if (goalType === 'most_steps') {
    metricLabel = 'most steps';
  }

  const data: QualifiedParticipant[] = pageItems.map((q) => {
    const profile = profilesMap.get(q.userId);
    const userObj = mapProfileToUser(profile, q.userId);
    return {
      id: q.userId,
      username: userObj.username,
      displayName: userObj.displayName,
      photoUrl: userObj.photoUrl,
      avatarId: userObj.avatarId,
      metric: metricLabel,
      qualifiedAt: q.joinedAt,
      isWinner: q.userId === challenge.winner_user_id,
    };
  });

  return {
    challengeId,
    status,
    announcementAt: announcementTime.toISOString(),
    serverTime: now.toISOString(),
    winner,
    totalQualified,
    page: currentPage,
    size: pageSize,
    data,
  };
}

/**
 * POST /challenges/:id/subscribe-announcement
 * Subscribe or unsubscribe from winner announcement push notification.
 */
export async function subscribeAnnouncement(
  challengeId: string,
  userId: string,
  notify: boolean
): Promise<{ subscribed: boolean }> {
  // Verify participant exists and is active
  const { data: participant, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('id, left_at')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (pError) throw pError;
  if (!participant) {
    throw { status: 400, message: 'You have not joined this challenge' };
  }
  if (participant.left_at) {
    throw { status: 400, message: 'You have left this challenge' };
  }

  const { error: uError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .update({ notify_announcement: notify })
    .eq('id', participant.id);

  if (uError) throw uError;

  return { subscribed: notify };
}
