/**
 * Search Service
 *
 * Implements the unified Search Filter Engine across Challenges and Clubs.
 * Uses PostgreSQL Full-Text Search and Trigram Similarity with weighted ranking,
 * location-based club prioritization, recency, and popularity signals.
 */

import { supabase } from '../config/database';
import type {
  SearchQueryParams,
  SearchResponse,
  SearchResults,
  SearchChallengeItem,
  SearchChallengeHostInfo,
  SearchClubItem,
  SearchHelpItem,
  SearchResultGroup,
  SearchResourceType,
} from '../models/searchModel';
import { getPublishedFAQs } from './supportService';
import type { FAQItem } from '../models/supportModel';

const CHALLENGES_TABLE = 'challenges';
const CLUBS_TABLE = 'clubs';
const PARTICIPANTS_TABLE = 'challenge_participants';
const CLUB_MEMBERS_TABLE = 'club_members';

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

// Short-lived in-memory cache so rapid typing keystrokes don't re-scan Supabase every 200ms
const SEARCH_CACHE_TTL_MS = 20_000;
let challengesCatalogCache: {
  expiresAt: number;
  challenges: any[];
  clubsMap: Map<string, { id: string; name: string; profile_image_url?: string | null; theme?: string | null }>;
} | null = null;
let challengesCatalogInFlight: Promise<{
  challenges: any[];
  clubsMap: Map<string, { id: string; name: string; profile_image_url?: string | null; theme?: string | null }>;
}> | null = null;

async function fetchChallengesAndClubsCatalog(): Promise<{
  challenges: any[];
  clubsMap: Map<string, { id: string; name: string; profile_image_url?: string | null; theme?: string | null }>;
}> {
  const useCache = process.env.NODE_ENV !== 'test';
  const nowMs = Date.now();
  if (useCache && challengesCatalogCache && challengesCatalogCache.expiresAt > nowMs) {
    return {
      challenges: challengesCatalogCache.challenges,
      clubsMap: challengesCatalogCache.clubsMap,
    };
  }

  if (useCache && challengesCatalogInFlight) {
    return challengesCatalogInFlight;
  }

  const loadPromise = (async () => {
    const nowIso = new Date().toISOString();
    const baseChallengeColumns = [
      'id',
      'title',
      'subtitle',
      'description',
      'hero_image_url',
      'challenge_image',
      'host_name',
      'host_logo_url',
      'host_club_id',
      'start_at',
      'end_at',
      'created_at',
      'created_by',
      'who_can_join',
      'leaderboard_visibility',
      'max_participants',
      'country',
      'region',
      'city_tag',
    ];
    const extendedChallengeColumns = [
      ...baseChallengeColumns,
      'co_host_club_id',
      'is_official',
    ];

    const runChallengeQuery = async (cols: string[]) =>
      supabase
        .from(CHALLENGES_TABLE)
        .select(cols.join(', '))
        .gte('end_at', nowIso)
        .order('created_at', { ascending: false });

    // Fetch challenges and lightweight clubs list in parallel (1 network hop)
    const clubQuery: any = supabase
      .from(CLUBS_TABLE)
      .select('id, name, profile_image_url, theme');

    const clubsFetchPromise =
      typeof clubQuery.order === 'function'
        ? clubQuery.order('created_at', { ascending: false })
        : clubQuery;

    const [initialChallengeRes, clubsRes] = await Promise.all([
      runChallengeQuery(extendedChallengeColumns),
      clubsFetchPromise,
    ]);

    let challengeRes = initialChallengeRes;
    if (
      challengeRes.error &&
      (challengeRes.error.message?.includes('co_host_club_id') ||
        challengeRes.error.message?.includes('is_official'))
    ) {
      challengeRes = await runChallengeQuery(baseChallengeColumns);
    }

    if (challengeRes.error) {
      throw challengeRes.error;
    }

    const challenges = (challengeRes.data || []) as any[];
    const clubsMap = new Map<
      string,
      { id: string; name: string; profile_image_url?: string | null; theme?: string | null }
    >();
    for (const club of (clubsRes?.data || []) as any[]) {
      if (club?.id) clubsMap.set(club.id, club);
    }

    if (useCache) {
      challengesCatalogCache = {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        challenges,
        clubsMap,
      };
    }

    return { challenges, clubsMap };
  })();

  if (useCache) {
    challengesCatalogInFlight = loadPromise;
  }

  try {
    return await loadPromise;
  } finally {
    if (useCache && challengesCatalogInFlight === loadPromise) {
      challengesCatalogInFlight = null;
    }
  }
}

