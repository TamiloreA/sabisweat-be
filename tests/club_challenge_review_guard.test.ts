import { supabase } from '../src/config/database';
import * as challengeService from '../src/services/challengeService';

describe('createChallenge club review guard', () => {
  const validInput = {
    title: 'Weekend 10K',
    startAt: '2026-12-01T00:00:00.000Z',
    endAt: '2026-12-08T00:00:00.000Z',
    hostClubId: '11111111-1111-4111-8111-111111111111',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockSupabaseForClubs(
    clubsById: Record<string, any>,
    role: string | null = 'admin'
  ) {
    const insertMock = jest.fn();
    const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'clubs') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation((_col: string, val: string) => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: clubsById[val] ?? null,
                error: null,
              }),
            })),
          }),
        } as any;
      }
      if (table === 'club_members') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: role ? { role } : null,
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'challenges') {
        return {
          insert: insertMock.mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'ch-created-1',
                  title: validInput.title,
                  start_at: validInput.startAt,
                  end_at: validInput.endAt,
                  host_club_id: validInput.hostClubId,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    return { fromSpy, insertMock };
  }

  it('rejects challenge creation when host club is under review (pending)', async () => {
    const { insertMock } = mockSupabaseForClubs({
      [validInput.hostClubId]: {
        id: validInput.hostClubId,
        name: 'Pending Runners',
        profile_image_url: null,
        theme: 'green',
        status: 'pending',
      },
    });

    await expect(
      challengeService.createChallenge(validInput, 'user-admin-1')
    ).rejects.toEqual({
      status: 403,
      message: 'Clubs under review cannot create challenges until approved',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects challenge creation when host club is rejected', async () => {
    const { insertMock } = mockSupabaseForClubs({
      [validInput.hostClubId]: {
        id: validInput.hostClubId,
        name: 'Rejected Runners',
        profile_image_url: null,
        theme: 'green',
        status: 'rejected',
      },
    });

    await expect(
      challengeService.createChallenge(validInput, 'user-admin-1')
    ).rejects.toEqual({
      status: 403,
      message: 'Only approved clubs can create challenges',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects challenge creation when co-host club is under review (pending)', async () => {
    const coHostId = '22222222-2222-4222-8222-222222222222';
    const { insertMock } = mockSupabaseForClubs({
      [validInput.hostClubId]: {
        id: validInput.hostClubId,
        name: 'Approved Runners',
        profile_image_url: null,
        theme: 'green',
        status: 'approved',
      },
      [coHostId]: {
        id: coHostId,
        name: 'Pending CoHost',
        profile_image_url: null,
        theme: 'orange',
        status: 'pending',
      },
    });

    await expect(
      challengeService.createChallenge({ ...validInput, coHostClubId: coHostId }, 'user-admin-1')
    ).rejects.toEqual({
      status: 403,
      message: 'Co-host club must be approved',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('allows challenge creation when host club is approved', async () => {
    const { insertMock } = mockSupabaseForClubs({
      [validInput.hostClubId]: {
        id: validInput.hostClubId,
        name: 'Approved Runners',
        profile_image_url: null,
        theme: 'green',
        status: 'approved',
      },
    });

    const created = await challengeService.createChallenge(validInput, 'user-admin-1');
    expect(created.title).toBe(validInput.title);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
