import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;
  const userAgent = req.get('user-agent');

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const contentLength = res.get('content-length');

    logger.info('HTTP Request', {
      method,
      url: originalUrl,
      status: statusCode,
      duration: `${duration}ms`,
      contentLength,
      ip,
      userAgent,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      body: Object.keys(req.body).length > 0 ? req.body : undefined,
    });
  });

  next();
};
