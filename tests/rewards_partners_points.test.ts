/**
 * Unit & Integration Tests for Rewards, Partners, Points Ledger & Redemption API
 */

import jwt from 'jsonwebtoken';
import * as pointsService from '../src/services/pointsService';
import * as rewardService from '../src/services/rewardService';
import * as qrToken from '../src/utils/qrToken';
import { notificationTemplates } from '../src/services/notificationTemplates';
import * as dispatcher from '../src/services/notificationDispatcher';
import { supabase } from '../src/config/database';
import { PUSH_CATEGORIES } from '../src/models/notificationModel';

// Mock notification dispatcher
jest.mock('../src/services/notificationDispatcher', () => ({
  dispatchNotification: jest.fn().mockResolvedValue({
    inAppCreated: true,
    unreadCount: 1,
    pushAttempts: 1,
    pushTicketsCount: 1,
    emailSent: false,
    errors: [],
  }),
}));

describe('Rewards, Partners, Points Ledger & Redemption API', () => {
  const dispatchSpy = dispatcher.dispatchNotification as jest.MockedFunction<
    typeof dispatcher.dispatchNotification
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. Points & Sabi Level Logic
  // ==========================================================================
  describe('Points Balance & Sabi Level Logic', () => {
    it('calculates Sabi Level correctly from lifetime steps tiers', () => {
      expect(pointsService.resolveLevelFromSteps(0)).toBe('Starter');
      expect(pointsService.resolveLevelFromSteps(500_000)).toBe('Starter');
      expect(pointsService.resolveLevelFromSteps(1_000_000)).toBe('Mover');
      expect(pointsService.resolveLevelFromSteps(1_999_999)).toBe('Mover');
      expect(pointsService.resolveLevelFromSteps(2_000_000)).toBe('Strider');
      expect(pointsService.resolveLevelFromSteps(3_000_000)).toBe('Champion');
      expect(pointsService.resolveLevelFromSteps(4_000_000)).toBe('Legend');
      expect(pointsService.resolveLevelFromSteps(10_000_000)).toBe('Legend');
    });

    it('honors higher tier between stored profile level and calculated lifetime steps', () => {
      // Stored is Starter, but user walked 2.5M steps -> Strider
      expect(pointsService.determineUserSabiLevel('Starter', 2_500_000)).toBe('Strider');

      // Stored is Champion, user lifetime steps only 500k -> Champion (never demotes)
      expect(pointsService.determineUserSabiLevel('Champion', 500_000)).toBe('Champion');

      // Fallback for null or unknown
      expect(pointsService.determineUserSabiLevel(null, 0)).toBe('Starter');
    });

    it('fetches points balance and returns structured balance + level response', async () => {
      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                points_balance: 1250,
                sabi_level: 'Mover',
                steps_count: 1_200_000,
              },
              error: null,
            }),
          } as any)
      );

      const result = await pointsService.getPointsBalance('user-1');
      expect(result.balance).toBe(1250);
      expect(result.pointsBalance).toBe(1250);
      expect(result.sabiLevel).toBe('Mover');
    });

    it('returns paginated ledger transaction history with positive and negative amounts', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          amount: 250,
          source: 'challenge_reward',
          description: 'Completed Lagos 10k Steps Challenge',
          created_at: '2026-11-09T18:30:00.000Z',
          reference_id: 'ref-1',
        },
        {
          id: 'tx-2',
          amount: -100,
          source: 'partner_redemption',
          description: 'Redeemed at Filmhouse Cinemas',
          created_at: '2026-11-08T14:15:00.000Z',
          reference_id: 'ref-2',
        },
      ];

      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({
              data: mockTransactions,
              error: null,
            }),
          } as any)
      );

      const history = await pointsService.getPointsHistory('user-1', 0, 20);
      expect(history.page).toBe(0);
      expect(history.size).toBe(20);
      expect(history.data).toHaveLength(2);
      expect(history.data[0].amount).toBe(250);
      expect(history.data[1].amount).toBe(-100);
      expect(history.data[1].source).toBe('partner_redemption');
    });

    it('recordPointsTransaction rejects deduction when balance is insufficient', async () => {
      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { points_balance: 50 },
              error: null,
            }),
          } as any)
      );

      await expect(
        pointsService.recordPointsTransaction('user-1', -150, 'partner_redemption', 'Popcorn')
      ).rejects.toThrow('insufficient_balance');
    });
  });

  // ==========================================================================
  // 2. QR Code Generation & Verification
  // ==========================================================================
  describe('QR Code Generation & Verification', () => {
    it('generates a valid signed JWT containing all required claims without deducting points', async () => {
      const payload = {
        userId: 'user-123',
        rewardId: 'rew-456',
        partnerId: 'part-789',
        pointsCost: 150,
        nonce: qrToken.generateNonce(),
      };

      const token = await qrToken.generateRewardQRToken(payload, 900);
      expect(typeof token).toBe('string');

      const verified = await qrToken.verifyRewardQRToken(token);
      expect(verified.userId).toBe(payload.userId);
      expect(verified.rewardId).toBe(payload.rewardId);
      expect(verified.partnerId).toBe(payload.partnerId);
      expect(verified.pointsCost).toBe(150);
      expect(verified.nonce).toBe(payload.nonce);
      expect(verified.exp).toBeDefined();
    });

    it('rejects expired QR tokens', async () => {
      const payload = {
        userId: 'user-123',
        rewardId: 'rew-456',
        partnerId: 'part-789',
        pointsCost: 150,
        nonce: 'nonce-expired',
      };

      const secret =
        process.env.JWT_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        'sabi-sweat-dev-secret-qr-key-32chars!!';

      // Generate a token that expired 10 seconds ago
      const expiredToken = jwt.sign(payload, secret, { expiresIn: -10 });

      await expect(qrToken.verifyRewardQRToken(expiredToken)).rejects.toThrow();
    });

    it('rejects tokens signed with an invalid secret or tampered payload', async () => {
      const fakeSecret = 'wrong-secret-key-that-does-not-match!!';
      const tamperedToken = jwt.sign(
        {
          userId: 'attacker',
          rewardId: 'rew-1',
          partnerId: 'part-1',
          pointsCost: 0,
          nonce: 'fake',
        },
        fakeSecret,
        { expiresIn: '15m' }
      );

      await expect(qrToken.verifyRewardQRToken(tamperedToken)).rejects.toThrow();
    });

    it('generateRewardQR throws 400 when user has insufficient balance', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === rewardService.TABLE_REWARDS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'rew-expensive',
                title: 'VIP Pass',
                points_cost: 5000,
                partner_id: 'part-1',
                status: 'active',
              },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PROFILES) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { points_balance: 200 },
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      await expect(rewardService.generateRewardQR('user-1', 'rew-expensive')).rejects.toMatchObject({
        status: 400,
        error: 'insufficient_balance',
      });
    });

    it('generateRewardQR throws 404 when reward is inactive or does not exist', async () => {
      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'rew-inactive',
                status: 'inactive',
                points_cost: 100,
              },
              error: null,
            }),
          } as any)
      );

      await expect(rewardService.generateRewardQR('user-1', 'rew-inactive')).rejects.toMatchObject({
        status: 404,
        error: 'reward_not_found_or_inactive',
      });
    });
  });

  // ==========================================================================
  // 3. Rewards & Partners Directory
  // ==========================================================================
  describe('Rewards & Partners Directory', () => {
    it('getActiveRewards returns active rewards with partner name and city', async () => {
      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'rew-1',
                  title: 'Free Popcorn & Soda',
                  points_cost: 150,
                  partner_id: 'part-1',
                  partners: {
                    name: 'Filmhouse Cinemas',
                    city: 'Lagos',
                    status: 'active',
                  },
                },
                {
                  id: 'rew-inactive-partner',
                  title: 'Secret Deal',
                  points_cost: 100,
                  partner_id: 'part-2',
                  partners: {
                    name: 'Closed Venue',
                    city: 'Abuja',
                    status: 'inactive',
                  },
                },
              ],
              error: null,
            }),
          } as any)
      );

      const rewards = await rewardService.getActiveRewards();
      expect(rewards).toHaveLength(1);
      expect(rewards[0].id).toBe('rew-1');
      expect(rewards[0].title).toBe('Free Popcorn & Soda');
      expect(rewards[0].points_cost).toBe(150);
      expect(rewards[0].partners.name).toBe('Filmhouse Cinemas');
      expect(rewards[0].partners.city).toBe('Lagos');
    });

    it('getPartners applies category and city filters', async () => {
      const mockEq = jest.fn().mockReturnThis();
      const mockIlike = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'part-1',
            name: 'Filmhouse Cinemas',
            description: 'Cinema in VI',
            category: 'sports_venue',
            city: 'Lagos',
            country: 'Nigeria',
            country_code: 'NG',
            cover_image_url: 'https://cdn.example.com/cover.jpg',
            logo_image_url: 'https://cdn.example.com/logo.jpg',
            address: 'Victoria Island',
            status: 'active',
          },
        ],
        error: null,
      });

      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: mockEq,
            ilike: mockIlike,
            order: mockOrder,
          } as any)
      );

      const partners = await rewardService.getPartners('sports_venue', 'Lagos');
      expect(partners).toHaveLength(1);
      expect(partners[0].name).toBe('Filmhouse Cinemas');
      expect(partners[0].category).toBe('sports_venue');
      expect(partners[0].city).toBe('Lagos');
      expect(partners[0].countryCode).toBe('NG');
      expect(mockEq).toHaveBeenCalledWith('category', 'sports_venue');
      expect(mockIlike).toHaveBeenCalledWith('city', '%Lagos%');
    });

    it('getPartnerById returns profile, gallery, and only active rewards', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === rewardService.TABLE_PARTNERS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'part-1',
                name: 'Filmhouse Cinemas',
                description: 'Cinema description',
                city: 'Lagos',
                country: 'Nigeria',
                cover_image_url: 'https://cdn.example.com/cover.jpg',
                logo_image_url: 'https://cdn.example.com/logo.jpg',
                address: 'Victoria Island, Lagos',
                status: 'active',
              },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PARTNER_IMAGES) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [{ image_url: 'https://cdn.example.com/gallery1.jpg' }],
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARDS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'rew-1',
                  title: 'Free Popcorn & Soda',
                  description: 'Regular popcorn with ticket',
                  points_cost: 150,
                  image_url: 'https://cdn.example.com/popcorn.jpg',
                },
              ],
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const detail = await rewardService.getPartnerById('part-1');
      expect(detail.id).toBe('part-1');
      expect(detail.name).toBe('Filmhouse Cinemas');
      expect(detail.gallery).toEqual(['https://cdn.example.com/gallery1.jpg']);
      expect(detail.activeRewards).toHaveLength(1);
      expect(detail.activeRewards[0].pointsCost).toBe(150);
    });
  });

  // ==========================================================================
  // 4. Partner Portal & Redemption
  // ==========================================================================
  describe('Partner Portal & Scan Redemption', () => {
    it('rejects redemption when staff member is not authorized for partner', async () => {
      const nonce = qrToken.generateNonce();
      const token = await qrToken.generateRewardQRToken({
        userId: 'customer-1',
        rewardId: 'rew-1',
        partnerId: 'part-unauthorized',
        pointsCost: 150,
        nonce,
      });

      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null, // staff not found
              error: null,
            }),
          } as any)
      );

      await expect(rewardService.redeemReward('staff-intruder', token)).rejects.toMatchObject({
        status: 403,
        error: 'unauthorized_staff',
      });
    });

    it('rejects reused nonce (single-use QR security)', async () => {
      const nonce = 'used-nonce-12345';
      const token = await qrToken.generateRewardQRToken({
        userId: 'customer-1',
        rewardId: 'rew-1',
        partnerId: 'part-1',
        pointsCost: 150,
        nonce,
      });

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === rewardService.TABLE_PARTNER_STAFF) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'staff-rel-1', role: 'staff' },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARD_REDEMPTIONS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'red-previous', status: 'completed' },
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      await expect(rewardService.redeemReward('staff-1', token)).rejects.toMatchObject({
        status: 409,
        error: 'qr_already_redeemed',
      });
    });

    it('rejects redemption if customer spent points and has insufficient balance at scan time', async () => {
      const nonce = qrToken.generateNonce();
      const token = await qrToken.generateRewardQRToken({
        userId: 'customer-broke',
        rewardId: 'rew-1',
        partnerId: 'part-1',
        pointsCost: 150,
        nonce,
      });

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === rewardService.TABLE_PARTNER_STAFF) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'staff-rel-1', role: 'staff' },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARD_REDEMPTIONS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARDS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'rew-1', title: 'Popcorn', points_cost: 150, status: 'active', partner_id: 'part-1' },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PROFILES) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'customer-broke', points_balance: 10 }, // Only 10 points!
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PARTNERS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'part-1', name: 'Filmhouse' },
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      await expect(rewardService.redeemReward('staff-1', token)).rejects.toMatchObject({
        status: 400,
        error: 'insufficient_balance',
      });
    });

    it('performs successful atomic redemption, deducts balance, and sends customer push notification', async () => {
      const nonce = qrToken.generateNonce();
      const token = await qrToken.generateRewardQRToken({
        userId: 'cust-ayodele',
        rewardId: 'rew-popcorn',
        partnerId: 'part-filmhouse',
        pointsCost: 150,
        nonce,
      });

      const mockRedemptionInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'red-999' },
          error: null,
        }),
      });

      const mockProfileUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      const mockLedgerInsert = jest.fn().mockResolvedValue({ error: null });
      const mockPartnerUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === rewardService.TABLE_PARTNER_STAFF) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'staff-rel-1', role: 'staff' },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARD_REDEMPTIONS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: mockRedemptionInsert,
          } as any;
        }
        if (table === rewardService.TABLE_REWARDS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'rew-popcorn',
                title: 'Free Popcorn & Soda',
                points_cost: 150,
                status: 'active',
                partner_id: 'part-filmhouse',
              },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PROFILES) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'cust-ayodele',
                first_name: 'Ayodele',
                last_name: 'O',
                username: 'ayodele',
                photo_url: 'https://cdn.example.com/avatar.jpg',
                points_balance: 1250,
              },
              error: null,
            }),
            update: mockProfileUpdate,
          } as any;
        }
        if (table === rewardService.TABLE_PARTNERS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'part-filmhouse', name: 'Filmhouse Cinemas', points_balance: 5000 },
              error: null,
            }),
            update: mockPartnerUpdate,
          } as any;
        }
        if (table === rewardService.TABLE_POINTS_TRANSACTIONS) {
          return {
            insert: mockLedgerInsert,
          } as any;
        }
        return {} as any;
      });

      const result = await rewardService.redeemReward('staff-1', token);

      expect(result.status).toBe('completed');
      expect(result.statusLabel).toBe('Redeemed');
      expect(result.pointsSpent).toBe(150);
      expect(result.userName).toBe('Ayodele O');
      expect(result.rewardTitle).toBe('Free Popcorn & Soda');

      // Verify profile points were deducted: 1250 - 150 = 1100
      expect(mockProfileUpdate).toHaveBeenCalledWith({ points_balance: 1100 });

      // Verify negative ledger entry
      expect(mockLedgerInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'cust-ayodele',
          amount: -150,
          source: 'partner_redemption',
          description: 'Redeemed at Filmhouse Cinemas',
          reference_id: `redemption_${nonce}`,
        })
      );

      // Verify customer push notification dispatch
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const pushCall = dispatchSpy.mock.calls[0][0];
      expect(pushCall.userId).toBe('cust-ayodele');
      expect(pushCall.title).toBe('Reward Redeemed');
      expect(pushCall.body).toBe('You spent 150 SabiCoins on Free Popcorn & Soda at Filmhouse Cinemas.');
      expect(pushCall.type).toBe('reward_redemption_completed');
      expect(pushCall.data).toEqual({
        type: 'reward_redemption_completed',
        screen: 'Ledger',
      });
      expect(pushCall.idempotencyKey).toBe(`redemption_notify:${nonce}`);
    });
  });

  // ==========================================================================
  // 5. Notification Separation Verification
  // ==========================================================================
  describe('Notification Types Separation', () => {
    it('preserves challenge completion notification format and navigation to ChallengeOverview', () => {
      const challengeTemplate = notificationTemplates.challengeCompletionGoalMet(
        'c-123',
        'Lagos 10k Challenge',
        'https://cdn.example.com/badge.jpg'
      );

      expect(challengeTemplate.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(challengeTemplate.title).toBe('Challenge Reward');
      expect(challengeTemplate.body).toBe(
        "You've earned a reward for completing Lagos 10k Challenge. It's ready to claim."
      );
      expect(challengeTemplate.data.screen).toBe('ChallengeOverview');
      expect(challengeTemplate.data.params.challengeId).toBe('c-123');
    });

    it('ensures partner reward redemption routes distinctly to Ledger screen', () => {
      const redeemTemplate = notificationTemplates.rewardRedeemed(
        150,
        'Free Popcorn & Soda',
        'Filmhouse Cinemas'
      );

      expect(redeemTemplate.category).toBe(PUSH_CATEGORIES.REWARD_EARNED);
      expect(redeemTemplate.title).toBe('Reward Redeemed');
      expect(redeemTemplate.body).toBe(
        'You spent 150 SabiCoins on Free Popcorn & Soda at Filmhouse Cinemas.'
      );
      expect(redeemTemplate.data.type).toBe('reward_redemption_completed');
      expect(redeemTemplate.data.screen).toBe('Ledger');
    });
  });

  // ==========================================================================
  // 6. Partner Portal Overview & Reward Management
  // ==========================================================================
  describe('Partner Portal Overview & Rewards Management', () => {
    it('returns authoritative overview metrics and distinct customer counts', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === rewardService.TABLE_PARTNER_STAFF) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [{ partner_id: 'part-1' }],
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PARTNERS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'part-1',
                name: 'Filmhouse Cinemas',
                logo_image_url: 'https://cdn.example.com/logo.jpg',
                points_balance: 5000,
              },
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARD_REDEMPTIONS) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'r-1',
                  user_id: 'u-1',
                  reward_id: 'rew-1',
                  points_spent: 150,
                  status: 'completed',
                  created_at: '2026-11-09T14:00:00.000Z',
                },
                {
                  id: 'r-2',
                  user_id: 'u-1', // same user
                  reward_id: 'rew-1',
                  points_spent: 150,
                  status: 'completed',
                  created_at: '2026-11-09T15:00:00.000Z',
                },
                {
                  id: 'r-3',
                  user_id: 'u-2',
                  reward_id: 'rew-2',
                  points_spent: 200,
                  status: 'completed',
                  created_at: '2026-11-09T16:00:00.000Z',
                },
              ],
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_PROFILES) {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: [
                { id: 'u-1', first_name: 'Ayodele', last_name: 'O', photo_url: 'https://avatar.jpg' },
                { id: 'u-2', first_name: 'Tami', last_name: 'A', photo_url: null },
              ],
              error: null,
            }),
          } as any;
        }
        if (table === rewardService.TABLE_REWARDS) {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: [
                { id: 'rew-1', title: 'Popcorn' },
                { id: 'rew-2', title: 'Soda' },
              ],
              error: null,
            }),
          } as any;
        }
        return {} as any;
      });

      const overview = await rewardService.getPartnerPortalOverview('staff-1');

      expect(overview.partner.name).toBe('Filmhouse Cinemas');
      expect(overview.summary.redemptions).toBe(3);
      expect(overview.summary.coinsRedeemed).toBe(500); // 150 + 150 + 200
      expect(overview.summary.customers).toBe(2); // u-1 and u-2
      expect(overview.summary.partnerPointsBalance).toBe(5000);
      expect(overview.summary.coinsValueRedeemed).toBe(5000);
      expect(overview.recentRedemptions).toHaveLength(3);
      expect(overview.recentRedemptions[0].userName).toBe('Ayodele O');
      expect(overview.recentRedemptions[0].statusLabel).toBe('Redeemed');
    });

    it('createPartnerReward validates title and pointsCost', async () => {
      jest.spyOn(supabase, 'from').mockImplementationOnce(
        () =>
          ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'staff-rel-1' },
              error: null,
            }),
          } as any)
      );

      await expect(
        rewardService.createPartnerReward('staff-1', 'part-1', {
          title: '',
          pointsCost: 100,
        })
      ).rejects.toMatchObject({
        status: 400,
        error: 'validation_error',
      });
    });
  });
});
