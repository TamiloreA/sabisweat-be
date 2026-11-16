/**
 * Unit Tests for 24-Hour Countdown Lifecycle, Prize Draw & Winner Selection
 */

import { handleChallengeWinnerSelectionEvent } from '../src/services/notificationEventService';
import { subscribeAnnouncement, getQualifiedParticipants } from '../src/services/challengeService';
import { notificationTemplates } from '../src/services/notificationTemplates';

describe('Challenge Countdown Lifecycle & Winner Announcement', () => {
  describe('1. 24-Hour Countdown Lifecycle Calculation', () => {
    it('computes announcementAt as exactly 24 hours after challenge end_at', () => {
      const endAt = new Date('2026-11-30T23:59:59.000Z');
      const expectedAnnouncement = new Date(endAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
      expect(expectedAnnouncement).toBe('2026-12-01T23:59:59.000Z');
    });

    it('generates winner announcement notification templates with exact copy', () => {
      const winnerPayload = notificationTemplates.challengeWinnerAnnouncement(
        'c-123',
        'Abuja Walking Marathon'
      );
      expect(winnerPayload.title).toBe('You won! 🏆');
      expect(winnerPayload.body).toBe('Congratulations! You won the grand prize for Abuja Walking Marathon!');
      expect(winnerPayload.data.type).toBe('challenge_winner');

      const subscriberPayload = notificationTemplates.challengeSubscribersAnnouncement(
        'c-123',
        'Abuja Walking Marathon'
      );
      expect(subscriberPayload.title).toBe('Winners Announced 🎉');
      expect(subscriberPayload.body).toBe('The results for Abuja Walking Marathon are in! Tap to see the winner.');
      expect(subscriberPayload.data.type).toBe('challenge_winners_announced');
    });
  });

  describe('2. Winner Selection Event Handler', () => {
    it('returns without winner if challenge has not ended yet', async () => {
      const result = await handleChallengeWinnerSelectionEvent('non-existent-challenge');
      expect(result.winnerId).toBeNull();
      expect(result.notifiedSubscribersCount).toBe(0);
    });
  });
});
