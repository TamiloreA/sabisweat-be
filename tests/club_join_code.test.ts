import { supabase } from '../src/config/database';
import * as communityService from '../src/services/communityService';

describe('Club Join Codes (Fast RPC + Fallback + Admin Management)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Single-round-trip RPC fast path', () => {
    it('bypasses admin approval in 1 RPC call when valid code is supplied', async () => {
      const rpcSpy = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          ok: true,
          joined: true,
          bypassed_approval: true,
          club_id: 'club-1',
          club_name: 'Lagos Runners',
          club_theme: 'green',
          members_count: 25,
        },
        error: null,
      } as any);

      const res = await communityService.requestJoinClub('club-1', 'user-1', ' lagos26 ');
      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('join_club_atomic', {
        p_club_id: 'club-1',
        p_user_id: 'user-1',
        p_join_code: 'LAGOS26',
      });
      expect(res).toEqual({
        joined: true,
        bypassedApproval: true,
        clubId: 'club-1',
        clubName: 'Lagos Runners',
        clubTheme: 'green',
        membersCount: 25,
      });
    });

    it('rejects invalid code with 400 without creating pending request', async () => {
      jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: { ok: false, error_code: 'INVALID_CODE', message: 'Invalid club code' },
        error: null,
      } as any);

      await expect(
        communityService.requestJoinClub('club-1', 'user-1', 'WRONGCODE')
      ).rejects.toEqual({
        status: 400,
        message: 'Invalid club code',
      });
    });

    it('keeps admin approval flow when no code is provided for a private club', async () => {
      jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          ok: true,
          joined: false,
          bypassed_approval: false,
          club_id: 'club-1',
          club_name: 'Lagos Runners',
          club_theme: 'green',
          members_count: 24,
        },
        error: null,
      } as any);

      const res = await communityService.requestJoinClub('club-1', 'user-1');
      expect(res.joined).toBe(false);
      expect(res.bypassedApproval).toBe(false);
    });

    it('joins directly by code via global joinClubByCode RPC', async () => {
      const rpcSpy = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          ok: true,
          joined: true,
          bypassed_approval: true,
          club_id: 'club-9',
          club_name: 'Abuja Striders',
          club_theme: 'orange',
          members_count: 14,
        },
        error: null,
      } as any);

      const res = await communityService.joinClubByCode('abuja-99', 'user-1');
      expect(rpcSpy).toHaveBeenCalledWith('join_club_atomic', {
        p_club_id: null,
        p_user_id: 'user-1',
        p_join_code: 'ABUJA-99',
      });
      expect(res.joined).toBe(true);
      expect(res.clubId).toBe('club-9');
      expect(res.clubName).toBe('Abuja Striders');
    });
  });

  describe('2. Fallback path when RPC is not yet deployed', () => {
    it('joins private club immediately with matching case-insensitive code', async () => {
      jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function join_club_atomic does not exist' },
      } as any);

      const memberInsertMock = jest.fn().mockResolvedValue({ error: null });
      const reqUpdateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'club-1',
                    name: 'Lagos Runners',
                    is_private: true,
                    status: 'approved',
                    join_code: 'LAGOS26',
                    theme: 'green',
                  },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        if (table === 'club_members') {
          return {
            select: jest.fn().mockImplementation((_sel: string, opts?: any) => {
              if (opts?.head) {
                return { eq: jest.fn().mockResolvedValue({ count: 12, error: null }) };
              }
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              };
            }),
            insert: memberInsertMock,
          } as any;
        }
        if (table === 'club_join_requests') {
          return { update: reqUpdateMock } as any;
        }
        return {} as any;
      });

      const res = await communityService.requestJoinClub('club-1', 'user-2', 'lagos26');
      expect(res.joined).toBe(true);
      expect(res.bypassedApproval).toBe(true);
      expect(res.membersCount).toBe(12);
      expect(memberInsertMock).toHaveBeenCalledWith({
        club_id: 'club-1',
        user_id: 'user-2',
        role: 'member',
      });
      expect(reqUpdateMock).toHaveBeenCalled();
    });
  });

  describe('3. Admin join code management & validation', () => {
    it('validates custom code format and normalizes uppercase', () => {
      expect(communityService.validateClubJoinCode(' eko-run26 ')).toBe('EKO-RUN26');
      expect(() => communityService.validateClubJoinCode('ab')).toThrow();
      expect(() => communityService.validateClubJoinCode('-BAD-')).toThrow();
      expect(() => communityService.validateClubJoinCode('NO SPACES')).toThrow();
    });

    it('generates clean readable codes', () => {
      const code = communityService.generateClubJoinCode('Eko Runners');
      expect(code).toMatch(/^EKO-[A-Z0-9]{4}$/);
    });

    it('rejects non-admin attempting to update club code with 403', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'club-1', name: 'Eko', created_by: 'owner-1', is_private: true },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'club_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({ data: { role: 'member' }, error: null }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      await expect(
        communityService.updateClubJoinCode('club-1', 'regular-user', { joinCode: 'RUN2026' })
      ).rejects.toEqual({
        status: 403,
        message: 'Only club admins or owners can manage the club code',
      });
    });

    it('returns 409 when custom code collides with another club', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'club-1', name: 'Eko', created_by: 'admin-1', is_private: true },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } }),
            }),
          } as any;
        }
        if (table === 'club_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      await expect(
        communityService.updateClubJoinCode('club-1', 'admin-1', { joinCode: 'TAKEN26' })
      ).rejects.toEqual({
        status: 409,
        message: 'That club code is already taken. Try another one.',
      });
    });
  });

  describe('4. Privacy — never leaks joinCode to non-admins', () => {
    it('hides joinCode from non-admins while exposing hasJoinCode: true', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'club-1',
                    name: 'Secret Club',
                    description: 'desc',
                    tag: 'secret',
                    location_text: 'Lagos',
                    cover_image_url: '',
                    profile_image_url: '',
                    theme: 'green',
                    status: 'approved',
                    is_private: true,
                    join_code: 'SUPERSECRET',
                    created_at: '2026-01-01T00:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'club_members') {
          return {
            select: jest.fn().mockImplementation((_sel: string, opts?: any) => {
              if (opts?.head) {
                return { eq: jest.fn().mockResolvedValue({ count: 5, error: null }) };
              }
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              };
            }),
          } as any;
        }
        if (table === 'club_join_requests') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const nonAdminView = await communityService.getClubById('club-1', 'outsider-1');
      expect(nonAdminView?.hasJoinCode).toBe(true);
      expect(nonAdminView?.joinCode).toBeUndefined();
    });
  });
});
