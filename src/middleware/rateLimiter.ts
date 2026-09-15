/**
 * Rate Limiter Middleware
 * Protects auth endpoints from brute-force attacks.
 */

import rateLimit from 'express-rate-limit';

/**
 * Strict limiter for auth endpoints (login, register, forgot password)
 * 10 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: {
    error: 'attempts_exceeded',
    message: 'Too many attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  },
});

/**
 * Standard limiter for general API endpoints
 * 100 requests per minute per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10000,
  message: {
    error: 'attempts_exceeded',
    message: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
