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
  LeaderboardEntry,
  LeaderboardResponse,
  CreateChallengeInput,
} from '../models/challengeModel';

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

function formatStepsAsScore(steps: number): string {
  return steps.toLocaleString('en-US');
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
 * Compute a user's progress in a challenge from daily_steps.
 */
async function computeProgress(
  userId: string,
  challengeRow: ChallengeRow,
  joinedAtStr?: string
): Promise<ChallengeProgress> {
  const challengeStart = new Date(challengeRow.start_at);
  const joinedAt = joinedAtStr ? new Date(joinedAtStr) : challengeStart;
  const effectiveStart = joinedAt > challengeStart ? joinedAt : challengeStart;
  
  const startDate = effectiveStart.toISOString().split('T')[0];
  const endDate = new Date(challengeRow.end_at).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

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

  const goalValue = challengeRow.goal_value || 1;
  const challengeTotalDays = daysBetween(challengeRow.start_at, challengeRow.end_at);

  // Days where user met the daily goal
  const daysCompletedRaw = rows.filter((r) => r.steps >= goalValue).length;
  const bonusDaysAdded = 0; // Reserved for future bonus logic
  const daysCompleted = daysCompletedRaw + bonusDaysAdded;

  // Days evaluated (between start and today, capped at challenge end)
  const effectiveEnd = today < endDate ? today : endDate;
  const evaluatedDays = daysBetween(startDate, effectiveEnd);

  const daysRemaining = Math.max(0, daysBetween(today, endDate));

  // Percent is based on total steps vs (goalValue * challengeTotalDays)
  const totalGoalSteps = goalValue * challengeTotalDays;
  const percent = Math.min(100, Math.round((totalSteps / totalGoalSteps) * 100));

  return {
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
}

/**
 * Map a DB row + user context into the API response shape.
 */
function mapChallengeRow(
  row: ChallengeRow,
  participantsCount: number,
  participantInfo?: { joined: boolean; joinedAt?: string; claimedAt?: string | null },
  progress?: ChallengeProgress
): ChallengeResponse {
  const joined = participantInfo?.joined ?? false;

  // Eligibility: user has met the goal
  const eligible = joined && progress ? progress.percent >= 100 : false;
  // Can claim: eligible and hasn't claimed yet
  const canClaim = eligible && !participantInfo?.claimedAt;

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description ?? undefined,
    rewardText: row.reward_text || '',
    heroImageUrl: row.hero_image_url ?? undefined,
    heroImageBase64: row.hero_image_base64 ?? undefined,
    challengeImage: row.challenge_image ?? undefined,
    rules: row.rules ?? undefined,
    goals: row.goals ?? undefined,
    host: row.host_name
      ? {
          name: row.host_name,
          logoUrl: row.host_logo_url ?? undefined,
          clubId: row.host_club_id ?? undefined,
        }
      : undefined,
    sponsorText: row.sponsor_text ?? undefined,
    cityTag: row.city_tag ?? undefined,
    country: row.country ?? undefined,
    region: row.region ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    goalType: row.goal_type ?? undefined,
    goalValue: row.goal_value ?? undefined,
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
 * Returns challenges the user has joined and that haven't ended.
 */
export async function getActiveChallenges(userId: string): Promise<ChallengeResponse[]> {
  // 1. Get user's active participations
  const { data: participations, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('challenge_id, joined_at, claimed_at')
    .eq('user_id', userId)
    .is('left_at', null);

  if (pError) throw pError;
  if (!participations || participations.length === 0) return [];

  const challengeIds = participations.map((p) => p.challenge_id);

  // 2. Get challenge rows
  const { data: challenges, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .in('id', challengeIds);

  if (cError) throw cError;
  if (!challenges) return [];

  // Build a map of participations for quick lookup
  const partMap = new Map(participations.map((p) => [p.challenge_id, p]));

  // 3. Get participants count for each challenge
  const countPromises = challenges.map((c) => getParticipantsCount(c.id));
  const counts = await Promise.all(countPromises);

  // 4. Compute progress for each
  const progressPromises = challenges.map((c) => {
    const part = partMap.get(c.id);
    return computeProgress(userId, c as ChallengeRow, part?.joined_at);
  });
  const progressResults = await Promise.all(progressPromises);

  // 5. Map to response
  return challenges.map((c, i) => {
    const part = partMap.get(c.id);
    return mapChallengeRow(
      c as ChallengeRow,
      counts[i],
      {
        joined: true,
        joinedAt: part?.joined_at,
        claimedAt: part?.claimed_at ?? null,
      },
      progressResults[i]
    );
  });
}

/**
 * GET /challenges/available
 * Returns challenges the user has NOT joined, optionally filtered by country/region.
 */
export async function getAvailableChallenges(
  userId: string,
  filters?: { country?: string; region?: string }
): Promise<ChallengeResponse[]> {
  // 1. Get challenge IDs user has already joined (and not left)
  const { data: participations, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('challenge_id')
    .eq('user_id', userId)
    .is('left_at', null);

  if (pError) throw pError;
  const joinedIds = new Set((participations ?? []).map((p) => p.challenge_id));

  // 2. Get all challenges that haven't ended
  let query = supabase
    .from(CHALLENGES_TABLE)
    .select('*')
    .gte('end_at', new Date().toISOString());

  if (filters?.country) {
    query = query.eq('country', filters.country);
  }
  if (filters?.region) {
    query = query.eq('region', filters.region);
  }

  const { data: challenges, error: cError } = await query;
  if (cError) throw cError;
  if (!challenges) return [];

  // 3. Filter out joined challenges
  const available = challenges.filter((c) => !joinedIds.has(c.id));

  // 4. Get participant counts
  const countPromises = available.map((c) => getParticipantsCount(c.id));
  const counts = await Promise.all(countPromises);

  return available.map((c, i) =>
    mapChallengeRow(c as ChallengeRow, counts[i], { joined: false })
  );
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
  let resolvedClubId = clubId;
  if (!isUuid) {
    const sanitizedTag = clubId.replace(/^@/, '');
    const { data: club } = await supabase
      .from(CLUBS_TABLE)
      .select('id')
      .eq('tag', sanitizedTag)
      .maybeSingle();
    if (!club) {
      throw { status: 404, message: 'Club not found' };
    }
    resolvedClubId = club.id;
  } else {
    const { data: club } = await supabase
      .from(CLUBS_TABLE)
      .select('id')
      .eq('id', clubId)
      .maybeSingle();
    if (!club) {
      throw { status: 404, message: 'Club not found' };
    }
  }

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
      progressResults[i]
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

  // 2. Check participation
  const { data: participant, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('joined_at, claimed_at, left_at')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (pError) throw pError;

  const joined = !!participant && !participant.left_at;

  // 3. Get participants count
  const participantsCount = await getParticipantsCount(challengeId);

  // 4. Compute progress if joined
  let progress: ChallengeProgress | undefined;
  if (joined) {
    progress = await computeProgress(userId, challenge as ChallengeRow, participant.joined_at);
  }

  return mapChallengeRow(
    challenge as ChallengeRow,
    participantsCount,
    {
      joined,
      joinedAt: participant?.joined_at,
      claimedAt: participant?.claimed_at ?? null,
    },
    progress
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
  size: number = 20
): Promise<LeaderboardResponse> {
  // 1. Get challenge dates
  const { data: challenge, error: cError } = await supabase
    .from(CHALLENGES_TABLE)
    .select('start_at, end_at')
    .eq('id', challengeId)
    .single();

  if (cError || !challenge) {
    throw { status: 404, message: 'Challenge not found' };
  }

  const startDate = new Date(challenge.start_at).toISOString().split('T')[0];
  const endDate = new Date(challenge.end_at).toISOString().split('T')[0];

  // 2. Get all active participants
  const { data: participants, error: pError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('user_id, joined_at')
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (pError) throw pError;
  if (!participants || participants.length === 0) {
    return { page, size, total: 0, data: [] };
  }

  const participantIds = participants.map((p) => p.user_id);
  const partMap = new Map(participants.map((p) => [p.user_id, p.joined_at]));

  // 3. Get daily_steps aggregated per user for the challenge period
  // We fetch all steps rows for these users in the date range, then aggregate in-memory
  const { data: stepsData, error: sError } = await supabase
    .from(DAILY_STEPS_TABLE)
    .select('user_id, steps, date')
    .in('user_id', participantIds)
    .gte('date', startDate)
    .lte('date', endDate);

  if (sError) throw sError;

  // Aggregate steps per user (only counting steps on or after they joined)
  const stepsMap = new Map<string, number>();
  for (const row of stepsData ?? []) {
    const pJoinedAt = partMap.get(row.user_id);
    const challengeStartStr = new Date(challenge.start_at).toISOString().split('T')[0];
    const effectiveStart = pJoinedAt 
      ? new Date(Math.max(new Date(challenge.start_at).getTime(), new Date(pJoinedAt).getTime())).toISOString().split('T')[0]
      : challengeStartStr;
      
    if (row.date >= effectiveStart) {
      stepsMap.set(row.user_id, (stepsMap.get(row.user_id) || 0) + (row.steps || 0));
    }
  }

  // Sort by total steps descending
  const ranked = participantIds
    .map((uid) => ({ userId: uid, steps: stepsMap.get(uid) || 0 }))
    .sort((a, b) => b.steps - a.steps);

  const total = ranked.length;

  // Paginate
  const start = page * size;
  const pageData = ranked.slice(start, start + size);

  // 4. Fetch profiles for the page
  const profileMap = await fetchProfilesMap(pageData.map((r) => r.userId));

  const entries: LeaderboardEntry[] = pageData.map((r, i) => ({
    rank: start + i + 1,
    user: mapProfileToUser(profileMap.get(r.userId), r.userId),
    steps: r.steps,
    score: formatStepsAsScore(r.steps),
  }));

  return { page, size, total, data: entries };
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

  // If club specified, verify club & verify user is admin
  if (input.hostClubId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.hostClubId);
    let club: any = null;

    if (!isUuid) {
      const sanitizedTag = input.hostClubId.replace(/^@/, '');
      const { data } = await supabase
        .from(CLUBS_TABLE)
        .select('id, name, profile_image_url')
        .eq('tag', sanitizedTag)
        .maybeSingle();
      club = data;
    } else {
      const { data } = await supabase
        .from(CLUBS_TABLE)
        .select('id, name, profile_image_url')
        .eq('id', input.hostClubId)
        .maybeSingle();
      club = data;
    }

    if (!club) {
      throw { status: 404, message: 'Club not found' };
    }

    hostClubId = club.id;

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

    if (!hostName) hostName = club.name;
    if (!hostLogoUrl) hostLogoUrl = club.profile_image_url;
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

  // Insert challenge row
  const rowToInsert: Record<string, any> = {
    id: challengeId,
    title: input.title,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    reward_text: input.rewardText ?? null,
    hero_image_url: heroImageUrl,
    challenge_image: challengeImageUrl,
    rules: input.rules ?? null,
    goals: input.goals ?? null,
    sponsor_text: input.sponsorText ?? null,
    city_tag: input.cityTag ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    goal_type: input.goalType ?? 'steps',
    goal_value: input.goalValue ?? 10000,
    max_participants: input.maxParticipants ?? null,
    host_name: hostName ?? null,
    host_logo_url: hostLogoUrl ?? null,
    host_club_id: hostClubId,
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

  if (insertError && rowToInsert.hero_image_base64 && insertError.message?.includes('hero_image_base64')) {
    delete rowToInsert.hero_image_base64;
    const retry = await supabase
      .from(CHALLENGES_TABLE)
      .insert(rowToInsert)
      .select()
      .single();
    created = retry.data;
    insertError = retry.error;
  }

  if (insertError) throw insertError;

  return mapChallengeRow(created as ChallengeRow, 0, { joined: false });
}
