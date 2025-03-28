import { Router, RequestHandler, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';

export abstract class BaseRouter {
  protected router: Router;
  protected limiter: RequestHandler;

  constructor() {
    this.router = Router();
    this.limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again after 15 minutes',
    });
  }

  // Helper function to convert AuthRequest handler to RequestHandler with proper typing
  protected asRequestHandler(
    fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
  ): RequestHandler {
    return (req, res, next) => {
      Promise.resolve(fn(req as AuthRequest, res, next)).catch((error) => {
        logger.error('Request handler error:', error);
        next(error);
      });
    };
  }

  // Helper function to add a protected route with validation
  protected addProtectedRoute(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
    handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>,
    schema?: any
  ) {
    const middlewares: RequestHandler[] = [this.limiter, authenticate];

    if (schema) {
      middlewares.push(validateRequest(schema));
    }

    this.router[method](path, ...middlewares, this.asRequestHandler(handler));
  }

  // Helper function to add a public route with validation
  protected addPublicRoute(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
    handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>,
    schema?: any
  ) {
    const middlewares: RequestHandler[] = [this.limiter];

    if (schema) {
      middlewares.push(validateRequest(schema));
    }

    this.router[method](path, ...middlewares, this.asRequestHandler(handler));
  }

  // Get the router instance
  public getRouter(): Router {
    return this.router;
  }
}
