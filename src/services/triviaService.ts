import { supabase } from '../config/database';
import {
  AdminCreateTriviaQuestionInput,
  AdminCreateTriviaRoundInput,
  AdminUpdateTriviaRoundInput,
  TriviaLeaderboardResponse,
  TriviaOption,
  TriviaOverviewResponse,
  TriviaQuestionPublic,
  TriviaQuestionRevealed,
  TriviaResultsResponse,
  TriviaRoundDetailResponse,
  TriviaRoundSummary,
  TriviaStandingEntry,
  TriviaUserState,
} from '../models/triviaModel';

const ROUNDS_TABLE = 'trivia_rounds';
const QUESTIONS_TABLE = 'trivia_questions';
const SUBMISSIONS_TABLE = 'trivia_submissions';
const PROFILES_TABLE = 'profiles';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function isRoundClosed(round: { status?: string; closes_at: string }, now: Date = new Date()): boolean {
  if (round.status === 'closed' || round.status === 'archived') return true;
  const closesMs = new Date(round.closes_at).getTime();
  if (Number.isNaN(closesMs)) return false;
  return now.getTime() >= closesMs;
}

export function normalizeQuestionOptions(
  rawOptions: Array<{ id?: string; label?: string; text: string } | string>
): TriviaOption[] {
  if (!Array.isArray(rawOptions)) return [];
  const normalized: TriviaOption[] = [];
  for (let i = 0; i < rawOptions.length; i++) {
    const item = rawOptions[i];
    const fallbackLetter = OPTION_LETTERS[i] ?? String(i + 1);
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) continue;
      normalized.push({ id: fallbackLetter, label: fallbackLetter, text });
    } else if (item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim()) {
      const id = (typeof item.id === 'string' && item.id.trim()) || (typeof item.label === 'string' && item.label.trim()) || fallbackLetter;
      const label = (typeof item.label === 'string' && item.label.trim()) || id;
      normalized.push({ id, label, text: item.text.trim() });
    }
  }
  return normalized;
}

export interface RankableRow {
  userId: string;
  score: number;
  totalQuestions: number;
  points: number;
  roundsPlayed?: number;
  submittedAt?: string | null;
}

/**
 * Standard competition ranking (1, 2, 2, 4, 4):
 * Equal points share the same rank; next rank skips accordingly.
 * Marks `isJointRank = true` whenever 2 or more entries share a rank.
 */
export function computeStandardCompetitionRanks(
  rows: RankableRow[]
): Array<RankableRow & { rank: number; isJointRank: boolean }> {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.userId.localeCompare(b.userId);
  });

  const withRanks = sorted.map((row, index) => {
    let rank = index + 1;
    if (index > 0 && sorted[index - 1].points === row.points) {
      // Find first occurrence of this points total
      let firstIdx = index - 1;
      while (firstIdx > 0 && sorted[firstIdx - 1].points === row.points) {
        firstIdx--;
      }
      rank = firstIdx + 1;
    }
    return { ...row, rank, isJointRank: false };
  });

  const rankCounts = new Map<number, number>();
  for (const r of withRanks) {
    rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
  }

  return withRanks.map((r) => ({
    ...r,
    isJointRank: (rankCounts.get(r.rank) ?? 0) > 1,
  }));
}

function isMissingTableError(error: any): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

function resolveProfileDisplayName(profile: any): string {
  if (!profile) return 'Mover';
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (profile.username) return profile.username;
  return 'Mover';
}

async function fetchProfilesMap(userIds: string[]): Promise<Map<string, any>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('id, username, first_name, last_name, photo_url, photo_base64, avatar_id')
    .in('id', uniqueIds);

  if (error) throw error;
  return new Map((data ?? []).map((p: any) => [p.id, p]));
}

function resolveUserState(
  closed: boolean,
  submission: any | null
): TriviaUserState {
  const submitted = submission?.status === 'submitted';
  if (closed) {
    return submitted ? 'results_ready' : 'missed';
  }
  if (submitted) return 'submitted';
  const answeredKeys =
    submission?.answers && typeof submission.answers === 'object'
      ? Object.keys(submission.answers).filter((k) => Boolean(submission.answers[k]))
      : [];
  if (answeredKeys.length > 0) return 'in_progress';
  return 'not_started';
}

