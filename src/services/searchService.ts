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
  SearchClubItem,
  SearchResultGroup,
  SearchResourceType,
} from '../models/searchModel';

const CHALLENGES_TABLE = 'challenges';
const CLUBS_TABLE = 'clubs';
const PARTICIPANTS_TABLE = 'challenge_participants';
const CLUB_MEMBERS_TABLE = 'club_members';

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

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

// ─── Challenge Scoring & Matching ───────────────────────────────

interface ScoredItem<T> {
  item: T;
  score: number;
  matched: boolean;
}

function scoreChallenge(challenge: any, query: string): ScoredItem<any> {
  const normQ = normalizeText(query);
  const qWords = extractWords(query);

  const title = challenge.title || '';
  const subtitle = challenge.subtitle || '';
  const description = challenge.description || '';

  const normTitle = normalizeText(title);
  const normSubtitle = normalizeText(subtitle);
  const normDesc = normalizeText(description);

  const titleWords = extractWords(title);
  const subtitleWords = extractWords(subtitle);
  const descWords = extractWords(description);

  let score = 0;
  let matched = false;

  // 1. Exact match on title (highest priority)
  if (normTitle === normQ) {
    score += 1000;
    matched = true;
  }

  // 2. Prefix match on title
  if (normTitle.startsWith(normQ)) {
    score += 600;
    matched = true;
  } else if (titleWords.some((w) => w.startsWith(normQ))) {
    score += 400;
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

  // 3. Full-text / Word matching (weighted: title > subtitle > description)
  for (const w of qWords) {
    if (titleWords.includes(w)) {
      score += 150;
      matched = true;
    } else if (titleWords.some((tw) => tw.startsWith(w))) {
      score += 100;
      matched = true;
    }

    if (subtitleWords.includes(w)) {
      score += 80;
      matched = true;
    } else if (subtitleWords.some((sw) => sw.startsWith(w))) {
      score += 50;
      matched = true;
    }

    if (descWords.includes(w)) {
      score += 40;
      matched = true;
    }
  }

  // Substring matching
  if (normTitle.includes(normQ)) {
    score += 120;
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

  // 4. Fuzzy matching (Trigram similarity) for queries >= 4 chars
  // Tolerate 1-2 typos (similarity >= 0.28)
  if (normQ.length >= 4) {
    const simTitle = trigramSimilarity(normTitle, normQ);
    const maxWordSim = titleWords.length
      ? Math.max(...titleWords.map((w) => trigramSimilarity(w, normQ)))
      : 0;
    const bestSim = Math.max(simTitle, maxWordSim);

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

// ─── Parallel Participant and Member Count Fetchers ─────────────

async function getChallengeParticipantCount(challengeId: string): Promise<number> {
  const { count, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .is('left_at', null);

  if (error) return 0;
  return count ?? 0;
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
  const { q, types, limit, offset, country, region } = params;

  const results: SearchResults = {};

  const searchTasks: Promise<void>[] = [];

  // Search Challenges if requested
  if (types.includes('challenges')) {
    searchTasks.push(
      (async () => {
        const nowIso = new Date().toISOString();

        // Query eligible challenges: not ended, public visibility
        let query = supabase
          .from(CHALLENGES_TABLE)
          .select('*')
          .gte('end_at', nowIso)
          .order('created_at', { ascending: false });

        const { data: challenges, error } = await query;
        if (error) {
          throw error;
        }

        const eligible = (challenges || []).filter((c: any) => {
          // Exclude soft-deleted
          if (c.deleted_at != null) return false;
          // Exclude private / invite-only challenges
          if (c.who_can_join === 'club_members' || c.leaderboard_visibility === 'private') {
            return false;
          }
          if (c.is_public === false || c.visibility === 'invite_only') {
            return false;
          }
          return true;
        });

        // Score and filter matching challenges
        const scored = eligible
          .map((c) => scoreChallenge(c, q))
          .filter((s) => s.matched)
          .sort((a, b) => b.score - a.score);

        const total = scored.length;
        const pageItems = scored.slice(offset, offset + limit).map((s) => s.item);

        // Fetch participant counts for page items in parallel
        const participantCounts = await Promise.all(
          pageItems.map((c) => getChallengeParticipantCount(c.id))
        );

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

          const imageUrl =
            c.hero_image_base64 || c.hero_image_url || c.challenge_image || '';
          const fallbackImageUrl =
            c.hero_image_url || c.challenge_image || DEFAULT_FALLBACK_IMAGE;

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
        // Query eligible clubs: status approved, visible
        let query = supabase
          .from(CLUBS_TABLE)
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false });

        const { data: clubs, error } = await query;
        if (error) {
          throw error;
        }

        const eligible = (clubs || []).filter((club: any) => {
          // Exclude soft-deleted
          if (club.deleted_at != null) return false;
          // Exclude private clubs
          if (club.is_private === true || club.visible === false) {
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

        // Fetch exact member counts in parallel
        const memberCounts = await Promise.all(
          pageItems.map((club) => getClubMemberCount(club.id, club.members_count || 0))
        );

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
          };
        });

        results.clubs = {
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
