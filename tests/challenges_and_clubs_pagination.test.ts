/**
 * Unit Tests for Challenges, Clubs, and Leaderboard API Updates
 */

import type {
  LeaderboardResponse,
  PaginatedChallengesResponse,
} from '../src/models/challengeModel';
import type { PaginatedClubsResponse } from '../src/models/communityModel';

describe('Challenges, Clubs & Leaderboard Schema & Pagination Response Contracts', () => {
  it('validates LeaderboardResponse contract with currentUser rank', () => {
    const mockLeaderboard: LeaderboardResponse = {
      page: 0,
      size: 20,
      total: 1420,
      currentUser: {
        rank: 42,
        user: {
          id: 'e99f51d5-0025-4298-95c8-d66f55b7a496',
          username: 'Tammy',
          displayName: 'Tammy Akin',
          avatarId: 'male-40sto50s-straightsize-coral-shortwavyhairandmoustache-activeweartop',
        },
        steps: 12500,
        score: '12500',
      },
      data: [
        {
          rank: 1,
          user: {
            id: 'top-user-id',
            username: 'Champion',
            displayName: 'Champ One',
          },
          steps: 28400,
          score: '28400',
        },
      ],
    };

    expect(mockLeaderboard.page).toBe(0);
    expect(mockLeaderboard.size).toBe(20);
    expect(mockLeaderboard.total).toBe(1420);
    expect(mockLeaderboard.currentUser).not.toBeNull();
    expect(mockLeaderboard.currentUser?.rank).toBe(42);
    expect(mockLeaderboard.currentUser?.steps).toBe(12500);
    expect(mockLeaderboard.currentUser?.score).toBe('12500');
    expect(mockLeaderboard.data).toHaveLength(1);
    expect(mockLeaderboard.data[0].rank).toBe(1);
  });

  it('validates LeaderboardResponse contract when currentUser is null', () => {
    const mockLeaderboard: LeaderboardResponse = {
      page: 0,
      size: 20,
      total: 10,
      currentUser: null,
      data: [],
    };

    expect(mockLeaderboard.currentUser).toBeNull();
    expect(mockLeaderboard.total).toBe(10);
    expect(mockLeaderboard.data).toHaveLength(0);
  });

  it('validates PaginatedChallengesResponse contract for joined/active challenges', () => {
    const mockActiveChallenges: PaginatedChallengesResponse = {
      page: 1,
      size: 10,
      total: 24,
      hasMore: true,
      data: [
        {
          id: 'challenge-id-1',
          title: '30-Day Step Streak',
          subtitle: 'Keep stepping',
          rewardText: '5,000 Sabi Coins',
          joined: true,
          participantsCount: 150,
          startAt: '2026-11-01T00:00:00Z',
          endAt: '2026-11-30T23:59:59Z',
          host: {
            name: 'The MOvers',
            logoUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b',
            clubId: '611c89b9-5b6e-44fe-94b8-ac70dd31c2b0',
            theme: 'green',
          },
          eligible: false,
          canClaim: false,
          whoCanJoin: 'everyone',
          leaderboardVisibility: 'public',
        },
      ],
    };

    expect(mockActiveChallenges.page).toBe(1);
    expect(mockActiveChallenges.size).toBe(10);
    expect(mockActiveChallenges.total).toBe(24);
    expect(mockActiveChallenges.hasMore).toBe(true);
    expect(mockActiveChallenges.data[0].id).toBe('challenge-id-1');
    expect(mockActiveChallenges.data[0].joined).toBe(true);
    expect(mockActiveChallenges.data[0].host?.theme).toBe('green');
  });

  it('validates PaginatedChallengesResponse contract for available challenges', () => {
    const mockAvailableChallenges: PaginatedChallengesResponse = {
      page: 1,
      size: 10,
      total: 58,
      hasMore: true,
      data: [
        {
          id: 'challenge-id-2',
          title: 'Weekend 10K Push',
          subtitle: 'Weekend walk',
          rewardText: '1,000 Sabi Coins',
          joined: false,
          participantsCount: 85,
          startAt: '2026-11-10T00:00:00Z',
          endAt: '2026-11-12T23:59:59Z',
          eligible: false,
          canClaim: false,
          whoCanJoin: 'everyone',
          leaderboardVisibility: 'public',
        },
      ],
    };

    expect(mockAvailableChallenges.page).toBe(1);
    expect(mockAvailableChallenges.size).toBe(10);
    expect(mockAvailableChallenges.total).toBe(58);
    expect(mockAvailableChallenges.hasMore).toBe(true);
    expect(mockAvailableChallenges.data[0].joined).toBe(false);
  });

  it('validates PaginatedChallengesResponse contract for past challenges', () => {
    const mockPastChallenges: PaginatedChallengesResponse = {
      page: 1,
      size: 10,
      total: 35,
      hasMore: true,
      data: [
        {
          id: 'past-challenge-id',
          title: 'October Step Marathon',
          subtitle: 'Completed on Oct 31',
          rewardText: '2,000 Sabi Coins',
          joined: true,
          participantsCount: 210,
          startAt: '2026-10-01T00:00:00Z',
          endAt: '2026-10-31T23:59:59Z',
          eligible: true,
          canClaim: true,
          whoCanJoin: 'everyone',
          leaderboardVisibility: 'public',
        },
      ],
    };

    expect(mockPastChallenges.page).toBe(1);
    expect(mockPastChallenges.size).toBe(10);
    expect(mockPastChallenges.total).toBe(35);
    expect(mockPastChallenges.hasMore).toBe(true);
    expect(mockPastChallenges.data[0].id).toBe('past-challenge-id');
    expect(mockPastChallenges.data[0].joined).toBe(true);
    expect(mockPastChallenges.data[0].participantsCount).toBe(210);
  });

  it('validates PaginatedClubsResponse contract', () => {
    const mockClubs: PaginatedClubsResponse = {
      page: 1,
      size: 10,
      total: 85,
      hasMore: true,
      data: [
        {
          id: 'club-id-1',
          name: 'Lagos Runners Club',
          description: 'Top running community',
          tag: 'brand',
          locationScope: 'single',
          locationText: 'Lagos, Nigeria',
          country: 'Nigeria',
          countryCode: 'NG',
          regions: ['Lagos'],
          countries: null,
          coverImageUrl: 'https://example.com/cover.jpg',
          profileImageUrl: 'https://example.com/profile.jpg',
          theme: 'green',
          status: 'approved',
          membersCount: 240,
          joinStatus: 'joined',
          isAdmin: false,
          isPrivate: false,
          membersCanPost: false,
          showLeaderboard: true,
          isInviteOnly: false,
          requiresApproval: true,
          createdAt: '2026-10-10T00:00:00Z',
        },
      ],
    };

    expect(mockClubs.page).toBe(1);
    expect(mockClubs.size).toBe(10);
    expect(mockClubs.total).toBe(85);
    expect(mockClubs.hasMore).toBe(true);
    expect(mockClubs.data[0].name).toBe('Lagos Runners Club');
    expect(mockClubs.data[0].membersCount).toBe(240);
  });
});
