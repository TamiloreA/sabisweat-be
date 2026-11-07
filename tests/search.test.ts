/**
 * Unified Search Filter Engine Tests
 *
 * Validates endpoint logic, text search ranking, trigram similarity,
 * accent insensitivity, location-based club ranking, pagination, and error handling.
 */

import { unaccent, extractWords, trigramSimilarity, search, generateSnippet } from '../src/services/searchService';
import type { SearchResponse, SearchChallengeItem, SearchClubItem, SearchHelpItem } from '../src/models/searchModel';
import { searchRateLimiter } from '../src/middleware/rateLimiter';
import { getPublishedFAQs } from '../src/services/supportService';

// Mock supabase client for unit testing search logic
jest.mock('../src/config/database', () => {
  const mockChallenges = [
    {
      id: 'c1',
      title: 'Eko Runners 10K',
      subtitle: 'Complete 10K around Lagos Island',
      description: 'Morning running challenge for active city runners',
      start_at: new Date(Date.now() - 86400000).toISOString(),
      end_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      is_public: true,
      hero_image_url: 'https://example.com/c1.jpg',
      max_participants: 50,
    },
    {
      id: 'c2',
      title: 'London Marathon Prep',
      subtitle: 'Long distance endurance run',
      description: 'Prepare for 42K with weekly targets',
      start_at: new Date(Date.now() - 86400000).toISOString(),
      end_at: new Date(Date.now() + 86400000 * 20).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      is_public: true,
      hero_image_url: 'https://example.com/c2.jpg',
      max_participants: 100,
    },
    {
      id: 'c3_private',
      title: 'Private Runners Club Secret Challenge',
      subtitle: 'Club members only',
      description: 'Secret challenge',
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      who_can_join: 'club_members', // should be excluded
      leaderboard_visibility: 'private',
      is_public: false,
    },
  ];

  const mockClubs = [
    {
      id: 'club1_ng_lagos',
      name: 'Eko Runners Club',
      tag: 'runners',
      description: 'Community for passionate runners in Lagos',
      location_text: 'Lagos',
      country: 'Nigeria',
      country_code: 'NG',
      regions: ['Lagos'],
      status: 'approved',
      visible: true,
      theme: 'green',
      profile_image_url: 'https://example.com/club1.jpg',
      members_count: 250,
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
    {
      id: 'club2_gb_london',
      name: 'London Runners Club',
      tag: 'runners',
      description: 'UK running enthusiasts',
      location_text: 'London',
      country: 'United Kingdom',
      country_code: 'GB',
      regions: ['London'],
      status: 'approved',
      visible: true,
      theme: 'blue',
      profile_image_url: 'https://example.com/club2.jpg',
      members_count: 500,
      created_at: new Date(Date.now() - 86400000 * 40).toISOString(),
    },
    {
      id: 'club3_ng_abuja',
      name: 'Abuja Runners Club',
      tag: 'runners',
      description: 'Runners squad in the capital',
      location_text: 'Abuja',
      country: 'Nigeria',
      country_code: 'NG',
      regions: ['Abuja'],
      status: 'approved',
      visible: true,
      theme: 'orange',
      profile_image_url: 'https://example.com/club3.jpg',
      members_count: 120,
      created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
    {
      id: 'club4_pending',
      name: 'Pending Run Squad',
      status: 'pending', // should be excluded
      visible: true,
    },
  ];

    const mockFaqs = [
      {
        id: 'faq1',
        question: 'How to create or join a Club',
        answer: 'Learn how to request access or build your own community. Navigate to the Clubs tab, explore available clubs or tap Create Club to start your own.',
        category: 'Clubs',
        order: 1,
        is_published: true,
        url: '/help/how-to-join-a-club',
        updated_at: '2026-11-01T12:00:00Z',
      },
      {
        id: 'faq2',
        question: 'How do I earn Sabi coins?',
        answer: 'You earn Sabi coins by completing daily step goals, joining challenges, and participating in clubs.',
        category: 'Rewards',
        order: 2,
        is_published: true,
        url: '/help/how-to-earn-sabi-coins',
        updated_at: '2026-11-01T12:00:00Z',
      },
      {
        id: 'faq3_unpublished',
        question: 'Internal admin secrets',
        answer: 'Do not publish this',
        category: 'Admin',
        order: 99,
        is_published: false,
        updated_at: '2026-11-01T12:00:00Z',
      },
    ];

    return {
      supabase: {
        from: jest.fn((table: string) => {
          if (table === 'challenges') {
            return {
              select: jest.fn().mockReturnThis(),
              gte: jest.fn().mockReturnThis(),
              order: jest.fn().mockResolvedValue({ data: mockChallenges, error: null }),
            };
          }
          if (table === 'clubs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockResolvedValue({ data: mockClubs, error: null }),
            };
          }
          if (table === 'faqs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockResolvedValue({ data: mockFaqs, error: null }),
            };
          }
          if (table === 'challenge_participants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              is: jest.fn().mockResolvedValue({ count: 18, error: null }),
            };
          }
          if (table === 'club_members') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockResolvedValue({ count: 250, error: null }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    },
  };
});

describe('Search Filter Engine - Unit Tests', () => {
  describe('Text Processing & Similarity Helpers', () => {
    it('strips accents correctly (unaccent)', () => {
      expect(unaccent('Ekò')).toBe('Eko');
      expect(unaccent('Café')).toBe('Cafe');
      expect(unaccent('naïve')).toBe('naive');
      expect(unaccent('')).toBe('');
    });

    it('extracts alphanumeric words', () => {
      expect(extractWords('Eko Runners Club!')).toEqual(['eko', 'runners', 'club']);
      expect(extractWords('10 & 20K Steps')).toEqual(['10', '20k', 'steps']);
      expect(extractWords('')).toEqual([]);
    });

    it('calculates trigram similarity with typo tolerance', () => {
      const exactSim = trigramSimilarity('runners', 'runners');
      expect(exactSim).toBe(1);

      // 1-character typo (e.g. runnerz vs runners)
      const typoSim = trigramSimilarity('runnerz', 'runners');
      expect(typoSim).toBeGreaterThan(0.4);

      // completely different words
      const diffSim = trigramSimilarity('swimming', 'runners');
      expect(diffSim).toBeLessThan(0.15);
    });

    it('tolerates accented characters in trigram similarity', () => {
      const sim = trigramSimilarity('Ekò Runners', 'Eko Runners');
      expect(sim).toBe(1);
    });
  });

  describe('Search Execution & Matching Logic', () => {
    it('returns results grouped by resource type and metadata', async () => {
      const response: SearchResponse = await search({
        q: 'running',
        types: ['challenges', 'clubs'],
        limit: 15,
        offset: 0,
      });

      expect(response.query).toBe('running');
      expect(response.types).toEqual(['challenges', 'clubs']);
      expect(response.results.challenges).toBeDefined();
      expect(response.results.clubs).toBeDefined();
      expect(typeof response.meta.took_ms).toBe('number');
      expect(response.meta.limit).toBe(15);
      expect(response.meta.offset).toBe(0);
    });

    it('filters only requested resource types (challenges only)', async () => {
      const response = await search({
        q: 'marathon',
        types: ['challenges'],
        limit: 10,
        offset: 0,
      });

      expect(response.types).toEqual(['challenges']);
      expect(response.results.challenges).toBeDefined();
      expect(response.results.clubs).toBeUndefined();
    });

    it('filters only requested resource types (clubs only)', async () => {
      const response = await search({
        q: 'runners',
        types: ['clubs'],
        limit: 10,
        offset: 0,
      });

      expect(response.types).toEqual(['clubs']);
      expect(response.results.clubs).toBeDefined();
      expect(response.results.challenges).toBeUndefined();
    });

    it('excludes private challenges and unapproved clubs', async () => {
      const response = await search({
        q: 'club',
        types: ['challenges', 'clubs'],
        limit: 20,
        offset: 0,
      });

      const challengeIds = response.results.challenges?.items.map((c) => c.id) || [];
      expect(challengeIds).not.toContain('c3_private');

      const clubIds = response.results.clubs?.items.map((cl) => cl.id) || [];
      expect(clubIds).not.toContain('club4_pending');
    });

    it('prioritizes exact name matches above partial matches', async () => {
      const response = await search({
        q: 'Eko Runners Club',
        types: ['clubs'],
        limit: 10,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('club1_ng_lagos');
    });

    it('ranks clubs by location priority (same country & region first)', async () => {
      // Both club1 (Lagos, NG) and club3 (Abuja, NG) and club2 (London, GB) match 'runners'
      // When user specifies country=NG and region=Lagos:
      const response = await search({
        q: 'runners',
        types: ['clubs'],
        limit: 10,
        offset: 0,
        country: 'NG',
        region: 'Lagos',
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(1);
      // club1 is in same country AND same region (highest location priority)
      expect(items[0].id).toBe('club1_ng_lagos');
      // club3 is in same country, different region (secondary location priority)
      expect(items[1].id).toBe('club3_ng_abuja');
    });

    it('supports fuzzy matching for queries of 4+ characters (e.g. runnerz)', async () => {
      const response = await search({
        q: 'runnerz',
        types: ['clubs'],
        limit: 10,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((c) => c.name.includes('Runners'))).toBe(true);
    });

    it('supports pagination with limit and offset', async () => {
      const page1 = await search({
        q: 'runners',
        types: ['clubs'],
        limit: 1,
        offset: 0,
      });

      const page2 = await search({
        q: 'runners',
        types: ['clubs'],
        limit: 1,
        offset: 1,
      });

      expect(page1.results.clubs?.items).toHaveLength(1);
      expect(page2.results.clubs?.items).toHaveLength(1);
      expect(page1.results.clubs?.items[0].id).not.toBe(page2.results.clubs?.items[0].id);
      expect(page1.results.clubs?.total).toBe(page2.results.clubs?.total);
    });

    it('maps Challenge item fields according to contract', async () => {
      const response = await search({
        q: 'Eko',
        types: ['challenges'],
        limit: 10,
        offset: 0,
      });

      const item: SearchChallengeItem | undefined = response.results.challenges?.items[0];
      expect(item).toBeDefined();
      expect(item?.type).toBe('challenge');
      expect(item?.title).toBe('Eko Runners 10K');
      expect(item?.subtitle).toBe('Complete 10K around Lagos Island');
      expect(item?.imageUrl).toBe('https://example.com/c1.jpg');
      expect(item?.fallbackImageUrl).toBeDefined();
      expect(item?.startDate).toBeDefined();
      expect(item?.endDate).toBeDefined();
      expect(typeof item?.participantCount).toBe('number');
      expect(item?.status).toBe('active');
    });

    it('maps Club item fields according to contract', async () => {
      const response = await search({
        q: 'Eko',
        types: ['clubs'],
        limit: 10,
        offset: 0,
      });

      const item: SearchClubItem | undefined = response.results.clubs?.items[0];
      expect(item).toBeDefined();
      expect(item?.type).toBe('club');
      expect(item?.name).toBe('Eko Runners Club');
      expect(item?.badgeUrl).toBe('https://example.com/club1.jpg');
      expect(item?.location).toBe('Lagos');
      expect(item?.countryCode).toBe('NG');
      expect(item?.memberCount).toBe(250);
      expect(item?.clubTheme).toBe('green');
      expect(item?.status).toBe('active');
    });
  });

  describe('Search Controller & Validation', () => {
    // Import search controller
    const { search: searchCtrl } = require('../src/controllers/searchController');

    function createMockRes() {
      const res: any = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    }

    it('returns 400 QUERY_REQUIRED when q is missing or empty', async () => {
      const req1: any = { query: {} };
      const res1 = createMockRes();
      await searchCtrl(req1, res1);
      expect(res1.status).toHaveBeenCalledWith(400);
      expect(res1.json).toHaveBeenCalledWith({
        error: 'QUERY_REQUIRED',
        message: 'Search query is required.',
      });

      const req2: any = { query: { q: '   ' } };
      const res2 = createMockRes();
      await searchCtrl(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(400);
      expect(res2.json).toHaveBeenCalledWith({
        error: 'QUERY_REQUIRED',
        message: 'Search query is required.',
      });
    });

    it('returns 400 QUERY_TOO_LONG when q exceeds 100 characters', async () => {
      const req: any = { query: { q: 'a'.repeat(101) } };
      const res = createMockRes();
      await searchCtrl(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'QUERY_TOO_LONG',
        message: 'Query must be 100 characters or fewer.',
      });
    });

    it('returns 400 INVALID_TYPE when an invalid resource type is provided', async () => {
      const req: any = { query: { q: 'running', types: 'challenges,articles' } };
      const res = createMockRes();
      await searchCtrl(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'INVALID_TYPE',
        message: 'Allowed types: challenges, clubs, help.',
      });
    });

    it('returns 200 with valid search response', async () => {
      const req: any = { query: { q: 'running', types: 'challenges,clubs,help', limit: '10', offset: '0' } };
      const res = createMockRes();
      await searchCtrl(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'running',
          types: ['challenges', 'clubs', 'help'],
          results: expect.any(Object),
          meta: expect.objectContaining({ limit: 10, offset: 0 }),
        })
      );
    });
  });

  describe('Help & Support Search & FAQs', () => {
    it('generates clean snippets within 50 to 120 characters', () => {
      const longText =
        'Learn how to request access or build your own community. Navigate to the Clubs tab, explore available clubs or tap Create Club to start your own.';
      const snippet = generateSnippet(longText, 100);
      expect(snippet.length).toBeLessThanOrEqual(105);
      expect(snippet.endsWith('...')).toBe(true);

      const shortText = 'Short preview.';
      expect(generateSnippet(shortText)).toBe('Short preview.');
    });

    it('searches Help FAQs when types=help is requested', async () => {
      const response = await search({
        q: 'Club',
        types: ['help'],
        limit: 10,
        offset: 0,
      });

      expect(response.types).toEqual(['help']);
      expect(response.results.help).toBeDefined();
      expect(response.results.challenges).toBeUndefined();
      expect(response.results.clubs).toBeUndefined();

      const items = response.results.help?.items || [];
      expect(items.length).toBeGreaterThan(0);
      const item: SearchHelpItem = items[0];
      expect(item.type).toBe('help');
      expect(item.title).toBe('How to create or join a Club');
      expect(item.category).toBe('Clubs');
      expect(item.url).toBe('/help/how-to-join-a-club');
      expect(item.snippet).toBeDefined();
    });

    it('excludes unpublished FAQs from search results', async () => {
      const response = await search({
        q: 'Internal admin secrets',
        types: ['help'],
        limit: 10,
        offset: 0,
      });

      const items = response.results.help?.items || [];
      expect(items.some((i) => i.title.includes('admin secrets'))).toBe(false);
    });

    it('fetches published FAQs ordered by order in ascending order', async () => {
      const faqs = await getPublishedFAQs();
      expect(faqs.length).toBeGreaterThan(0);
      expect(faqs.every((f) => f.is_published)).toBe(true);
      expect(faqs[0].order).toBeLessThanOrEqual(faqs[1]?.order ?? 99);
    });
  });

  describe('Rate Limiter Configuration', () => {
    it('is configured with standard express-rate-limit headers', () => {
      expect(searchRateLimiter).toBeDefined();
      expect(typeof searchRateLimiter).toBe('function');
    });
  });
});