function mapRoundSummary(
  round: any,
  questionCount: number,
  participantCount: number,
  userSubmission: any | null,
  now: Date,
  rankInfo?: { rank: number; isJointRank: boolean } | null
): TriviaRoundSummary {
  const closed = isRoundClosed(round, now);
  const userState = resolveUserState(closed, userSubmission);
  const answeredCount =
    userSubmission?.answers && typeof userSubmission.answers === 'object'
      ? Object.values(userSubmission.answers).filter((v) => typeof v === 'string' && v.trim()).length
      : 0;

  const pointsPerQuestion = round.points_per_question ?? 20;
  const summary: TriviaRoundSummary = {
    id: round.id,
    weekLabel: round.week_label || 'THIS WEEK',
    weekNumber: round.week_number ?? null,
    title: round.title,
    subtitle: round.subtitle || '',
    questionCount,
    durationHours: round.duration_hours ?? 24,
    pointsPerQuestion,
    totalPoints: questionCount * pointsPerQuestion,
    startsAt: round.starts_at,
    closesAt: round.closes_at,
    isClosed: closed,
    participantCount,
    userState,
    answeredCount,
    notifyOnResults: Boolean(userSubmission?.notify_on_results),
  };

  if (closed && userSubmission?.status === 'submitted') {
    summary.score = userSubmission.score ?? 0;
    summary.pointsEarned = userSubmission.points_earned ?? 0;
    if (rankInfo) {
      summary.rank = rankInfo.rank;
      summary.isJointRank = rankInfo.isJointRank;
    }
  }

  return summary;
}

