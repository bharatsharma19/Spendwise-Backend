import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.config';
import { AppError } from '../utils/error';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error — only safe, non-sensitive fields
  logger.error('Error:', {
    requestId: req.headers['x-request-id'],
    userId: (req as unknown as { user?: { uid?: string } }).user?.uid,
    route: req.path,
    method: req.method,
    message: err.message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: err.status,
      type: err.type,
      message: err.message,
      ...(env.NODE_ENV === 'development' && {
        stack: err.stack,
        isOperational: err.isOperational,
      }),
    });
    return;
  }

  // Send generic error response
  res.status(500).json({
    status: 'error',
    type: 'InternalServerError',
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
};
