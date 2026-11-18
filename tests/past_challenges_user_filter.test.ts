import * as challengeService from '../src/services/challengeService';
import { supabase } from '../src/config/database';

jest.mock('../src/config/database', () => {
  const mockSupabase = {
    from: jest.fn(),
  };
  return {
    supabase: mockSupabase,
    authClient: mockSupabase,
    getUserSupabase: jest.fn(() => mockSupabase),
  };
});

describe('Past Challenges User Filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when userId is not provided', async () => {
    const res = await challengeService.getPastChallenges(undefined, 1, 10);
    expect(res).toEqual({
      page: 1,
      size: 10,
      total: 0,
      hasMore: false,
      data: [],
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns empty array when user has not joined any challenges', async () => {
    const mockFrom = supabase.from as jest.Mock;
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await challengeService.getPastChallenges('user-123', 1, 10);
    expect(res.total).toBe(0);
    expect(res.data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('challenge_participants');
  });

  it('only queries and returns past challenges that the user joined', async () => {
    const mockFrom = supabase.from as jest.Mock;

    const userParticipations = [
      {
        challenge_id: 'joined-past-challenge-1',
        joined_at: '2026-09-01T00:00:00Z',
        claimed_at: null,
        notify_announcement: true,
      },
      {
        challenge_id: 'joined-past-challenge-2',
        joined_at: '2026-09-05T00:00:00Z',
        claimed_at: '2026-09-20T00:00:00Z',
        notify_announcement: true,
      },
    ];

    const pastChallengesInDb = [
      {
        id: 'joined-past-challenge-1',
        title: 'Joined Past Challenge 1',
        subtitle: 'Sub 1',
        goal_type: 'steps',
        goal_value: 50000,
        start_at: '2026-09-01T00:00:00Z',
        end_at: '2026-09-15T00:00:00Z',
        reward_type: 'coins',
        reward_value: 100,
        is_official: false,
        who_can_join: 'everyone',
        visibility: 'public',
      },
      {
        id: 'joined-past-challenge-2',
        title: 'Joined Past Challenge 2',
        subtitle: 'Sub 2',
        goal_type: 'steps',
        goal_value: 100000,
        start_at: '2026-09-05T00:00:00Z',
        end_at: '2026-09-20T00:00:00Z',
        reward_type: 'coins',
        reward_value: 200,
        is_official: false,
        who_can_join: 'everyone',
        visibility: 'public',
      },
    ];

    let participantsInMock = jest.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'challenge_participants') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockResolvedValue({ data: userParticipations, error: null }),
          // For participant count query:
          count: 'exact',
        };
      }
      if (table === 'challenges') {
        participantsInMock = jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: pastChallengesInDb, error: null }),
          }),
        });
        return {
          select: jest.fn().mockReturnValue({
            in: participantsInMock,
          }),
        };
      }
      if (table === 'clubs') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'daily_steps') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        is: jest.fn().mockResolvedValue({ data: [], error: null, count: 5 }),
      };
    });

    const res = await challengeService.getPastChallenges('user-123', 1, 10);

    expect(participantsInMock).toHaveBeenCalledWith('id', [
      'joined-past-challenge-1',
      'joined-past-challenge-2',
    ]);
    expect(res.total).toBe(2);
    expect(res.data.length).toBe(2);
    expect(res.data[0].id).toBe('joined-past-challenge-1');
    expect(res.data[0].joined).toBe(true);
    expect(res.data[1].id).toBe('joined-past-challenge-2');
    expect(res.data[1].joined).toBe(true);
  });
});
