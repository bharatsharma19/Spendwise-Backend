import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/error';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Log error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.status,
      type: err.type,
      message: err.message,
      ...(env.NODE_ENV === 'development' && {
        stack: err.stack,
        isOperational: err.isOperational,
      }),
    });
  }

  // Send generic error response
  return res.status(500).json({
    status: 'error',
    type: 'InternalServerError',
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
};
