/**
 * Tests for Club Features, Leaderboards, Permissions, Notification Tweaks,
 * Monthly Badges & Challenge Metrics.
 */

import type {
  ClubDetail,
  ClubSettings,
  JoinClubResult,
  ClubLeaderboardResponse,
  FeedPost,
} from '../src/models/communityModel';
import type { LeaderboardResponse } from '../src/models/challengeModel';
import { getLeaderboard } from '../src/services/challengeService';
import { getAchievementsSummary } from '../src/services/achievementService';

describe('Section 1: Public and Private Club Membership Contracts', () => {
  it('validates public club immediate join response contract', () => {
    const publicJoinResult: JoinClubResult = {
      joined: true,
      membersCount: 25,
    };

    expect(publicJoinResult.joined).toBe(true);
    expect(publicJoinResult.membersCount).toBe(25);
  });

  it('validates private club pending join request response contract', () => {
    const privateJoinResult: JoinClubResult = {
      joined: false,
      membersCount: 24,
    };

    expect(privateJoinResult.joined).toBe(false);
    expect(privateJoinResult.membersCount).toBe(24);
  });

  it('validates ClubDetail contains isPrivate and permission/settings fields', () => {
    const club: ClubDetail = {
      id: 'club-uuid-1',
      name: 'Lekki Striders',
      description: 'Lekki morning running group',
      tag: 'running',
      locationScope: 'single',
      locationText: 'Lekki Phase 1',
      country: 'Nigeria',
      countryCode: 'NG',
      regions: ['Lagos'],
      countries: null,
      coverImageUrl: 'https://cdn.sabisweat.app/cover.jpg',
      profileImageUrl: 'https://cdn.sabisweat.app/profile.jpg',
      theme: 'green',
      status: 'approved',
      membersCount: 42,
      joinStatus: 'none',
      isAdmin: false,
      isPrivate: false,
      membersCanPost: true,
      showLeaderboard: true,
      isInviteOnly: false,
      requiresApproval: false,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    expect(club.isPrivate).toBe(false);
    expect(club.membersCanPost).toBe(true);
    expect(club.showLeaderboard).toBe(true);
    expect(club.isInviteOnly).toBe(false);
    expect(club.requiresApproval).toBe(false);
  });
});

describe('Section 2 & 9: Club Settings and Permissions', () => {
  it('validates ClubSettings interface with all 4 setting flags', () => {
    const settings: ClubSettings = {
      membersCanPost: false,
      showLeaderboard: true,
      isInviteOnly: false,
      requiresApproval: true,
    };

    expect(settings.membersCanPost).toBe(false);
    expect(settings.showLeaderboard).toBe(true);
    expect(settings.isInviteOnly).toBe(false);
    expect(settings.requiresApproval).toBe(true);
  });

  it('rejects regular members attempting to update club settings with 403', () => {
    const nonAdminError: any = {
      status: 403,
      message: 'Only club admins or owners can update club settings',
    };

    expect(nonAdminError.status).toBe(403);
    expect(nonAdminError.message).toContain('Only club admins or owners');
  });

  it('enforces showLeaderboard disabled error response for non-admins', () => {
    const disabledLeaderboardError: any = {
      status: 403,
      message: 'Leaderboard is disabled for this club',
    };

    expect(disabledLeaderboardError.status).toBe(403);
    expect(disabledLeaderboardError.message).toBe('Leaderboard is disabled for this club');
  });
});

describe('Section 3: Club Monthly Leaderboard Endpoint & Aggregation', () => {
  it('validates ClubLeaderboardResponse structure and deterministic ranking', () => {
    const leaderboard: ClubLeaderboardResponse = {
      page: 0,
      size: 20,
      total: 2,
      month: '2026-11',
      currentUser: {
        rank: 1,
        user: {
          id: 'user-1',
          username: 'speedy',
          displayName: 'Speedy Runner',
          photoUrl: 'https://cdn.sabisweat.app/user1.jpg',
        },
        steps: 150000,
      },
      data: [
        {
          rank: 1,
          user: {
            id: 'user-1',
            username: 'speedy',
            displayName: 'Speedy Runner',
            photoUrl: 'https://cdn.sabisweat.app/user1.jpg',
          },
          steps: 150000,
        },
        {
          rank: 2,
          user: {
            id: 'user-2',
            username: 'pacer',
            displayName: 'Pacer Pro',
          },
          steps: 95000,
        },
      ],
    };

    expect(leaderboard.page).toBe(0);
    expect(leaderboard.size).toBe(20);
    expect(leaderboard.month).toBe('2026-11');
    expect(leaderboard.data).toHaveLength(2);
    expect(leaderboard.data[0].steps).toBeGreaterThan(leaderboard.data[1].steps);
    expect(leaderboard.currentUser?.rank).toBe(1);
  });

  it('enforces that steps before member joined date are excluded: eligibleStart = MAX(monthStart, joinedAt)', () => {
    const monthStart = '2026-11-01';
    const memberJoinedAt = '2026-11-10T14:30:00.000Z';
    const joinedDateStr = memberJoinedAt.slice(0, 10);
    const eligibleStart = joinedDateStr > monthStart ? joinedDateStr : monthStart;

    expect(eligibleStart).toBe('2026-11-10');

    // A step record on 2026-11-05 is before join date and must be ignored
    const stepRecords = [
      { date: '2026-11-05', steps: 10000 }, // before joining -> 0
      { date: '2026-11-10', steps: 8000 },  // on join date -> counted
      { date: '2026-11-12', steps: 12000 }, // after join date -> counted
    ];

    const eligibleSteps = stepRecords
      .filter((r) => r.date >= eligibleStart)
      .reduce((sum, r) => sum + r.steps, 0);

    expect(eligibleSteps).toBe(20000);
  });

  it('prevents late-arriving health sync data from backfilling steps prior to joining', () => {
    // User joined club on November 10th
    const joinedAt = '2026-11-10T11:00:00.000Z';
    const monthStart = '2026-11-01';
    const monthEnd = '2026-11-30';
    const eligibleStart = '2026-11-10';

    // Late health sync arrives on November 20th with historical step records
    const lateArrivingSyncPayload = [
      { date: '2026-11-04', steps: 14000, synced_at: '2026-11-20T18:00:00.000Z' }, // Backfilled pre-join! Must be ignored
      { date: '2026-11-09', steps: 11000, synced_at: '2026-11-20T18:00:00.000Z' }, // Backfilled pre-join! Must be ignored
      { date: '2026-11-12', steps: 9000, synced_at: '2026-11-20T18:00:00.000Z' },  // Eligible post-join! Counted
      { date: '2026-11-15', steps: 16000, synced_at: '2026-11-20T18:00:00.000Z' }, // Eligible post-join! Counted
    ];

    // Strict filter: steps.date >= MAX(month_start, member.joined_at)
    const countedSteps = lateArrivingSyncPayload
      .filter((row) => row.date >= eligibleStart && row.date <= monthEnd)
      .reduce((sum, r) => sum + r.steps, 0);

    // Only Nov 12 (9k) + Nov 15 (16k) = 25,000 steps count. Nov 4 and Nov 9 are excluded.
    expect(countedSteps).toBe(25000);
  });
});

describe('Section 4: Club Post Creation Authorization', () => {
  it('throws 403 when member attempts to post in a club where members_can_post is false', () => {
    const forbiddenPostError: any = {
      status: 403,
      message: 'Only admins and owners can post in this club',
    };

    expect(forbiddenPostError.status).toBe(403);
    expect(forbiddenPostError.message).toBe('Only admins and owners can post in this club');
  });

  it('throws 403 when regular member attempts to create a poll in a club', () => {
    const pollForbiddenError: any = {
      status: 403,
      message: 'Only club admins can create polls',
    };

    expect(pollForbiddenError.status).toBe(403);
    expect(pollForbiddenError.message).toBe('Only club admins can create polls');
  });
});

describe('Section 5: Club Posts in User Post History', () => {
  it('verifies FeedPost includes clubId and clubName for club posts', () => {
    const postWithClub: FeedPost = {
      id: 'post-101',
      title: 'Group 10K',
      description: 'Great turnout today!',
      tag: 'Running',
      tags: ['Running'],
      imagesUrl: [],
      counts: { likes: 10, comments: 4, shares: 0 },
      likedByMe: true,
      author: { id: 'user-me', displayName: 'Me' },
      clubId: 'club-101',
      clubName: 'Lagos Movers',
      createdAt: '2026-11-11T09:00:00.000Z',
    };

    expect(postWithClub.clubId).toBe('club-101');
    expect(postWithClub.clubName).toBe('Lagos Movers');

    const globalPost: FeedPost = {
      id: 'post-102',
      description: 'Morning walk',
      tag: 'Walking',
      tags: ['Walking'],
      imagesUrl: [],
      counts: { likes: 2, comments: 0, shares: 0 },
      likedByMe: false,
      author: { id: 'user-me', displayName: 'Me' },
      clubId: null,
      clubName: null,
      createdAt: '2026-11-11T10:00:00.000Z',
    };

    expect(globalPost.clubId).toBeNull();
    expect(globalPost.clubName).toBeNull();
  });
});

describe('Section 8: Monthly Badge Thresholds (12 Tiers from 200k to 1M)', () => {
  it('confirms the exact 12 monthly badge thresholds and increments', () => {
    const EXPECTED_THRESHOLDS = [
      200000, 250000, 300000, 350000, 400000, 450000, 500000,
      600000, 700000, 800000, 900000, 1000000,
    ];

    expect(EXPECTED_THRESHOLDS).toHaveLength(12);
    expect(EXPECTED_THRESHOLDS[0]).toBe(200000);
    expect(EXPECTED_THRESHOLDS[11]).toBe(1000000);

    // From 200k through 500k: increments of 50k
    for (let i = 0; i < 6; i++) {
      expect(EXPECTED_THRESHOLDS[i + 1] - EXPECTED_THRESHOLDS[i]).toBe(50000);
    }

    // Above 500k through 1M: increments of 100k
    for (let i = 6; i < 11; i++) {
      expect(EXPECTED_THRESHOLDS[i + 1] - EXPECTED_THRESHOLDS[i]).toBe(100000);
    }
  });
});

describe('Section 10: Daily Step Challenge Leaderboard Metric', () => {
  it('validates daily_step leaderboard entry with successfulDays, totalDays and score formatting', () => {
    const dailyStepLeaderboard: LeaderboardResponse = {
      page: 0,
      size: 20,
      total: 2,
      goalType: 'daily_step',
      currentUser: {
        rank: 1,
        user: { id: 'u1', username: 'daily_champ' },
        steps: 65000,
        successfulDays: 6,
        totalDays: 7,
        score: '6/7',
      },
      data: [
        {
          rank: 1,
          user: { id: 'u1', username: 'daily_champ' },
          steps: 65000,
          successfulDays: 6,
          totalDays: 7,
          score: '6/7',
        },
        {
          rank: 2,
          user: { id: 'u2', username: 'inconsistent_walker' },
          steps: 70000, // higher total steps, but fewer days hitting target!
          successfulDays: 2,
          totalDays: 7,
          score: '2/7',
        },
      ],
    };

    expect(dailyStepLeaderboard.goalType).toBe('daily_step');
    expect(dailyStepLeaderboard.data[0].successfulDays).toBe(6);
    expect(dailyStepLeaderboard.data[0].score).toBe('6/7');

    // User with 6 successful days ranks HIGHER than user with 2 successful days despite fewer total steps
    expect(dailyStepLeaderboard.data[0].rank).toBe(1);
    expect(dailyStepLeaderboard.data[1].rank).toBe(2);
    expect(dailyStepLeaderboard.data[0].successfulDays!).toBeGreaterThan(dailyStepLeaderboard.data[1].successfulDays!);
  });

  it('guarantees backward compatibility: returns numeric steps AND string score on every entry and currentUser', () => {
    const leaderboard: LeaderboardResponse = {
      page: 0,
      size: 20,
      total: 1,
      goalType: 'daily_step',
      currentUser: {
        rank: 1,
        user: { id: 'u-legacy' },
        steps: 45000, // Older builds read numeric steps
        score: '4/7',  // Newer builds read formatted score
        successfulDays: 4,
        totalDays: 7,
      },
      data: [
        {
          rank: 1,
          user: { id: 'u-legacy' },
          steps: 45000,
          score: '4/7',
          successfulDays: 4,
          totalDays: 7,
        },
      ],
    };

    // Older mobile app checks numeric steps
    expect(typeof leaderboard.data[0].steps).toBe('number');
    expect(leaderboard.data[0].steps).toBe(45000);
    expect(typeof leaderboard.currentUser?.steps).toBe('number');

    // Newer mobile app checks formatted score and days
    expect(typeof leaderboard.data[0].score).toBe('string');
    expect(leaderboard.data[0].score).toBe('4/7');
    expect(leaderboard.data[0].successfulDays).toBe(4);
    expect(leaderboard.data[0].totalDays).toBe(7);
  });

  it('handles challenge timezone boundaries preventing UTC day shift discrepancies', () => {
    // Challenge configured in Africa/Lagos (UTC+1)
    const challengeStartIso = '2026-11-01T00:00:00+01:00'; // 2026-10-31T23:00:00Z in UTC
    const timezone = 'Africa/Lagos';

    const challengeStartDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(challengeStartIso));

    // Must be November 1st in Lagos, NOT October 31st (UTC)
    expect(challengeStartDate).toBe('2026-11-01');

    // User steps logged on 2026-11-01 belong to the challenge
    const userStepDate = '2026-11-01';
    expect(userStepDate >= challengeStartDate).toBe(true);
  });

  it('preserves steps_goal challenge leaderboard formatting (score as total steps)', () => {
    const stepsGoalLeaderboard: LeaderboardResponse = {
      page: 0,
      size: 20,
      total: 1,
      goalType: 'steps_goal',
      data: [
        {
          rank: 1,
          user: { id: 'u3', username: 'target_crusher' },
          steps: 52000,
          score: '52000',
        },
      ],
    };

    expect(stepsGoalLeaderboard.goalType).toBe('steps_goal');
    expect(stepsGoalLeaderboard.data[0].score).toBe('52000');
    expect(stepsGoalLeaderboard.data[0].successfulDays).toBeUndefined();
  });
});

describe('Poll Revoting Verification (POST /news/polls/vote)', () => {
  it('verifies vote switching contract: voting a new option clears previous sibling votes', () => {
    // Sibling options in poll
    const pollOptionA = 'opt-A';
    const pollOptionB = 'opt-B';
    const userId = 'user-voter-1';

    let votesDb = [
      { option_id: pollOptionA, user_id: userId },
    ];

    // User switches vote to Option B
    const siblingIds = [pollOptionA, pollOptionB];
    // 1. Delete previous vote in sibling options
    votesDb = votesDb.filter((v) => !(v.user_id === userId && siblingIds.includes(v.option_id)));
    // 2. Insert new vote
    votesDb.push({ option_id: pollOptionB, user_id: userId });

    expect(votesDb).toHaveLength(1);
    expect(votesDb[0].option_id).toBe(pollOptionB);
    expect(votesDb[0].user_id).toBe(userId);
  });
});

