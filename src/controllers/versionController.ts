import { Request, Response, NextFunction } from 'express';
import * as versionService from '../services/versionService';

export const getAppVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const platform = (req.query.platform as string) || (req.headers['x-platform'] as string);
    const versionConfig = await versionService.getAppVersion(platform);

    res.status(200).json({
      success: true,
      latestVersion: versionConfig.latestVersion,
      minimumVersion: versionConfig.minimumVersion,
      forceUpdate: versionConfig.forceUpdate,
      data: versionConfig,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAppVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await versionService.updateAppVersion(req.body);
    res.status(200).json({
      success: true,
      message: 'App version updated successfully',
      latestVersion: updated.latestVersion,
      minimumVersion: updated.minimumVersion,
      forceUpdate: updated.forceUpdate,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};
