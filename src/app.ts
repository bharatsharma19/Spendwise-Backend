import compression from 'compression';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.config';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestLogger } from './middleware/requestLogger';
import routes from './routes';
import v1Router from './routes/v1.routes';
import { logger } from './utils/logger';

import { v4 as uuidv4 } from 'uuid';

const app: Application = express();

// Request ID Middleware (UUID per request)
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://*.firebaseio.com', 'https://firestore.googleapis.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
    // Add strict transport security in production
    ...(env.NODE_ENV === 'production' && {
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
    }),
  })
);

// Request timeout middleware
const requestTimeout = 30 * 1000; // 30 seconds in milliseconds
app.use((req: Request, res: Response, next: NextFunction) => {
  // Set timeout for all requests
  res.setTimeout(requestTimeout, () => {
    logger.warn(`Request timeout for ${req.originalUrl}`);
    if (!res.headersSent) {
      res.status(503).json({
        status: 'error',
        message: 'Request timeout, please try again',
      });
    }
  });
  next();
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP based on environment
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again after 15 minutes',
    });
  },
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// CORS configuration with proper options
const corsOptions = {
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24 hours in seconds - cache preflight requests
};
app.use(cors(corsOptions));

// Request parsing with size limits for security
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Compression for all responses
app.use(compression());

// Logging based on environment
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}
app.use(requestLogger);

// API Routes

// ...

// API V1 Routes
app.use('/api/v1', v1Router);

// Legacy API Routes (Deprecated)
const legacyDeprecationMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-API-Deprecation', 'true');
  res.setHeader(
    'X-API-Deprecation-Message',
    'This API version is deprecated. Please upgrade to /api/v1'
  );
  next();
};

app.use('/api/auth', legacyDeprecationMiddleware, routes.authRoutes);
app.use('/api/users', legacyDeprecationMiddleware, routes.userRoutes);
app.use('/api/expenses', legacyDeprecationMiddleware, routes.expenseRoutes);
app.use('/api/groups', legacyDeprecationMiddleware, routes.groupRoutes);
app.use('/api/analytics', legacyDeprecationMiddleware, routes.analyticsRoutes);
app.use('/api/notifications', legacyDeprecationMiddleware, routes.notificationRoutes);

// Root endpoint
app.get('/', (_, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to SpendWise API',
    version: '1.0.0',
    documentation: '/api-docs', // Placeholder for future Swagger docs
  });
});

// Health check endpoint
app.get('/health', (_, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
