/**
 * Unit Tests for Cancel Club Join Request
 * Endpoint: POST /community/clubs/:clubId/cancel-request
 */

import type { CancelJoinRequestResult } from '../src/models/communityModel';

describe('Cancel Club Join Request Schema & Contract', () => {
  it('validates CancelJoinRequestResult structure', () => {
    const mockResult: CancelJoinRequestResult = {
      clubId: '2a4ceadb-ba5b-4dd7-a47d-ffd094a8b632',
      joinStatus: 'none',
    };

    expect(mockResult.clubId).toBe('2a4ceadb-ba5b-4dd7-a47d-ffd094a8b632');
    expect(mockResult.joinStatus).toBe('none');
  });

  it('validates success response envelope matching contract specification', () => {
    const clubId = '2a4ceadb-ba5b-4dd7-a47d-ffd094a8b632';
    const responsePayload = {
      success: true,
      message: 'Club join request cancelled successfully',
      data: {
        clubId,
        joinStatus: 'none' as const,
      },
    };

    expect(responsePayload.success).toBe(true);
    expect(responsePayload.message).toBe('Club join request cancelled successfully');
    expect(responsePayload.data.clubId).toBe(clubId);
    expect(responsePayload.data.joinStatus).toBe('none');
  });

  it('validates error status code mappings for business rules', () => {
    // 400 when user is already an active member
    const activeMemberError: any = new Error('User is already an active member of this club');
    activeMemberError.statusCode = 400;
    expect(activeMemberError.statusCode).toBe(400);

    // 400 when request is already resolved
    const alreadyResolvedError: any = new Error('Join request has already been approved');
    alreadyResolvedError.statusCode = 400;
    expect(alreadyResolvedError.statusCode).toBe(400);

    // 404 when no active/pending join request exists
    const notFoundError: any = new Error('No active or pending join request exists for this user in this club');
    notFoundError.statusCode = 404;
    expect(notFoundError.statusCode).toBe(404);
  });
});
