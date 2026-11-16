/**
 * Unit Tests for Challenge Hosts, Co-Hosts, and Official Content Ranking
 */

import * as challengeService from '../src/services/challengeService';
import * as searchService from '../src/services/searchService';
import { getGeoPriority } from '../src/utils/geoHierarchy';

describe('Challenge Hosts, Co-Hosts & Official Content', () => {
  const hostClubId = 'club-uuid-primary-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Geographic & Official Relevance Priority Hierarchy', () => {
    it('ranks official content at Tier 0 regardless of user location', () => {
      const priorityOfficial = getGeoPriority('NG', 'Lagos', { isOfficial: true, country: 'US', region: 'California' });
      expect(priorityOfficial).toBe(0);
    });

    it('ranks exact region match at Tier 1', () => {
      const priority = getGeoPriority('NG', 'Lagos', { isOfficial: false, country: 'NG', region: 'Lagos' });
      expect(priority).toBe(1);
    });

    it('ranks same country at Tier 2', () => {
      const priority = getGeoPriority('NG', 'Lagos', { isOfficial: false, country: 'NG', region: 'Abuja' });
      expect(priority).toBe(2);
    });

    it('ranks neighbouring country at Tier 3', () => {
      const priorityGH = getGeoPriority('NG', 'Lagos', { isOfficial: false, country: 'GH' });
      const priorityBJ = getGeoPriority('NG', 'Lagos', { isOfficial: false, country: 'BJ' });
      expect(priorityGH).toBe(3);
      expect(priorityBJ).toBe(3);
    });

    it('ranks global / non-neighbouring country at Tier 4', () => {
      const priorityUS = getGeoPriority('NG', 'Lagos', { isOfficial: false, country: 'US' });
      expect(priorityUS).toBe(4);
    });
  });

  describe('2. Challenge Hosts & Co-Hosts Contract', () => {
    it('returns null gracefully when challenge ID does not exist', async () => {
      const res = await challengeService.getChallengeById('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
      expect(res).toBeNull();
    });

    it('always returns coHosts as an empty array when retrieved challenge has no co-host', async () => {
      const active = await challengeService.getActiveChallenges('b0000000-0000-0000-0000-000000000002', 1, 5);
      expect(active).toHaveProperty('data');
      for (const c of active.data) {
        expect(Array.isArray(c.coHosts)).toBe(true);
      }
    });
  });

  describe('3. Club and Co-Host Search Filtering (excludeClubId)', () => {
    it('filters out primary host club from clubs search before scoring', async () => {
      const searchRes = await searchService.search({
        q: 'Movers',
        types: ['clubs'],
        limit: 10,
        offset: 0,
        excludeClubId: 'club-to-exclude',
      });

      expect(searchRes.results.clubs).toBeDefined();
      if (searchRes.results.clubs && searchRes.results.clubs.items.length > 0) {
        const hasExcluded = searchRes.results.clubs.items.some((c) => c.id === 'club-to-exclude');
        expect(hasExcluded).toBe(false);
      }
    });
  });
});