async function computeRankForUserInRound(
  roundId: string,
  userId: string,
  questionCount: number
): Promise<{ rank: number; isJointRank: boolean; participantCount: number } | null> {
  const { data: subs, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('user_id, score, points_earned, submitted_at')
    .eq('round_id', roundId)
    .eq('status', 'submitted');

  if (error) throw error;
  const rows: RankableRow[] = (subs ?? []).map((s: any) => ({
    userId: s.user_id,
    score: s.score ?? 0,
    totalQuestions: questionCount,
    points: s.points_earned ?? 0,
    submittedAt: s.submitted_at,
  }));

  const ranked = computeStandardCompetitionRanks(rows);
  const mine = ranked.find((r) => r.userId === userId);
  if (!mine) return null;
  return {
    rank: mine.rank,
    isJointRank: mine.isJointRank,
    participantCount: ranked.length,
  };
}

export async function getTriviaOverview(
  userId?: string,
  now: Date = new Date()
): Promise<TriviaOverviewResponse> {
  const { data: rounds, error } = await supabase
    .from(ROUNDS_TABLE)
    .select('*')
    .in('status', ['published', 'closed'])
    .lte('starts_at', now.toISOString())
    .order('starts_at', { ascending: false })
    .limit(10);

  if (error) {
    if (isMissingTableError(error)) {
      return { currentRound: null, previousRound: null };
    }
    throw error;
  }

  if (!rounds?.length) {
    return { currentRound: null, previousRound: null };
  }

  // Prefer the newest currently open round as currentRound; otherwise the newest closed round
  const openRound = rounds.find((r: any) => !isRoundClosed(r, now));
  const currentRow = openRound ?? rounds[0];
  const previousRow = rounds.find((r: any) => r.id !== currentRow.id && isRoundClosed(r, now)) ?? null;

  const targetIds = [currentRow.id, ...(previousRow ? [previousRow.id] : [])];

  const [questionsRes, submissionsRes] = await Promise.all([
    supabase.from(QUESTIONS_TABLE).select('id, round_id').in('round_id', targetIds),
    supabase
      .from(SUBMISSIONS_TABLE)
      .select('round_id, user_id, answers, status, score, points_earned, notify_on_results, submitted_at')
      .in('round_id', targetIds),
  ]);

  if (questionsRes.error) throw questionsRes.error;
  if (submissionsRes.error) throw submissionsRes.error;

  const questionCounts = new Map<string, number>();
  for (const q of questionsRes.data ?? []) {
    questionCounts.set(q.round_id, (questionCounts.get(q.round_id) ?? 0) + 1);
  }

  const buildSummary = (row: any): TriviaRoundSummary => {
    const qCount = questionCounts.get(row.id) ?? 0;
    const roundSubs = (submissionsRes.data ?? []).filter((s: any) => s.round_id === row.id);
    const submittedSubs = roundSubs.filter((s: any) => s.status === 'submitted');
    const mine = userId ? roundSubs.find((s: any) => s.user_id === userId) ?? null : null;

    let rankInfo: { rank: number; isJointRank: boolean } | null = null;
    if (isRoundClosed(row, now) && mine?.status === 'submitted') {
      const ranked = computeStandardCompetitionRanks(
        submittedSubs.map((s: any) => ({
          userId: s.user_id,
          score: s.score ?? 0,
          totalQuestions: qCount,
          points: s.points_earned ?? 0,
          submittedAt: s.submitted_at,
        }))
      );
      const myRank = ranked.find((r) => r.userId === userId);
      if (myRank) {
        rankInfo = { rank: myRank.rank, isJointRank: myRank.isJointRank };
      }
    }

    return mapRoundSummary(row, qCount, submittedSubs.length, mine, now, rankInfo);
  };

  return {
    currentRound: buildSummary(currentRow),
    previousRound: previousRow ? buildSummary(previousRow) : null,
  };
}

export async function getTriviaRoundDetail(
  roundId: string,
  userId?: string,
  now: Date = new Date()
): Promise<TriviaRoundDetailResponse | null> {
  const { data: round, error } = await supabase
    .from(ROUNDS_TABLE)
    .select('*')
    .eq('id', roundId)
    .in('status', ['published', 'closed'])
    .maybeSingle();

  if (error) throw error;
  if (!round) return null;

  const [questionsRes, subsRes] = await Promise.all([
    supabase
      .from(QUESTIONS_TABLE)
      .select('id, sort_order, category, prompt, options')
      .eq('round_id', roundId)
      .order('sort_order', { ascending: true }),
    supabase
      .from(SUBMISSIONS_TABLE)
      .select('user_id, answers, status, score, points_earned, notify_on_results, submitted_at')
      .eq('round_id', roundId),
  ]);

  if (questionsRes.error) throw questionsRes.error;
  if (subsRes.error) throw subsRes.error;

  const questions: TriviaQuestionPublic[] = (questionsRes.data ?? []).map((q: any) => ({
    id: q.id,
    sortOrder: q.sort_order ?? 0,
    category: q.category || 'MOVEMENT',
    prompt: q.prompt,
    options: normalizeQuestionOptions(q.options),
  }));

  const allSubs = subsRes.data ?? [];
  const submittedSubs = allSubs.filter((s: any) => s.status === 'submitted');
  const mine = userId ? allSubs.find((s: any) => s.user_id === userId) ?? null : null;

  let rankInfo: { rank: number; isJointRank: boolean } | null = null;
  if (isRoundClosed(round, now) && mine?.status === 'submitted') {
    const ranked = computeStandardCompetitionRanks(
      submittedSubs.map((s: any) => ({
        userId: s.user_id,
        score: s.score ?? 0,
        totalQuestions: questions.length,
        points: s.points_earned ?? 0,
        submittedAt: s.submitted_at,
      }))
    );
    const myRank = ranked.find((r) => r.userId === userId);
    if (myRank) rankInfo = { rank: myRank.rank, isJointRank: myRank.isJointRank };
  }

  const draftAnswers: Record<string, string> =
    mine?.answers && typeof mine.answers === 'object' ? { ...mine.answers } : {};

  return {
    round: mapRoundSummary(round, questions.length, submittedSubs.length, mine, now, rankInfo),
    questions,
    draftAnswers,
  };
}

export async function saveTriviaDraft(
  roundId: string,
  userId: string,
  answers: Record<string, string>,
  now: Date = new Date()
): Promise<{ saved: boolean; answeredCount: number; answers: Record<string, string> }> {
  const { data: round, error: roundErr } = await supabase
    .from(ROUNDS_TABLE)
    .select('id, status, closes_at')
    .eq('id', roundId)
    .maybeSingle();

  if (roundErr) throw roundErr;
  if (!round || round.status === 'draft' || round.status === 'archived') {
    throw { status: 404, message: 'Trivia round not found' };
  }
  if (isRoundClosed(round, now)) {
    throw { status: 400, message: 'This trivia round has already closed' };
  }

  const { data: existing } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('id, status, answers')
    .eq('round_id', roundId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.status === 'submitted') {
    throw { status: 409, message: 'Submitted answers cannot be changed' };
  }

  const cleanedAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim()) {
      cleanedAnswers[k.trim()] = v.trim();
    }
  }

  const { error: upsertErr } = await supabase.from(SUBMISSIONS_TABLE).upsert(
    {
      round_id: roundId,
      user_id: userId,
      answers: cleanedAnswers,
      status: 'draft',
      updated_at: now.toISOString(),
    },
    { onConflict: 'round_id,user_id' }
  );

  if (upsertErr) throw upsertErr;

  return {
    saved: true,
    answeredCount: Object.keys(cleanedAnswers).length,
    answers: cleanedAnswers,
  };
}

