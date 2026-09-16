import { Request, Response, NextFunction } from 'express';

export interface AuthClaims {
  sub: string;
  id: string;
  email?: string;
  exp?: number;
  user_metadata?: Record<string, any>;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthClaims;
  token?: string;
}

/**
 * Decodes the JWT payload without verifying the signature.
 * The mobile app sends a Supabase access token issued by the auth project.
 * For local development this is sufficient; the token came from a real
 * login on a trusted client.
 *
 * TODO(production): verify the signature against SUPABASE_JWKS_URL
 * (e.g. with the `jose` package and a cached remote JWKS).
 */
function decodeJwtPayload(token: string): Omit<AuthClaims, 'id'> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Missing Authorization header' });
    return;
  }

  const claims = decodeJwtPayload(token);
  if (!claims?.sub) {
    res.status(401).json({ success: false, message: 'Invalid token' });
    return;
  }

  // Check if token is expired
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    res.status(401).json({ success: false, message: 'Token expired' });
    return;
  }

  req.user = { ...claims, id: claims.sub };
  req.token = token;
  next();
};