// ─── Text & Trigram Utilities ───────────────────────────────────

/**
 * Strips diacritics / accents and converts to lowercase.
 * Equivalent to PostgreSQL unaccent(lower(...)).
 */
export function unaccent(str: string): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeText(str: string): string {
  return unaccent(str || '').toLowerCase().trim();
}

/**
 * Extracts alphanumeric words from a string.
 */
export function extractWords(str: string): string[] {
  const norm = normalizeText(str);
  return norm ? norm.split(/[^a-z0-9]+/i).filter(Boolean) : [];
}

/**
 * Generates trigrams for a string using standard PostgreSQL pg_trgm padding (2 leading spaces, 1 trailing space).
 */
export function getTrigrams(str: string): Set<string> {
  const norm = normalizeText(str);
  const padded = `  ${norm} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Computes trigram similarity between two strings (intersection / union).
 * Equivalent to PostgreSQL similarity(unaccent(s1), unaccent(s2)).
 */
export function trigramSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const norm1 = normalizeText(s1);
  const norm2 = normalizeText(s2);
  if (norm1 === norm2) return 1;

  const tri1 = getTrigrams(norm1);
  const tri2 = getTrigrams(norm2);
  if (tri1.size === 0 || tri2.size === 0) return 0;

  let intersection = 0;
  for (const t of tri1) {
    if (tri2.has(t)) intersection++;
  }

  const union = tri1.size + tri2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Generates a short plain-text preview of the answer (50–120 characters).
 */
export function generateSnippet(text: string, maxLength: number = 100): string {
  if (!text) return '';
  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/[#*_`~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maxLength) return clean;

  const truncated = clean.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 40 ? lastSpace : maxLength;
  return clean.slice(0, cutPoint).trim() + '...';
}

// ─── Challenge Scoring & Matching ───────────────────────────────

interface ScoredItem<T> {
  item: T;
  score: number;
  matched: boolean;
}

