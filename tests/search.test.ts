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
      who_can_join: 'club_members', // should be excluded for non-members
      leaderboard_visibility: 'private',
      is_public: false,
    },
    {
      id: 'c4_cohosted',
      title: 'Sunrise 21-Day Streak',
      subtitle: 'Joint city step sprint',
      description: 'Stay consistent for 21 days',
      host_club_id: 'club8_moving_boyz',
      co_host_club_id: 'club1_ng_lagos',
      start_at: new Date(Date.now() - 86400000).toISOString(),
      end_at: new Date(Date.now() + 86400000 * 14).toISOString(),
      created_at: new Date(Date.now() - 86400000).toISOString(),
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      is_public: true,
      hero_image_url: 'https://example.com/c4.jpg',
      max_participants: 300,
    },
    {
      id: 'c5_club_only',
      title: 'Moving Boyz Members Only Cup',
      subtitle: 'Exclusive squad challenge',
      description: 'Members cup',
      host_club_id: 'club8_moving_boyz',
      start_at: new Date(Date.now() - 86400000).toISOString(),
      end_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      created_at: new Date().toISOString(),
      who_can_join: 'club_members',
      leaderboard_visibility: 'public',
      hero_image_url: 'https://example.com/c5.jpg',
      max_participants: 80,
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
      is_private: true, // Specifically private membership — must still be searchable
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
      description: 'UK runners enthusiasts',
      location_text: 'London',
      country: 'United Kingdom',
      country_code: 'GB',
      regions: ['London'],
      status: 'approved',
      is_private: true,
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
      is_private: false,
      visible: true,
      theme: 'orange',
      profile_image_url: 'https://example.com/club3.jpg',
      members_count: 120,
      created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
    {
      id: 'club4_pending',
      name: 'Pending Run Squad',
      tag: 'pending',
      status: 'pending',
      created_by: 'user_creator_123',
      visible: true,
    },
    {
      id: 'club5_invite_only',
      name: 'Secret Invite Runners',
      tag: 'invite',
      status: 'approved',
      is_invite_only: true,
      visible: true,
    },
    {
      id: 'club6_soft_deleted',
      name: 'Deleted Runners Club',
      tag: 'deleted',
      status: 'approved',
      visible: false,
    },
    {
      id: 'club7_global',
      name: 'Global Striders Club',
      tag: 'global',
      description: 'Worldwide running collective',
      location_text: 'Global',
      location_scope: 'global',
      status: 'approved',
      visible: true,
      theme: 'purple',
      members_count: 1000,
      created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    },
    {
      id: 'club8_moving_boyz',
      name: 'Moving Boyz',
      tag: 'moving_boyz',
      description: 'Lagos morning walkers',
      location_text: 'Lagos',
      status: 'approved',
      visible: true,
      theme: 'orange',
      profile_image_url: 'https://example.com/moving_boyz.jpg',
      members_count: 90,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
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

    const mockPosts = [
      {
        id: 'post1_public',
        title: 'Morning 10K Done!',
        description: 'Crushed 10,000 steps before breakfast #MorningRun',
        tag: 'Sabi Sweat',
        tags: ['Sabi Sweat', 'Hydration'],
        images_url: ['https://example.com/post1.jpg'],
        author_id: 'author_tammy',
        club_id: null,
        shares_count: 2,
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'post2_club_only',
        title: 'Moving Boyz Sunday Meetup',
        description: 'Meet at Lekki phase 1 gate at 6am',
        tag: 'Challenge',
        tags: ['Challenge'],
        images_url: [],
        author_id: 'author_alex',
        club_id: 'club8_moving_boyz',
        shares_count: 0,
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ];

    const mockProfiles = [
      {
        id: 'author_tammy',
        username: 'tammy_akin',
        first_name: 'Tammy',
        last_name: 'Akin',
        photo_url: 'https://example.com/tammy.jpg',
        avatar_id: 'av1',
      },
      {
        id: 'author_alex',
        username: 'alex_stride',
        first_name: 'Alex',
        last_name: 'Stride',
        photo_url: null,
        avatar_id: 'av2',
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
              eq: jest.fn((field: string, val: any) => {
                const filtered = mockClubs.filter((c: any) => c[field] === val);
                return {
                  order: jest.fn().mockResolvedValue({ data: filtered, error: null }),
                };
              }),
              or: jest.fn((orClause: string) => {
                const match = orClause.match(/created_by\.eq\.([a-zA-Z0-9_-]+)/);
                const uid = match ? match[1] : null;
                const filtered = mockClubs.filter(
                  (c: any) => c.status === 'approved' || (c.status === 'pending' && c.created_by === uid)
                );
                return {
                  order: jest.fn().mockResolvedValue({ data: filtered, error: null }),
                };
              }),
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
              eq: jest.fn((field: string, val: any) => {
                if (field === 'user_id') {
                  const rows = val === 'member_moving_boyz'
                    ? [{ club_id: 'club8_moving_boyz' }]
                    : [];
                  return Promise.resolve({ data: rows, error: null });
                }
                return Promise.resolve({ count: 250, error: null });
              }),
            };
          }
          if (table === 'posts') {
            return {
              select: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: mockPosts, error: null }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: jest.fn().mockReturnThis(),
              in: jest.fn().mockResolvedValue({ data: mockProfiles, error: null }),
            };
          }
          if (table === 'community_likes') {
            return {
              select: jest.fn().mockReturnThis(),
              in: jest.fn().mockResolvedValue({
                data: [{ post_id: 'post1_public', user_id: 'author_tammy' }],
                error: null,
              }),
            };
          }
          if (table === 'community_comments') {
            return {
              select: jest.fn().mockReturnThis(),
              in: jest.fn().mockResolvedValue({
                data: [{ post_id: 'post1_public' }, { post_id: 'post1_public' }],
                error: null,
              }),
            };
          }
          if (table === 'community_poll_options' || table === 'community_poll_votes') {
            return {
              select: jest.fn().mockReturnThis(),
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
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

    it('matches challenges by host club name, co-host club name, and multi-word fuzzy query, and includes host/coHost', async () => {
      // Search "moving boys" (typo for "Moving Boyz" host club of c4_cohosted)
      const byHostRes = await search({
        q: 'moving boys',
        types: ['challenges'],
        limit: 10,
        offset: 0,
      });

      const hostItems = byHostRes.results.challenges?.items || [];
      expect(hostItems.some((c) => c.id === 'c4_cohosted')).toBe(true);
      const matched = hostItems.find((c) => c.id === 'c4_cohosted');
      expect(matched?.host?.name).toBe('Moving Boyz');
      expect(matched?.coHost?.name).toBe('Eko Runners Club');
      expect(matched?.coHosts?.[0]?.name).toBe('Eko Runners Club');

      // Search by co-host club name
      const byCoHostRes = await search({
        q: 'Eko Runners',
        types: ['challenges'],
        limit: 10,
        offset: 0,
      });
      expect(byCoHostRes.results.challenges?.items.some((c) => c.id === 'c4_cohosted')).toBe(true);
    });

    it('shows club_members challenges in search only to members of the host/co-host club', async () => {
      const nonMemberRes = await search({
        q: 'Moving Boyz Members Only Cup',
        types: ['challenges'],
        limit: 10,
        offset: 0,
        userId: 'random_non_member',
      });
      expect(nonMemberRes.results.challenges?.items.some((c) => c.id === 'c5_club_only')).toBe(false);

      const memberRes = await search({
        q: 'Moving Boyz Members Only Cup',
        types: ['challenges'],
        limit: 10,
        offset: 0,
        userId: 'member_moving_boyz',
      });
      expect(memberRes.results.challenges?.items.some((c) => c.id === 'c5_club_only')).toBe(true);
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

  describe('Club Search Regression & Scenarios (Prompt Compliance)', () => {
    it('Scenario 1: Exact club name match', async () => {
      const response = await search({
        q: 'Eko Runners Club',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].name).toBe('Eko Runners Club');
      expect(items[0].id).toBe('club1_ng_lagos');
    });

    it('Scenario 2: Partial club name match', async () => {
      const response = await search({
        q: 'Runners',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((c) => c.name.includes('Runners'))).toBe(true);
    });

    it('Scenario 3: Different casing (upper, lower, mixed)', async () => {
      const lowerRes = await search({
        q: 'eko runners club',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });
      const upperRes = await search({
        q: 'EKO RUNNERS CLUB',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });
      const mixedRes = await search({
        q: 'eKo RuNnErS',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      expect(lowerRes.results.clubs?.items[0]?.id).toBe('club1_ng_lagos');
      expect(upperRes.results.clubs?.items[0]?.id).toBe('club1_ng_lagos');
      expect(mixedRes.results.clubs?.items[0]?.id).toBe('club1_ng_lagos');
    });

    it('Scenario 4: Requests with both country and region', async () => {
      const response = await search({
        q: 'Runners',
        types: ['clubs'],
        limit: 15,
        offset: 0,
        country: 'NG',
        region: 'Lagos',
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      // Club in NG + Lagos ranks first due to location boost (+30)
      expect(items[0].id).toBe('club1_ng_lagos');
    });

    it('Scenario 5: Requests with only country', async () => {
      const response = await search({
        q: 'Runners',
        types: ['clubs'],
        limit: 15,
        offset: 0,
        country: 'GB',
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      // Club in GB ranks first due to country boost (+15)
      expect(items[0].id).toBe('club2_gb_london');
    });

    it('Scenario 6: Requests with neither country nor region', async () => {
      const response = await search({
        q: 'Runners',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(response.results.clubs?.total).toBeGreaterThanOrEqual(3);
    });

    it('Scenario 7: Global clubs with country and region parameters present', async () => {
      // Searching for 'Global' with NG/Lagos location specified should NOT exclude global club
      const response = await search({
        q: 'Global Striders',
        types: ['clubs'],
        limit: 15,
        offset: 0,
        country: 'NG',
        region: 'Lagos',
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('club7_global');
      expect(items[0].name).toBe('Global Striders Club');
    });

    it('Scenario 8: Non-matching queries handle empty results cleanly', async () => {
      const response = await search({
        q: 'ZzzNonExistentClubXyz999',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      expect(response.results.clubs).toBeDefined();
      expect(response.results.clubs?.total).toBe(0);
      expect(response.results.clubs?.items).toEqual([]);
    });

    it('Scenario 9: Multi-word queries', async () => {
      const response = await search({
        q: 'London Runners Club',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('club2_gb_london');
      expect(items[0].name).toBe('London Runners Club');
    });

    it('Scenario 10: Private clubs (is_private=true) are discoverable in search', async () => {
      // Both club1 and club2 have is_private: true (matching production migration 033 state)
      const response = await search({
        q: 'London Runners',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('club2_gb_london');
    });

    it('Scenario 11: Excludes invite-only clubs and soft-deleted clubs', async () => {
      const response = await search({
        q: 'Runners',
        types: ['clubs'],
        limit: 15,
        offset: 0,
      });

      const items = response.results.clubs?.items || [];
      const ids = items.map((c) => c.id);
      expect(ids).not.toContain('club5_invite_only');
      expect(ids).not.toContain('club6_soft_deleted');
    });

    it('Scenario 12: Includes user pending club when userId matches creator', async () => {
      // club4_pending has created_by: 'user_creator_123'
      const response = await search({
        q: 'Pending Run Squad',
        types: ['clubs'],
        limit: 15,
        offset: 0,
        userId: 'user_creator_123',
      });

      const items = response.results.clubs?.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('club4_pending');
      expect(items[0].name).toBe('Pending Run Squad');
    });

    it('Scenario 13: Excludes user pending club when userId does not match', async () => {
      const response = await search({
        q: 'Pending Run Squad',
        types: ['clubs'],
        limit: 15,
        offset: 0,
        userId: 'different_user_456',
      });

      const items = response.results.clubs?.items || [];
      expect(items.some((c) => c.id === 'club4_pending')).toBe(false);
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
        message: 'Allowed types: challenges, clubs, help, posts.',
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

  describe('Community Posts & Hashtag Search', () => {
    it('searches posts by #hashtag (both stored tags and inline #hashtags, with or without spaces)', async () => {
      const byTagWithHash = await search({
        q: '#SabiSweat',
        types: ['posts'],
        limit: 10,
        offset: 0,
        userId: 'author_tammy',
      });

      const items = byTagWithHash.results.posts?.items || [];
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('post1_public');
      expect(items[0].tags).toEqual(['Sabi Sweat', 'Hydration']);
      expect(items[0].counts).toEqual({ likes: 1, comments: 2, shares: 2 });
      expect(items[0].likedByMe).toBe(true);
      expect(items[0].author?.username).toBe('tammy_akin');

      const byInlineHashtag = await search({
        q: '#morningrun',
        types: ['posts'],
        limit: 10,
        offset: 0,
      });
      expect(byInlineHashtag.results.posts?.items.some((p) => p.id === 'post1_public')).toBe(true);
    });

    it('searches posts by text or author and enforces club post visibility', async () => {
      const nonMemberRes = await search({
        q: 'Lekki',
        types: ['posts'],
        limit: 10,
        offset: 0,
        userId: 'other_user',
      });
      expect(nonMemberRes.results.posts?.items.some((p) => p.id === 'post2_club_only')).toBe(false);

      const memberRes = await search({
        q: 'Lekki',
        types: ['posts'],
        limit: 10,
        offset: 0,
        userId: 'member_moving_boyz',
      });
      expect(memberRes.results.posts?.items.some((p) => p.id === 'post2_club_only')).toBe(true);
    });
  });

  describe('Rate Limiter Configuration', () => {
    it('is configured with standard express-rate-limit headers', () => {
      expect(searchRateLimiter).toBeDefined();
      expect(typeof searchRateLimiter).toBe('function');
    });
  });
});
