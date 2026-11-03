/**
 * Device Controller
 * Request handlers for push token and device registration.
 */

import { Request, Response, NextFunction } from 'express';
import * as deviceService from '../services/deviceService';

export const registerDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const device = await deviceService.registerDevice(userId, req.body);
    res.status(200).json({
      success: true,
      message: 'Push token registered successfully',
      data: device,
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const unregisterDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const token = req.body.token;
    await deviceService.unregisterDevice(userId, token);
    res.status(200).json({
      success: true,
      message: 'Push token unregistered successfully',
    });
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const getUserDevices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const devices = await deviceService.getUserDevices(userId);
    res.status(200).json({
      success: true,
      data: devices,
    });
  } catch (error) {
    next(error);
  }
};