function scoreChallenge(
  challenge: any,
  query: string,
  hostClubName?: string,
  coHostClubName?: string
): ScoredItem<any> {
  const normQ = normalizeText(query);
  const qWords = extractWords(query);

  const title = challenge.title || '';
  const subtitle = challenge.subtitle || '';
  const description = challenge.description || '';
  const resolvedHostName = hostClubName || challenge.host_name || '';
  const resolvedCoHostName = coHostClubName || '';
  const locationText = [challenge.city_tag, challenge.region, challenge.country]
    .filter(Boolean)
    .join(' ');

  const normTitle = normalizeText(title);
  const normSubtitle = normalizeText(subtitle);
  const normDesc = normalizeText(description);
  const normHost = normalizeText(resolvedHostName);
  const normCoHost = normalizeText(resolvedCoHostName);
  const normLocation = normalizeText(locationText);

  const titleWords = extractWords(title);
  const subtitleWords = extractWords(subtitle);
  const descWords = extractWords(description);
  const hostWords = extractWords(resolvedHostName);
  const coHostWords = extractWords(resolvedCoHostName);
  const allHostWords = [...hostWords, ...coHostWords];

  let score = 0;
  let matched = false;

  // 1. Exact match on title or host club name (highest priority)
  if (normTitle === normQ) {
    score += 1000;
    matched = true;
  } else if ((normHost && normHost === normQ) || (normCoHost && normCoHost === normQ)) {
    score += 550;
    matched = true;
  }

  // 2. Prefix match on title or host
  if (normTitle.startsWith(normQ)) {
    score += 600;
    matched = true;
  } else if (titleWords.some((w) => w.startsWith(normQ))) {
    score += 400;
    matched = true;
  }

  if (normHost && normHost.startsWith(normQ)) {
    score += 320;
    matched = true;
  } else if (normCoHost && normCoHost.startsWith(normQ)) {
    score += 280;
    matched = true;
  } else if (allHostWords.some((w) => w.startsWith(normQ))) {
    score += 220;
    matched = true;
  }

  // Prefix match on subtitle
  if (normSubtitle.startsWith(normQ)) {
    score += 300;
    matched = true;
  } else if (subtitleWords.some((w) => w.startsWith(normQ))) {
    score += 200;
    matched = true;
  }

  // 3. Full-text / Word matching (weighted: title > host/co-host > subtitle > description)
  let matchedQueryWordCount = 0;
  for (const w of qWords) {
    let wordMatched = false;

    if (titleWords.includes(w)) {
      score += 150;
      matched = true;
      wordMatched = true;
    } else if (titleWords.some((tw) => tw.startsWith(w))) {
      score += 100;
      matched = true;
      wordMatched = true;
    }

    if (allHostWords.includes(w)) {
      score += 110;
      matched = true;
      wordMatched = true;
    } else if (allHostWords.some((hw) => hw.startsWith(w))) {
      score += 75;
      matched = true;
      wordMatched = true;
    }

    if (subtitleWords.includes(w)) {
      score += 80;
      matched = true;
      wordMatched = true;
    } else if (subtitleWords.some((sw) => sw.startsWith(w))) {
      score += 50;
      matched = true;
      wordMatched = true;
    }

    if (descWords.includes(w)) {
      score += 40;
      matched = true;
      wordMatched = true;
    }

    // Per-word fuzzy match (e.g., "moving boys" -> "Moving Boyz")
    if (!wordMatched && w.length >= 4) {
      const candidateWords = [...titleWords, ...allHostWords, ...subtitleWords];
      let bestWordSim = 0;
      for (const cw of candidateWords) {
        if (cw.length < 4) continue;
        const sim = trigramSimilarity(cw, w);
        if (sim > bestWordSim) bestWordSim = sim;
      }
      if (bestWordSim >= 0.4) {
        score += Math.round(bestWordSim * 90);
        matched = true;
        wordMatched = true;
      }
    }

    if (wordMatched) {
      matchedQueryWordCount++;
    }
  }

  // Bonus when every word in a multi-word query matches
  if (qWords.length > 1 && matchedQueryWordCount === qWords.length) {
    score += 180;
  }

  // Substring matching
  if (normTitle.includes(normQ)) {
    score += 120;
    matched = true;
  }
  if (normHost && normHost.includes(normQ)) {
    score += 95;
    matched = true;
  }
  if (normCoHost && normCoHost.includes(normQ)) {
    score += 85;
    matched = true;
  }
  if (normSubtitle.includes(normQ)) {
    score += 60;
    matched = true;
  }
  if (normDesc.includes(normQ)) {
    score += 30;
    matched = true;
  }
  if (normLocation && normLocation.includes(normQ)) {
    score += 25;
    matched = true;
  }

  // 4. Fuzzy matching (Trigram similarity) for queries >= 4 chars
  // Tolerate 1-2 typos (similarity >= 0.28)
  if (normQ.length >= 4) {
    const simTitle = trigramSimilarity(normTitle, normQ);
    const simHost = normHost ? trigramSimilarity(normHost, normQ) : 0;
    const simCoHost = normCoHost ? trigramSimilarity(normCoHost, normQ) : 0;
    const candidateWords = [...titleWords, ...allHostWords];
    const maxWordSim = candidateWords.length
      ? Math.max(...candidateWords.map((w) => trigramSimilarity(w, normQ)))
      : 0;
    const bestSim = Math.max(simTitle, simHost, simCoHost, maxWordSim);

    if (bestSim >= 0.28) {
      score += Math.round(bestSim * 80);
      matched = true;
    }
  }

  // 5. Popularity signal (participant_count or max_participants)
  const popularityCount = challenge.max_participants || 0;
  score += Math.min(10, Math.log10(popularityCount + 1) * 2);

  // 6. Recency tiebreaker (created_at)
  if (challenge.created_at) {
    const timeMs = new Date(challenge.created_at).getTime();
    if (!Number.isNaN(timeMs)) {
      score += (timeMs / 1e12) * 0.01;
    }
  }

  return { item: challenge, score, matched };
}

