import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { AuthRequest } from './auth';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const contentLength = res.get('content-length');

    // Only log safe, non-sensitive fields
    logger.info('HTTP Request', {
      requestId: req.headers['x-request-id'],
      userId: (req as AuthRequest).user?.uid,
      method,
      route: originalUrl,
      status: statusCode,
      duration: `${duration}ms`,
      contentLength,
      ip,
    });
  });

  next();
};
