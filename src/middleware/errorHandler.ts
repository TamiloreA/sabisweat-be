import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', err.message);

  const statusCode =
    (typeof err.status === 'number' && err.status) ||
    (typeof err.statusCode === 'number' && err.statusCode) ||
    500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
};

