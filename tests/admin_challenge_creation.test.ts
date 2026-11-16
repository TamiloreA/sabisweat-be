/**
 * Unit Tests for Admin Web Challenge API and Weekly Report Badges
 */

import {
  createAdminChallenge,
  getAdminChallengeOverview,
} from '../src/controllers/adminChallengeController';
import { getWeeklyReport } from '../src/services/healthService';

describe('Admin Challenge Creation & Weekly Report Badges', () => {
  describe('1. Admin Challenge Creation Controller', () => {
    it('rejects creation if title is missing', async () => {
      const req: any = {
        body: {
          subtitle: 'No Title Challenge',
          startAt: '2026-12-01T00:00:00.000Z',
          endAt: '2026-12-31T23:59:59.000Z',
        },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      await createAdminChallenge(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'title is required',
        })
      );
    });

    it('rejects creation if startAt is missing', async () => {
      const req: any = {
        body: {
          title: 'Missing StartAt',
          endAt: '2026-12-31T23:59:59.000Z',
        },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      await createAdminChallenge(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'startAt is required',
        })
      );
    });

    it('rejects creation if endAt is missing', async () => {
      const req: any = {
        body: {
          title: 'Missing EndAt',
          startAt: '2026-12-01T00:00:00.000Z',
        },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      await createAdminChallenge(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'endAt is required',
        })
      );
    });

    it('returns challenges list for admin overview endpoint', async () => {
      const req: any = {
        query: { page: '1', size: '10' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      await getAdminChallengeOverview(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          challenges: expect.any(Array),
          page: 1,
          size: 10,
        })
      );
    });
  });

  describe('2. Weekly Report Badges', () => {
    it('returns badgesEarned array in weekly report service output', async () => {
      const report = await getWeeklyReport('00000000-0000-0000-0000-000000000001', '2026-11-09');
      expect(report).toHaveProperty('badgesEarned');
      expect(Array.isArray(report.badgesEarned)).toBe(true);
    });
  });
});