// ─── Club Scoring & Matching ────────────────────────────────────

function scoreClub(
  club: any,
  query: string,
  userCountry?: string,
  userRegion?: string
): ScoredItem<any> {
  const normQ = normalizeText(query);
  const qWords = extractWords(query);

  const name = club.name || '';
  const tag = club.tag || '';
  const description = club.description || '';
  const locationText = club.location_text || '';

  const normName = normalizeText(name);
  const normTag = normalizeText(tag);
  const normDesc = normalizeText(description);
  const normLocation = normalizeText(locationText);

  const nameWords = extractWords(name);
  const tagWords = extractWords(tag);
  const descWords = extractWords(description);
  const locationWords = extractWords(locationText);

  let score = 0;
  let matched = false;

  // 1. Exact match on club name (highest priority)
  if (normName === normQ) {
    score += 1000;
    matched = true;
  }

  // 2. Prefix match on club name
  if (normName.startsWith(normQ)) {
    score += 600;
    matched = true;
  } else if (nameWords.some((w) => w.startsWith(normQ))) {
    score += 400;
    matched = true;
  }

  // Prefix match on club tag
  if (normTag.startsWith(normQ)) {
    score += 300;
    matched = true;
  } else if (tagWords.some((w) => w.startsWith(normQ))) {
    score += 200;
    matched = true;
  }

  // 3. Full-text / Word matching (weighted: name > tag > description/location)
  for (const w of qWords) {
    if (nameWords.includes(w)) {
      score += 150;
      matched = true;
    } else if (nameWords.some((nw) => nw.startsWith(w))) {
      score += 100;
      matched = true;
    }

    if (tagWords.includes(w)) {
      score += 80;
      matched = true;
    } else if (tagWords.some((tw) => tw.startsWith(w))) {
      score += 50;
      matched = true;
    }

    if (descWords.includes(w)) {
      score += 40;
      matched = true;
    }

    if (locationWords.includes(w)) {
      score += 30;
      matched = true;
    }
  }

  // Substring matching
  if (normName.includes(normQ)) {
    score += 120;
    matched = true;
  }
  if (normTag.includes(normQ)) {
    score += 60;
    matched = true;
  }
  if (normDesc.includes(normQ)) {
    score += 30;
    matched = true;
  }
  if (normLocation.includes(normQ)) {
    score += 20;
    matched = true;
  }

  // 4. Fuzzy matching (Trigram similarity) for queries >= 4 chars
  // Tolerate 1-2 typos (similarity >= 0.28)
  if (normQ.length >= 4) {
    const simName = trigramSimilarity(normName, normQ);
    const maxWordSim = nameWords.length
      ? Math.max(...nameWords.map((w) => trigramSimilarity(w, normQ)))
      : 0;
    const bestSim = Math.max(simName, maxWordSim);

    if (bestSim >= 0.28) {
      score += Math.round(bestSim * 80);
      matched = true;
    }
  }

  // 5. Location-Based Club Ranking
  // Ranking priority:
  // 1. Same region and country — highest location priority (+30)
  // 2. Same country, different region — secondary location priority (+15)
  // 3. Other countries — lower location priority (+0)
  if (userCountry || userRegion) {
    const clubCountry = normalizeText(club.country || '');
    const clubCountryCode = normalizeText(club.country_code || '');
    const userNormCountry = userCountry ? normalizeText(userCountry) : '';
    const userNormRegion = userRegion ? normalizeText(userRegion) : '';

    const clubRegions: string[] = Array.isArray(club.regions)
      ? club.regions.map((r: string) => normalizeText(r))
      : [];

    let isSameCountry = false;
    if (userNormCountry) {
      isSameCountry =
        clubCountryCode === userNormCountry ||
        clubCountry === userNormCountry ||
        (Array.isArray(club.countries) &&
          club.countries.some(
            (c: any) =>
              normalizeText(c.countryCode || '') === userNormCountry ||
              normalizeText(c.country || '') === userNormCountry
          ));
    }

    let isSameRegion = false;
    if (userNormRegion) {
      isSameRegion =
        clubRegions.includes(userNormRegion) ||
        normLocation.includes(userNormRegion) ||
        (Array.isArray(club.countries) &&
          club.countries.some(
            (c: any) =>
              Array.isArray(c.regions) &&
              c.regions.some((r: string) => normalizeText(r) === userNormRegion)
          ));
    }

    if (userNormCountry && userNormRegion) {
      if (isSameCountry && isSameRegion) {
        score += 30; // 1. Same region and country
      } else if (isSameCountry) {
        score += 15; // 2. Same country, different region
      }
    } else if (userNormCountry && isSameCountry) {
      score += 15;
    } else if (userNormRegion && isSameRegion) {
      score += 15;
    }
  }

  // 6. Popularity signal (members_count)
  const memberCount = club.members_count || 0;
  score += Math.min(10, Math.log10(memberCount + 1) * 2);

  // 7. Recency tiebreaker (created_at)
  if (club.created_at) {
    const timeMs = new Date(club.created_at).getTime();
    if (!Number.isNaN(timeMs)) {
      score += (timeMs / 1e12) * 0.01;
    }
  }

  return { item: club, score, matched };
}

