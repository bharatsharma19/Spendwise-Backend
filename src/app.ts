import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestLogger } from './middleware/requestLogger';
import { env } from './config/env.config';
import routes from './routes';
import { logger } from './utils/logger';

const app: Application = express();

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
app.use('/api/auth', routes.authRoutes);
app.use('/api/users', routes.userRoutes);
app.use('/api/expenses', routes.expenseRoutes);
app.use('/api/analytics', routes.analyticsRoutes);

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