export async function submitTriviaAnswers(
  roundId: string,
  userId: string,
  answers: Record<string, string>,
  now: Date = new Date()
): Promise<{
  submitted: boolean;
  roundId: string;
  answeredCount: number;
  closesAt: string;
  notifyOnResults: boolean;
}> {
  const { data: round, error: roundErr } = await supabase
    .from(ROUNDS_TABLE)
    .select('*')
    .eq('id', roundId)
    .maybeSingle();

  if (roundErr) throw roundErr;
  if (!round || round.status === 'draft' || round.status === 'archived') {
    throw { status: 404, message: 'Trivia round not found' };
  }
  if (isRoundClosed(round, now)) {
    throw { status: 400, message: 'This trivia round has already closed' };
  }

  const [existingRes, questionsRes] = await Promise.all([
    supabase
      .from(SUBMISSIONS_TABLE)
      .select('id, status, notify_on_results')
      .eq('round_id', roundId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from(QUESTIONS_TABLE)
      .select('id, options, correct_option_id')
      .eq('round_id', roundId),
  ]);

  if (existingRes.error) throw existingRes.error;
  if (questionsRes.error) throw questionsRes.error;

  if (existingRes.data?.status === 'submitted') {
    throw { status: 409, message: 'You have already submitted answers for this round' };
  }

  const questions = questionsRes.data ?? [];
  if (questions.length === 0) {
    throw { status: 400, message: 'Trivia round has no questions' };
  }

  const cleanedAnswers: Record<string, string> = {};
  let score = 0;

  for (const q of questions) {
    const selected = typeof answers?.[q.id] === 'string' ? answers[q.id].trim() : '';
    if (!selected) {
      throw { status: 400, message: 'Please answer all questions before submitting' };
    }
    const validOptions = normalizeQuestionOptions(q.options);
    const matchesOption = validOptions.some((o) => o.id === selected);
    if (!matchesOption) {
      throw { status: 400, message: 'Invalid answer option selected' };
    }
    cleanedAnswers[q.id] = selected;
    if (selected === q.correct_option_id) {
      score += 1;
    }
  }

  const pointsPerQuestion = round.points_per_question ?? 20;
  const pointsEarned = score * pointsPerQuestion;

  const { error: upsertErr } = await supabase.from(SUBMISSIONS_TABLE).upsert(
    {
      round_id: roundId,
      user_id: userId,
      answers: cleanedAnswers,
      status: 'submitted',
      submitted_at: now.toISOString(),
      score,
      points_earned: pointsEarned,
      notify_on_results: Boolean(existingRes.data?.notify_on_results),
      updated_at: now.toISOString(),
    },
    { onConflict: 'round_id,user_id' }
  );

  if (upsertErr) throw upsertErr;

  // Deliberately omit score & pointsEarned from response while round is open
  return {
    submitted: true,
    roundId,
    answeredCount: questions.length,
    closesAt: round.closes_at,
    notifyOnResults: Boolean(existingRes.data?.notify_on_results),
  };
}

export async function setTriviaNotifyPreference(
  roundId: string,
  userId: string,
  notifyOnResults: boolean
): Promise<{ roundId: string; notifyOnResults: boolean }> {
  const { data: existing, error: fetchErr } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('id')
    .eq('round_id', roundId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) {
    throw { status: 404, message: 'No submission found for this round' };
  }

  const { error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .update({ notify_on_results: notifyOnResults, updated_at: new Date().toISOString() })
    .eq('id', existing.id);

  if (error) throw error;
  return { roundId, notifyOnResults };
}

export async function getTriviaResults(
  roundId: string,
  userId: string,
  now: Date = new Date()
): Promise<TriviaResultsResponse | null> {
  const { data: round, error } = await supabase
    .from(ROUNDS_TABLE)
    .select('*')
    .eq('id', roundId)
    .in('status', ['published', 'closed'])
    .maybeSingle();

  if (error) throw error;
  if (!round) return null;

  const [questionsRes, userSubRes] = await Promise.all([
    supabase
      .from(QUESTIONS_TABLE)
      .select('id, sort_order, category, prompt, options, correct_option_id, explanation')
      .eq('round_id', roundId)
      .order('sort_order', { ascending: true }),
    supabase
      .from(SUBMISSIONS_TABLE)
      .select('answers, status, score, points_earned, notify_on_results')
      .eq('round_id', roundId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (questionsRes.error) throw questionsRes.error;
  if (userSubRes.error) throw userSubRes.error;

  const questions = questionsRes.data ?? [];
  const closed = isRoundClosed(round, now);
  const userSub = userSubRes.data ?? null;

  if (!closed) {
    return {
      round: mapRoundSummary(round, questions.length, 0, userSub, now),
      isLocked: true,
      score: 0,
      totalQuestions: questions.length,
      pointsEarned: 0,
      rank: null,
      isJointRank: false,
      participantCount: 0,
      review: [],
    };
  }

  const rankResult = await computeRankForUserInRound(roundId, userId, questions.length);
  const { count: participantCountRes } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .eq('status', 'submitted');

  const participantCount = rankResult?.participantCount ?? participantCountRes ?? 0;
  const userAnswers = userSub?.answers && typeof userSub.answers === 'object' ? userSub.answers : {};

  const review: TriviaQuestionRevealed[] = questions.map((q: any) => {
    const opts = normalizeQuestionOptions(q.options);
    const userOptionId = typeof userAnswers[q.id] === 'string' ? userAnswers[q.id] : null;
    const userOption = opts.find((o) => o.id === userOptionId) ?? null;
    const correctOption = opts.find((o) => o.id === q.correct_option_id) ?? null;

    return {
      id: q.id,
      sortOrder: q.sort_order ?? 0,
      category: q.category || 'MOVEMENT',
      prompt: q.prompt,
      options: opts,
      correctOptionId: q.correct_option_id,
      correctOptionText: correctOption?.text ?? q.correct_option_id,
      explanation: q.explanation || '',
      userOptionId,
      userOptionText: userOption?.text ?? null,
      isCorrect: Boolean(userOptionId && userOptionId === q.correct_option_id),
    };
  });

  const score = userSub?.status === 'submitted' ? (userSub.score ?? 0) : 0;
  const pointsEarned = userSub?.status === 'submitted' ? (userSub.points_earned ?? 0) : 0;

  return {
    round: mapRoundSummary(
      round,
      questions.length,
      participantCount,
      userSub,
      now,
      rankResult ? { rank: rankResult.rank, isJointRank: rankResult.isJointRank } : null
    ),
    isLocked: false,
    score,
    totalQuestions: questions.length,
    pointsEarned,
    rank: rankResult?.rank ?? null,
    isJointRank: rankResult?.isJointRank ?? false,
    participantCount,
    review,
  };
}

export async function getTriviaLeaderboard(
  scope: 'week' | 'all_time',
  userId?: string,
  roundId?: string,
  now: Date = new Date()
): Promise<TriviaLeaderboardResponse> {
  if (scope === 'all_time') {
    const { data: closedRounds, error: roundsErr } = await supabase
      .from(ROUNDS_TABLE)
      .select('id, points_per_question, status, closes_at')
      .in('status', ['published', 'closed']);

    if (roundsErr) {
      if (isMissingTableError(roundsErr)) {
        return {
          scope: 'all_time',
          roundId: null,
          weekLabel: 'All time',
          weekNumber: null,
          isLocked: false,
          closesAt: null,
          participantCount: 0,
          pointsPerQuestion: 20,
          currentUserEntry: null,
          standings: [],
        };
      }
      throw roundsErr;
    }

    const revealedRoundIds = (closedRounds ?? [])
      .filter((r: any) => isRoundClosed(r, now))
      .map((r: any) => r.id);

    if (revealedRoundIds.length === 0) {
      return {
        scope: 'all_time',
        roundId: null,
        weekLabel: 'All time',
        weekNumber: null,
        isLocked: false,
        closesAt: null,
        participantCount: 0,
        pointsPerQuestion: 20,
        currentUserEntry: null,
        standings: [],
      };
    }

    const [subsRes, questionsRes] = await Promise.all([
      supabase
        .from(SUBMISSIONS_TABLE)
        .select('round_id, user_id, score, points_earned, submitted_at')
        .in('round_id', revealedRoundIds)
        .eq('status', 'submitted'),
      supabase.from(QUESTIONS_TABLE).select('round_id').in('round_id', revealedRoundIds),
    ]);

    if (subsRes.error) throw subsRes.error;
    if (questionsRes.error) throw questionsRes.error;

    const qCountByRound = new Map<string, number>();
    for (const q of questionsRes.data ?? []) {
      qCountByRound.set(q.round_id, (qCountByRound.get(q.round_id) ?? 0) + 1);
    }

    const totalsByUser = new Map<string, RankableRow>();
    for (const sub of subsRes.data ?? []) {
      const existing = totalsByUser.get(sub.user_id);
      const qCount = qCountByRound.get(sub.round_id) ?? 0;
      if (existing) {
        existing.score += sub.score ?? 0;
        existing.totalQuestions += qCount;
        existing.points += sub.points_earned ?? 0;
        existing.roundsPlayed = (existing.roundsPlayed ?? 0) + 1;
      } else {
        totalsByUser.set(sub.user_id, {
          userId: sub.user_id,
          score: sub.score ?? 0,
          totalQuestions: qCount,
          points: sub.points_earned ?? 0,
          roundsPlayed: 1,
          submittedAt: sub.submitted_at,
        });
      }
    }

    const ranked = computeStandardCompetitionRanks(Array.from(totalsByUser.values()));
    const profilesMap = await fetchProfilesMap(ranked.map((r) => r.userId));

    const standings: TriviaStandingEntry[] = ranked.map((r) => {
      const profile = profilesMap.get(r.userId);
      const isCurrentUser = Boolean(userId && r.userId === userId);
      return {
        rank: r.rank,
        isJointRank: r.isJointRank,
        userId: r.userId,
        displayName: isCurrentUser ? 'You' : resolveProfileDisplayName(profile),
        username: profile?.username ?? null,
        photoUrl: profile?.photo_url || profile?.photo_base64 || null,
        avatarId: profile?.avatar_id ?? null,
        score: r.score,
        totalQuestions: r.totalQuestions,
        points: r.points,
        roundsPlayed: r.roundsPlayed ?? 1,
        isCurrentUser,
      };
    });

    const currentUserEntry = standings.find((s) => s.isCurrentUser) ?? null;

    return {
      scope: 'all_time',
      roundId: null,
      weekLabel: 'All time',
      weekNumber: null,
      isLocked: false,
      closesAt: null,
      participantCount: standings.length,
      pointsPerQuestion: 20,
      currentUserEntry,
      standings: standings.slice(0, 50),
    };
  }

  // Weekly leaderboard
  let round: any = null;
  if (roundId) {
    const { data, error } = await supabase
      .from(ROUNDS_TABLE)
      .select('*')
      .eq('id', roundId)
      .in('status', ['published', 'closed'])
      .maybeSingle();
    if (error) throw error;
    round = data;
  } else {
    const { data, error } = await supabase
      .from(ROUNDS_TABLE)
      .select('*')
      .in('status', ['published', 'closed'])
      .lte('starts_at', now.toISOString())
      .order('starts_at', { ascending: false })
      .limit(5);
    if (error) {
      if (isMissingTableError(error)) {
        return {
          scope: 'week',
          roundId: null,
          weekLabel: 'This week',
          weekNumber: null,
          isLocked: false,
          closesAt: null,
          participantCount: 0,
          pointsPerQuestion: 20,
          currentUserEntry: null,
          standings: [],
        };
      }
      throw error;
    }
    round = data?.[0] ?? null;
  }

  if (!round) {
    return {
      scope: 'week',
      roundId: null,
      weekLabel: 'This week',
      weekNumber: null,
      isLocked: false,
      closesAt: null,
      participantCount: 0,
      pointsPerQuestion: 20,
      currentUserEntry: null,
      standings: [],
    };
  }

  const closed = isRoundClosed(round, now);
  const { count: participantCountRes } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('round_id', round.id)
    .eq('status', 'submitted');

  const weekLabel = round.week_number ? `Week ${round.week_number}` : (round.week_label || 'This week');

  if (!closed) {
    return {
      scope: 'week',
      roundId: round.id,
      weekLabel,
      weekNumber: round.week_number ?? null,
      isLocked: true,
      closesAt: round.closes_at,
      participantCount: participantCountRes ?? 0,
      pointsPerQuestion: round.points_per_question ?? 20,
      currentUserEntry: null,
      standings: [],
    };
  }

  const [subsRes, qCountRes] = await Promise.all([
    supabase
      .from(SUBMISSIONS_TABLE)
      .select('user_id, score, points_earned, submitted_at')
      .eq('round_id', round.id)
      .eq('status', 'submitted'),
    supabase
      .from(QUESTIONS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('round_id', round.id),
  ]);

  if (subsRes.error) throw subsRes.error;
  const totalQuestions = qCountRes.count ?? 0;

  const ranked = computeStandardCompetitionRanks(
    (subsRes.data ?? []).map((s: any) => ({
      userId: s.user_id,
      score: s.score ?? 0,
      totalQuestions,
      points: s.points_earned ?? 0,
      submittedAt: s.submitted_at,
    }))
  );

  const profilesMap = await fetchProfilesMap(ranked.map((r) => r.userId));
  const standings: TriviaStandingEntry[] = ranked.map((r) => {
    const profile = profilesMap.get(r.userId);
    const isCurrentUser = Boolean(userId && r.userId === userId);
    return {
      rank: r.rank,
      isJointRank: r.isJointRank,
      userId: r.userId,
      displayName: isCurrentUser ? 'You' : resolveProfileDisplayName(profile),
      username: profile?.username ?? null,
      photoUrl: profile?.photo_url || profile?.photo_base64 || null,
      avatarId: profile?.avatar_id ?? null,
      score: r.score,
      totalQuestions,
      points: r.points,
      isCurrentUser,
    };
  });

  const currentUserEntry = standings.find((s) => s.isCurrentUser) ?? null;

  return {
    scope: 'week',
    roundId: round.id,
    weekLabel,
    weekNumber: round.week_number ?? null,
    isLocked: false,
    closesAt: round.closes_at,
    participantCount: standings.length,
    pointsPerQuestion: round.points_per_question ?? 20,
    currentUserEntry,
    standings: standings.slice(0, 50),
  };
}

// ─── Admin Portal Upload & Management ───────────────────────────────────────

function validateAdminQuestions(questions: AdminCreateTriviaQuestionInput[]) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw { status: 400, message: 'At least one question is required' };
  }

  return questions.map((q, index) => {
    if (!q || typeof q.prompt !== 'string' || !q.prompt.trim()) {
      throw { status: 400, message: `Question ${index + 1} requires a prompt` };
    }
    const normalizedOptions = normalizeQuestionOptions(q.options);
    if (normalizedOptions.length < 2) {
      throw { status: 400, message: `Question ${index + 1} requires at least 2 options` };
    }
    const correctId = typeof q.correctOptionId === 'string' ? q.correctOptionId.trim() : '';
    if (!normalizedOptions.some((o) => o.id === correctId)) {
      throw {
        status: 400,
        message: `Question ${index + 1} correctOptionId must match one of its option ids`,
      };
    }

    return {
      sort_order: index,
      category: (typeof q.category === 'string' && q.category.trim().toUpperCase()) || 'MOVEMENT',
      prompt: q.prompt.trim(),
      options: normalizedOptions,
      correct_option_id: correctId,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
    };
  });
}

export async function createAdminTriviaRound(
  input: AdminCreateTriviaRoundInput,
  adminUserId?: string
) {
  if (!input.title || !input.title.trim()) {
    throw { status: 400, message: 'title is required' };
  }
  const closesDate = new Date(input.closesAt);
  if (!input.closesAt || Number.isNaN(closesDate.getTime())) {
    throw { status: 400, message: 'Valid closesAt ISO timestamp is required' };
  }

  const startsDate = input.startsAt ? new Date(input.startsAt) : new Date();
  if (Number.isNaN(startsDate.getTime())) {
    throw { status: 400, message: 'Invalid startsAt ISO timestamp' };
  }

  const validatedQuestions = validateAdminQuestions(input.questions);
  const durationHours =
    typeof input.durationHours === 'number' && input.durationHours > 0
      ? Math.round(input.durationHours)
      : Math.max(1, Math.round((closesDate.getTime() - startsDate.getTime()) / (1000 * 60 * 60)));

  const { data: round, error: roundErr } = await supabase
    .from(ROUNDS_TABLE)
    .insert({
      week_label: input.weekLabel?.trim() || 'THIS WEEK',
      week_number: typeof input.weekNumber === 'number' ? input.weekNumber : null,
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || '',
      duration_hours: durationHours,
      points_per_question:
        typeof input.pointsPerQuestion === 'number' && input.pointsPerQuestion > 0
          ? Math.round(input.pointsPerQuestion)
          : 20,
      starts_at: startsDate.toISOString(),
      closes_at: closesDate.toISOString(),
      status: input.status || 'published',
      created_by: adminUserId || null,
    })
    .select('*')
    .single();

  if (roundErr) throw roundErr;

  const { data: insertedQuestions, error: qErr } = await supabase
    .from(QUESTIONS_TABLE)
    .insert(validatedQuestions.map((q) => ({ ...q, round_id: round.id })))
    .select('*')
    .order('sort_order', { ascending: true });

  if (qErr) throw qErr;

  return {
    ...round,
    questions: insertedQuestions ?? [],
  };
}

export async function listAdminTriviaRounds() {
  const { data: rounds, error } = await supabase
    .from(ROUNDS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!rounds?.length) return [];

  const roundIds = rounds.map((r: any) => r.id);
  const [qRes, subRes] = await Promise.all([
    supabase.from(QUESTIONS_TABLE).select('*').in('round_id', roundIds).order('sort_order', { ascending: true }),
    supabase.from(SUBMISSIONS_TABLE).select('round_id, status').in('round_id', roundIds),
  ]);

  if (qRes.error) throw qRes.error;
  if (subRes.error) throw subRes.error;

  return rounds.map((r: any) => ({
    ...r,
    questions: (qRes.data ?? []).filter((q: any) => q.round_id === r.id),
    participantCount: (subRes.data ?? []).filter((s: any) => s.round_id === r.id && s.status === 'submitted').length,
  }));
}

export async function updateAdminTriviaRound(
  roundId: string,
  input: AdminUpdateTriviaRoundInput
) {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof input.weekLabel === 'string') patch.week_label = input.weekLabel.trim();
  if (input.weekNumber !== undefined) patch.week_number = input.weekNumber;
  if (typeof input.title === 'string' && input.title.trim()) patch.title = input.title.trim();
  if (typeof input.subtitle === 'string') patch.subtitle = input.subtitle.trim();
  if (typeof input.durationHours === 'number' && input.durationHours > 0) patch.duration_hours = Math.round(input.durationHours);
  if (typeof input.pointsPerQuestion === 'number' && input.pointsPerQuestion > 0) patch.points_per_question = Math.round(input.pointsPerQuestion);
  if (typeof input.startsAt === 'string') patch.starts_at = new Date(input.startsAt).toISOString();
  if (typeof input.closesAt === 'string') patch.closes_at = new Date(input.closesAt).toISOString();
  if (input.status) patch.status = input.status;

  const { data: updated, error } = await supabase
    .from(ROUNDS_TABLE)
    .update(patch)
    .eq('id', roundId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!updated) throw { status: 404, message: 'Trivia round not found' };

  if (Array.isArray(input.questions)) {
    const validatedQuestions = validateAdminQuestions(input.questions);
    const { error: delErr } = await supabase.from(QUESTIONS_TABLE).delete().eq('round_id', roundId);
    if (delErr) throw delErr;
    const { data: inserted, error: insErr } = await supabase
      .from(QUESTIONS_TABLE)
      .insert(validatedQuestions.map((q) => ({ ...q, round_id: roundId })))
      .select('*')
      .order('sort_order', { ascending: true });
    if (insErr) throw insErr;
    return { ...updated, questions: inserted ?? [] };
  }

  return updated;
}

export async function deleteAdminTriviaRound(roundId: string) {
  const { error } = await supabase.from(ROUNDS_TABLE).delete().eq('id', roundId);
  if (error) throw error;
  return { id: roundId, deleted: true };
}