// ─── Help & Support FAQ Scoring ─────────────────────────────────

function scoreFaq(faq: FAQItem, query: string): ScoredItem<FAQItem> {
  const normQ = normalizeText(query);
  const qWords = extractWords(query);

  const question = faq.question || '';
  const answer = faq.answer || '';
  const category = faq.category || '';

  const normQuestion = normalizeText(question);
  const normAnswer = normalizeText(answer);
  const normCategory = normalizeText(category);

  const questionWords = extractWords(question);
  const answerWords = extractWords(answer);

  let score = 0;
  let matched = false;

  // 1. Exact match on question (highest priority)
  if (normQuestion === normQ) {
    score += 1000;
    matched = true;
  }

  // 2. Prefix match on question
  if (normQuestion.startsWith(normQ)) {
    score += 600;
    matched = true;
  } else if (questionWords.some((w) => w.startsWith(normQ))) {
    score += 400;
    matched = true;
  }

  // 3. Full-text / Word matching (prioritise question over answer)
  for (const w of qWords) {
    if (questionWords.includes(w)) {
      score += 150;
      matched = true;
    } else if (questionWords.some((qw) => qw.startsWith(w))) {
      score += 100;
      matched = true;
    }

    if (answerWords.includes(w)) {
      score += 50;
      matched = true;
    }

    if (normCategory.includes(w)) {
      score += 40;
      matched = true;
    }
  }

  // Substring matching
  if (normQuestion.includes(normQ)) {
    score += 120;
    matched = true;
  }
  if (normAnswer.includes(normQ)) {
    score += 30;
    matched = true;
  }

  // 4. Fuzzy matching (Trigram similarity) for queries >= 4 chars
  if (normQ.length >= 4) {
    const simQuestion = trigramSimilarity(normQuestion, normQ);
    const maxWordSim = questionWords.length
      ? Math.max(...questionWords.map((w) => trigramSimilarity(w, normQ)))
      : 0;
    const bestSim = Math.max(simQuestion, maxWordSim);

    if (bestSim >= 0.28) {
      score += Math.round(bestSim * 80);
      matched = true;
    }
  }

  // 5. Order & Recency tiebreakers
  score += Math.max(0, 10 - (faq.order || 0));

  if (faq.updated_at) {
    const timeMs = new Date(faq.updated_at).getTime();
    if (!Number.isNaN(timeMs)) {
      score += (timeMs / 1e12) * 0.01;
    }
  }

  return { item: faq, score, matched };
}

