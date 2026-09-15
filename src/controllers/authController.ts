/**
 * Auth Controller
 * Route handlers for all authentication endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * POST /auth/register
 */
export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body);
    res.status(result.status).json({
      success: true,
      data: {
        status: result.accountStatus,
        user: result.user,
      },
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/login
 */
export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/social/GoogleAndApple
 */
export const socialLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Missing authorization token' });
      return;
    }

    const token = authHeader.substring(7);
    const result = await authService.socialLogin(token);
    res.status(200).json({ success: true, data: result.user });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/forgot
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.forgotPassword(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/verify
 */
export const verifyCode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.verifyResetCode(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/reset
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/refresh
 */
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.refreshToken(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/logout
 */
export const logoutUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const result = await authService.logout(token);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    // Logout should always succeed from the client's perspective
    res.status(200).json({ success: true, data: { ok: true } });
  }
};

/**
 * GET /auth/me
 */
export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }
    const user = await authService.getAuthenticatedUser(req.user.id);
    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * POST /auth/change-password
 */
export const changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'unauthorized', message: 'Not authenticated' });
      return;
    }
    const result = await authService.changePassword(req.user.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, error: error.error, message: error.message });
      return;
    }
    next(error);
  }
};
