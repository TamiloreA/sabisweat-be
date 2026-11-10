import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { QRTokenPayload } from '../models/rewardModel';

const getJwtSecretKey = (): string => {
  return (
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'sabi-sweat-dev-secret-qr-key-32chars!!'
  );
};

/**
 * Generate a cryptographically random nonce string.
 */
export function generateNonce(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a signed JWT for reward pre-redemption QR code.
 * Valid for 15 minutes by default.
 */
export async function generateRewardQRToken(
  payload: Omit<QRTokenPayload, 'exp'>,
  expiresInSeconds = 15 * 60
): Promise<string> {
  const secret = getJwtSecretKey();
  return jwt.sign(
    {
      userId: payload.userId,
      rewardId: payload.rewardId,
      partnerId: payload.partnerId,
      pointsCost: payload.pointsCost,
      nonce: payload.nonce,
    },
    secret,
    { expiresIn: expiresInSeconds }
  );
}

/**
 * Verify and decode a reward QR token.
 * Throws an error if invalid, tampered, or expired.
 */
export async function verifyRewardQRToken(token: string): Promise<QRTokenPayload> {
  const secret = getJwtSecretKey();
  const decoded = jwt.verify(token, secret) as any;

  const userId = String(decoded.userId || '');
  const rewardId = String(decoded.rewardId || '');
  const partnerId = String(decoded.partnerId || '');
  const pointsCost = Number(decoded.pointsCost ?? -1);
  const nonce = String(decoded.nonce || '');

  if (!userId || !rewardId || !partnerId || pointsCost < 0 || !nonce) {
    throw new Error('invalid_qr_payload');
  }

  return {
    userId,
    rewardId,
    partnerId,
    pointsCost,
    nonce,
    exp: decoded.exp,
  };
}