// ─── Parallel Participant and Member Count Fetchers ─────────────

async function getChallengeParticipantCountsBatch(challengeIds: string[]): Promise<number[]> {
  if (challengeIds.length === 0) return [];

  const q: any = supabase
    .from(PARTICIPANTS_TABLE)
    .select('challenge_id');

  if (typeof q.in === 'function') {
    const { data, error } = await q.in('challenge_id', challengeIds).is('left_at', null);
    if (!error && Array.isArray(data)) {
      const countsMap = new Map<string, number>();
      for (const row of data as any[]) {
        if (row?.challenge_id) {
          countsMap.set(row.challenge_id, (countsMap.get(row.challenge_id) || 0) + 1);
        }
      }
      return challengeIds.map((id) => countsMap.get(id) || 0);
    }
  }

  return Promise.all(challengeIds.map((id) => getChallengeParticipantCount(id)));
}

async function getChallengeParticipantCount(challengeId: string): Promise<number> {
  const { count, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (error) return 0;
  return count ?? 0;
}

async function getClubMemberCountsBatch(clubs: any[]): Promise<number[]> {
  if (clubs.length === 0) return [];
  const clubIds = clubs.map((c) => c.id);
  const q: any = supabase.from(CLUB_MEMBERS_TABLE).select('club_id');

  if (typeof q.in === 'function') {
    const { data, error } = await q.in('club_id', clubIds);
    if (!error && Array.isArray(data)) {
      const countsMap = new Map<string, number>();
      for (const row of data as any[]) {
        if (row?.club_id) {
          countsMap.set(row.club_id, (countsMap.get(row.club_id) || 0) + 1);
        }
      }
      return clubs.map((c) => countsMap.get(c.id) ?? c.members_count ?? 0);
    }
  }

  return Promise.all(
    clubs.map((club) => getClubMemberCount(club.id, club.members_count || 0))
  );
}

async function getClubMemberCount(clubId: string, fallbackCount: number = 0): Promise<number> {
  const { count, error } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId);

  if (error) return fallbackCount;
  return count ?? fallbackCount;
}

// ─── Main Search Execution ──────────────────────────────────────

