/**
 * Unit Tests for Leave Club Endpoint
 * Endpoints:
 *   POST /community/clubs/:id/leave
 *   DELETE /community/clubs/:id/join
 */

import { leaveClub } from '../src/services/communityService';
import { leaveClub as leaveClubCtrl } from '../src/controllers/communityController';
import type { JoinClubResult } from '../src/models/communityModel';

// Mock Supabase
jest.mock('../src/config/database', () => {
  return {
    supabase: {
      from: jest.fn(),
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn().mockResolvedValue({ error: null }),
          getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://cdn.example.com/test.jpg' } })),
        })),
      },
    },
  };
});

const { supabase } = require('../src/config/database');

describe('Leave Club Endpoint & Service Tests', () => {
  const clubId = 'club-uuid-123';
  const memberUserId = 'user-member-456';
  const creatorUserId = 'user-creator-789';
  const nonMemberUserId = 'user-stranger-000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('leaveClub Service Logic', () => {
    it('successfully leaves a club for an active regular member', async () => {
      // Mock 1: Club exists and creator is creatorUserId
      const mockClubSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: clubId, name: 'Runners Republic', created_by: creatorUserId },
          error: null,
        }),
      };

      // Mock 2: User is an active member
      const mockMemberSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function (this: any) {
          return this;
        }),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { role: 'member' },
          error: null,
        }),
      };

      // Mock 3: Delete from club_members
      const mockMemberDelete = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn(function (this: any) {
          return this;
        }),
      };

      // Mock 4: Delete from club_join_requests
      const mockRequestDelete = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn(function (this: any) {
          return this;
        }),
      };

      // Mock 5: Count remaining members
      const mockCountSelect = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 9,
          error: null,
        }),
      };

      supabase.from.mockImplementation((table: string) => {
        if (table === 'clubs') {
          return mockClubSelect;
        }
        if (table === 'club_members') {
          // Check calls to distinguish select, delete, and count
          const instance: any = {};
          instance.select = jest.fn((fields: string, opts?: any) => {
            if (opts?.count === 'exact') {
              return mockCountSelect;
            }
            return mockMemberSelect;
          });
          instance.delete = jest.fn(() => mockMemberDelete);
          return instance;
        }
        if (table === 'club_join_requests') {
          return mockRequestDelete;
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      const result: JoinClubResult = await leaveClub(clubId, memberUserId);

      expect(result).toBeDefined();
      expect(result.joined).toBe(false);
      expect(result.membersCount).toBe(9);
    });

    it('rejects with 404 when club is not found', async () => {
      supabase.from.mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return {};
      });

      await expect(leaveClub('non-existent-club', memberUserId)).rejects.toMatchObject({
        message: 'Club not found',
        statusCode: 404,
      });
    });

    it('rejects with 400 when user is the club creator/owner', async () => {
      supabase.from.mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: clubId, name: 'Runners Republic', created_by: creatorUserId },
              error: null,
            }),
          };
        }
        return {};
      });

      await expect(leaveClub(clubId, creatorUserId)).rejects.toMatchObject({
        message: 'Club owners cannot leave their own club',
        statusCode: 400,
      });
    });

    it('rejects with 400 when user is not a member of the club', async () => {
      supabase.from.mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: clubId, name: 'Runners Republic', created_by: creatorUserId },
              error: null,
            }),
          };
        }
        if (table === 'club_members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(function (this: any) {
              return this;
            }),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return {};
      });

      await expect(leaveClub(clubId, nonMemberUserId)).rejects.toMatchObject({
        message: 'You are not a member of this club',
        statusCode: 400,
      });
    });
  });

  describe('leaveClub Controller Response Contract', () => {
    function createMockRes() {
      const res: any = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    }

    it('returns 200 with joined: false and updated membersCount on success', async () => {
      // Mock communityService.leaveClub indirectly via database mock
      supabase.from.mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: clubId, name: 'Runners Republic', created_by: creatorUserId },
              error: null,
            }),
          };
        }
        if (table === 'club_members') {
          return {
            select: jest.fn((fields: string, opts?: any) => {
              if (opts?.count === 'exact') {
                return {
                  eq: jest.fn().mockResolvedValue({ count: 14, error: null }),
                };
              }
              return {
                eq: jest.fn(function (this: any) {
                  return this;
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { role: 'member' },
                  error: null,
                }),
              };
            }),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn(function (this: any) {
              return this;
            }),
          };
        }
        if (table === 'club_join_requests') {
          return {
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn(function (this: any) {
              return this;
            }),
          };
        }
        return {};
      });

      const req: any = {
        params: { id: clubId },
        user: { id: memberUserId, sub: memberUserId },
      };
      const res = createMockRes();
      const next = jest.fn();

      await leaveClubCtrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Left club successfully',
        joined: false,
        membersCount: 14,
        data: {
          joined: false,
          membersCount: 14,
        },
      });
    });

    it('returns 400 when clubId parameter is missing', async () => {
      const req: any = {
        params: {},
        user: { id: memberUserId },
      };
      const res = createMockRes();
      const next = jest.fn();

      await leaveClubCtrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'clubId is required',
      });
    });

    it('returns 404 when club is not found', async () => {
      supabase.from.mockImplementation((table: string) => {
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return {};
      });

      const req: any = {
        params: { id: 'non-existent' },
        user: { id: memberUserId },
      };
      const res = createMockRes();
      const next = jest.fn();

      await leaveClubCtrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Club not found',
      });
    });
  });
});
