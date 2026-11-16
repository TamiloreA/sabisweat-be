/**
 * Unit Tests for Challenge Creator Type (creatorType)
 */

import { Request, Response } from 'express';
import * as challengeService from '../src/services/challengeService';
import * as adminChallengeController from '../src/controllers/adminChallengeController';
import * as challengeController from '../src/controllers/challengeController';
import { supabase } from '../src/config/database';

function createMockResponse(): { res: Partial<Response>; getStatus: () => number; getJson: () => any } {
  let statusCode = 200;
  let jsonData: any = null;

  const res: Partial<Response> = {
    status: jest.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data: any) => {
      jsonData = data;
      return res;
    }),
  };

  return { res, getStatus: () => statusCode, getJson: () => jsonData };
}

describe('Challenge Creator Type (creatorType)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Automatic Backend Assignment by Workflow', () => {
    it('assigns creatorType: "sabi_sweat" when created via Super Admin web portal', async () => {
      const mockReq = {
        body: {
          title: 'Sabi Sweat Official 100K Walk',
          startAt: '2026-12-01T00:00:00.000Z',
          endAt: '2026-12-31T23:59:59.000Z',
          goalType: 'steps_goal',
          goalValue: 100000,
        },
        user: { id: 'admin-super-user' },
      } as unknown as Request;

      const { res, getStatus, getJson } = createMockResponse();
      const next = jest.fn();

      const createSpy = jest.spyOn(challengeService, 'createChallenge').mockResolvedValueOnce({
        id: 'c-admin-created',
        title: 'Sabi Sweat Official 100K Walk',
        subtitle: '',
        rewardText: '',
        startAt: '2026-12-01T00:00:00.000Z',
        endAt: '2026-12-31T23:59:59.000Z',
        goalType: 'steps_goal',
        goalValue: 100000,
        participantsCount: 0,
        joined: false,
        creatorType: 'sabi_sweat',
      } as any);

      await adminChallengeController.createAdminChallenge(mockReq, res as Response, next);

      expect(getStatus()).toBe(201);
      const json = getJson();
      expect(json.creatorType).toBe('sabi_sweat');

      // Verify that createChallenge was called with creatorType = 'sabi_sweat'
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorType: 'sabi_sweat',
        }),
        'admin-super-user'
      );

      createSpy.mockRestore();
    });

    it('assigns creatorType: "club" when created via Club challenge creation workflow', async () => {
      const mockReq = {
        body: {
          title: 'The MOvers Club Sprint',
          startAt: '2026-12-01T00:00:00.000Z',
          endAt: '2026-12-07T23:59:59.000Z',
          goalType: 'steps_goal',
          goalValue: 50000,
          hostClubId: 'club-uuid-movers',
        },
        params: {},
        user: { id: 'club-admin-user' },
      } as unknown as Request;

      const { res, getStatus, getJson } = createMockResponse();
      const next = jest.fn();

      const createSpy = jest.spyOn(challengeService, 'createChallenge').mockResolvedValueOnce({
        id: 'c-club-created',
        title: 'The MOvers Club Sprint',
        subtitle: '',
        rewardText: '',
        startAt: '2026-12-01T00:00:00.000Z',
        endAt: '2026-12-07T23:59:59.000Z',
        goalType: 'steps_goal',
        goalValue: 50000,
        participantsCount: 0,
        joined: false,
        creatorType: 'club',
      } as any);

      await challengeController.createChallenge(mockReq, res as Response, next);

      expect(getStatus()).toBe(201);
      const json = getJson();
      expect(json.data.creatorType).toBe('club');

      // Verify that createChallenge was called with creatorType = 'club'
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorType: 'club',
        }),
        'club-admin-user'
      );

      createSpy.mockRestore();
    });
  });

  describe('2. Anti-Tampering: Immunity to Client-Supplied Values', () => {
    it('completely ignores client-supplied creatorType in request body and overrides with "club"', async () => {
      const mockReq = {
        body: {
          title: 'Tampered Club Challenge',
          startAt: '2026-12-01T00:00:00.000Z',
          endAt: '2026-12-07T23:59:59.000Z',
          creatorType: 'sabi_sweat', // Client attempts to spoof super admin creator type!
        },
        params: {},
        user: { id: 'sneaky-user' },
      } as unknown as Request;

      const { res, getStatus } = createMockResponse();
      const next = jest.fn();

      const createSpy = jest.spyOn(challengeService, 'createChallenge').mockResolvedValueOnce({
        id: 'c-tampered',
        title: 'Tampered Club Challenge',
        creatorType: 'club',
      } as any);

      await challengeController.createChallenge(mockReq, res as Response, next);

      expect(getStatus()).toBe(201);
      // Must have overridden with 'club'
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorType: 'club',
        }),
        'sneaky-user'
      );

      createSpy.mockRestore();
    });
  });

  describe('3. Challenge Retrieval & Response Serialization', () => {
    it('returns creatorType: "sabi_sweat" for challenges created through admin workflow', async () => {
      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'c-sabi-1',
                    title: 'Sabi Official Challenge',
                    start_at: '2026-12-01T00:00:00.000Z',
                    end_at: '2026-12-31T23:59:59.000Z',
                    creator_type: 'sabi_sweat',
                    is_official: true,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'challenge_participants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                }),
                is: jest.fn().mockResolvedValue({ count: 10, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        const challenge = await challengeService.getChallengeById('c-sabi-1', 'user-123');
        expect(challenge).toBeDefined();
        expect(challenge?.creatorType).toBe('sabi_sweat');
      } finally {
        fromSpy.mockRestore();
      }
    });

    it('safely defaults legacy challenge with creator_type: null to "club"', async () => {
      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'c-legacy-1',
                    title: 'The MOvers Legacy 30-Day Streak',
                    start_at: '2026-10-01T00:00:00.000Z',
                    end_at: '2026-10-31T23:59:59.000Z',
                    creator_type: null, // Legacy row
                    is_official: false,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'challenge_participants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                }),
                is: jest.fn().mockResolvedValue({ count: 25, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        const challenge = await challengeService.getChallengeById('c-legacy-1', 'user-123');
        expect(challenge).toBeDefined();
        expect(challenge?.creatorType).toBe('club');
      } finally {
        fromSpy.mockRestore();
      }
    });
  });

  describe('4. Field Independence (creatorType vs isOfficial vs host)', () => {
    it('preserves creatorType independence from isOfficial and host entities', async () => {
      const fromSpy = jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'challenges') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'c-endorsed-club',
                    title: 'Officially Endorsed Club Marathon',
                    start_at: '2026-12-01T00:00:00.000Z',
                    end_at: '2026-12-31T23:59:59.000Z',
                    creator_type: 'club', // Created via club workflow
                    is_official: true, // But endorsed as official Sabi Sweat content
                    host_club_id: 'club-movers',
                    co_host_club_id: 'club-erc',
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'clubs') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({
                data: [
                  { id: 'club-movers', name: 'The MOvers', profile_image_url: 'logo.png', theme: 'green' },
                  { id: 'club-erc', name: 'Ekò Runners Club', profile_image_url: 'erc.png', theme: 'orange' },
                ],
                error: null,
              }),
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: 'club-movers', name: 'The MOvers', profile_image_url: 'logo.png', theme: 'green' },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === 'challenge_participants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                }),
                is: jest.fn().mockResolvedValue({ count: 50, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      try {
        const challenge = await challengeService.getChallengeById('c-endorsed-club', 'user-123');
        expect(challenge).toBeDefined();
        // Both fields coexist independently without overriding each other
        expect(challenge?.creatorType).toBe('club');
        expect(challenge?.isOfficial).toBe(true);
        expect(challenge?.host?.name).toBe('The MOvers');
      } finally {
        fromSpy.mockRestore();
      }
    });
  });
});