export async function search(params: SearchQueryParams): Promise<SearchResponse> {
  const startTime = Date.now();
  const { q, types, limit, offset, country, region, excludeClubId, userId } = params;

  const results: SearchResults = {};

  const searchTasks: Promise<void>[] = [];

  // Search Challenges if requested
  if (types.includes('challenges')) {
    searchTasks.push(
      (async () => {
        const nowIso = new Date().toISOString();

        // Fetch cached/parallel challenges + clubs catalog AND user memberships concurrently
        const userAccessPromise = userId
          ? Promise.all([
              supabase.from(CLUB_MEMBERS_TABLE).select('club_id').eq('user_id', userId),
              supabase
                .from(PARTICIPANTS_TABLE)
                .select('challenge_id')
                .eq('user_id', userId)
                .is('left_at', null),
            ])
          : Promise.resolve(null);

        const [{ challenges, clubsMap }, userAccessRes] = await Promise.all([
          fetchChallengesAndClubsCatalog(),
          userAccessPromise,
        ]);

        const userClubIds = new Set<string>();
        const userJoinedChallengeIds = new Set<string>();
        if (userAccessRes) {
          const [membershipsRes, participationsRes] = userAccessRes;
          if (Array.isArray(membershipsRes?.data)) {
            for (const row of membershipsRes.data as any[]) {
              if (row?.club_id) userClubIds.add(row.club_id);
            }
          }
          if (Array.isArray(participationsRes?.data)) {
            for (const row of participationsRes.data as any[]) {
              if (row?.challenge_id) userJoinedChallengeIds.add(row.challenge_id);
            }
          }
        }

        const eligible = challenges.filter((c: any) => {
          // Exclude expired, soft-deleted, or explicitly non-public/invite-only challenges
          if (c.end_at && new Date(c.end_at).getTime() < Date.now()) return false;
          if (c.deleted_at != null) return false;
          if (c.is_public === false || c.visibility === 'invite_only') {
            return false;
          }

          if (c.who_can_join === 'club_members') {
            if (!userId) return false;
            const isCreator = c.created_by === userId;
            const isJoined = userJoinedChallengeIds.has(c.id);
            const isHostMember = Boolean(c.host_club_id && userClubIds.has(c.host_club_id));
            const isCoHostMember = Boolean(c.co_host_club_id && userClubIds.has(c.co_host_club_id));
            if (!isCreator && !isJoined && !isHostMember && !isCoHostMember) {
              return false;
            }
          }

          if (c.leaderboard_visibility === 'private') {
            if (!userId) return false;
            const isCreator = c.created_by === userId;
            const isJoined = userJoinedChallengeIds.has(c.id);
            if (!isCreator && !isJoined) {
              return false;
            }
          }

          return true;
        });

        // Score and filter matching challenges (including host & co-host club names)
        const scored = eligible
          .map((c) => {
            const hostClub = c.host_club_id ? clubsMap.get(c.host_club_id) : undefined;
            const coHostClub = c.co_host_club_id ? clubsMap.get(c.co_host_club_id) : undefined;
            return scoreChallenge(c, q, hostClub?.name, coHostClub?.name);
          })
          .filter((s) => s.matched)
          .sort((a, b) => b.score - a.score);

        const total = scored.length;
        const pageItems = scored.slice(offset, offset + limit).map((s) => s.item);

        // Fetch base64 fallback images (if needed) and participant counts in 1 parallel batch
        const idsNeedingBase64 = pageItems
          .filter((c: any) => !c.hero_image_base64 && !c.hero_image_url && !c.challenge_image)
          .map((c: any) => c.id);

        const base64Promise = (async () => {
          const map = new Map<string, string>();
          if (idsNeedingBase64.length === 0) return map;
          const base64Query: any = supabase
            .from(CHALLENGES_TABLE)
            .select('id, hero_image_base64');
          if (typeof base64Query.in === 'function') {
            const { data: base64Rows } = await base64Query.in('id', idsNeedingBase64);
            for (const row of base64Rows || []) {
              if (row?.id && row?.hero_image_base64) {
                map.set(row.id, row.hero_image_base64);
              }
            }
          }
          return map;
        })();

        const [base64Map, participantCounts] = await Promise.all([
          base64Promise,
          getChallengeParticipantCountsBatch(pageItems.map((c) => c.id)),
        ]);

        const now = new Date();
        const items: SearchChallengeItem[] = pageItems.map((c, idx) => {
          const startDate = c.start_at || nowIso;
          const endDate = c.end_at || nowIso;
          const start = new Date(startDate);
          const end = new Date(endDate);

          let status = 'active';
          if (now < start) {
            status = 'upcoming';
          } else if (now > end) {
            status = 'completed';
          }

          const resolvedBase64 = c.hero_image_base64 || base64Map.get(c.id);
          const imageUrl =
            resolvedBase64 || c.hero_image_url || c.challenge_image || '';
          const fallbackImageUrl =
            c.hero_image_url || c.challenge_image || DEFAULT_FALLBACK_IMAGE;

          const hostClub = c.host_club_id ? clubsMap.get(c.host_club_id) : undefined;
          const coHostClub = c.co_host_club_id ? clubsMap.get(c.co_host_club_id) : undefined;

          const host: SearchChallengeHostInfo | undefined =
            hostClub || c.host_name || c.host_club_id
              ? {
                  name: hostClub?.name || c.host_name || '',
                  logoUrl: hostClub?.profile_image_url ?? c.host_logo_url ?? undefined,
                  clubId: hostClub?.id ?? c.host_club_id ?? undefined,
                  theme: hostClub?.theme || (c.is_official ? 'green' : undefined),
                }
              : undefined;

          const coHost: SearchChallengeHostInfo | undefined = coHostClub
            ? {
                name: coHostClub.name,
                logoUrl: coHostClub.profile_image_url ?? undefined,
                clubId: coHostClub.id,
                theme: coHostClub.theme || undefined,
              }
            : undefined;

          return {
            id: c.id,
            type: 'challenge',
            title: c.title || '',
            subtitle: c.subtitle || '',
            imageUrl,
            fallbackImageUrl,
            startDate,
            endDate,
            participantCount: participantCounts[idx],
            status,
            isOfficial: Boolean(c.is_official),
            ...(host ? { host } : {}),
            ...(coHost ? { coHost, coHosts: [coHost] } : {}),
          };
        });

        results.challenges = {
          total,
          items,
        };
      })()
    );
  }

  // Search Clubs if requested
  if (types.includes('clubs')) {
    searchTasks.push(
      (async () => {
        // Query eligible clubs: status approved OR (pending AND created_by user)
        let query = supabase.from(CLUBS_TABLE).select('*');

        if (userId) {
          query = query.or(`status.eq.approved,and(status.eq.pending,created_by.eq.${userId})`);
        } else {
          query = query.eq('status', 'approved');
        }

        const { data: clubs, error } = await query.order('created_at', { ascending: false });
        if (error) {
          throw error;
        }

        const eligible = (clubs || []).filter((club: any) => {
          // Exclude soft-deleted
          if (club.deleted_at != null) return false;
          // Exclude invisible or invite-only clubs
          if (club.visible === false || club.is_invite_only === true) {
            return false;
          }
          // Exclude specified club if excludeClubId provided (e.g. primary host club)
          if (excludeClubId && (club.id === excludeClubId || club.tag === excludeClubId)) {
            return false;
          }
          return true;
        });

        // Score and filter matching clubs with location boost
        const scored = eligible
          .map((club) => scoreClub(club, q, country, region))
          .filter((s) => s.matched)
          .sort((a, b) => b.score - a.score);

        const total = scored.length;
        const pageItems = scored.slice(offset, offset + limit).map((s) => s.item);

        // Fetch exact member counts in 1 batched query
        const memberCounts = await getClubMemberCountsBatch(pageItems);

        const items: SearchClubItem[] = pageItems.map((club, idx) => {
          const badgeUrl =
            club.profile_image_url || club.cover_image_url || '';
          const location =
            club.location_text ||
            (Array.isArray(club.regions) && club.regions[0]) ||
            club.country ||
            '';
          const countryCode = club.country_code || club.country || '';

          return {
            id: club.id,
            type: 'club',
            name: club.name || '',
            badgeUrl,
            location,
            countryCode,
            memberCount: memberCounts[idx],
            clubTheme: club.theme || 'green',
            status: 'active',
            isOfficial: Boolean(club.is_official),
          };
        });

        results.clubs = {
          total,
          items,
        };
      })()
    );
  }

  // Search Help & Support FAQs if requested
  if (types.includes('help')) {
    searchTasks.push(
      (async () => {
        const faqs = await getPublishedFAQs();

        // Score and filter matching FAQs
        const scored = faqs
          .map((faq) => scoreFaq(faq, q))
          .filter((s) => s.matched)
          .sort((a, b) => b.score - a.score);

        const total = scored.length;
        const pageItems = scored.slice(offset, offset + limit).map((s) => s.item);

        const items: SearchHelpItem[] = pageItems.map((faq) => ({
          id: faq.id,
          type: 'help',
          title: faq.question,
          snippet: generateSnippet(faq.answer),
          category: faq.category || 'General',
          url: faq.url || undefined,
        }));

        results.help = {
          total,
          items,
        };
      })()
    );
  }

  await Promise.all(searchTasks);

  const took_ms = Date.now() - startTime;

  return {
    query: q,
    types,
    results,
    meta: {
      took_ms,
      limit,
      offset,
    },
  };
}
