import { config } from 'dotenv';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';

config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string[];

  // Firebase
  FIREBASE_PROJECT_ID: string;
  FIREBASE_PRIVATE_KEY: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_API_KEY: string;

  // Email (Gmail)
  EMAIL_USER: string;
  EMAIL_APP_PASSWORD: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_VERIFY_SERVICE_ID: string;
  TWILIO_PHONE_NUMBER: string;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
}

export const env: EnvConfig = {
  // Server
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  PORT: Number(process.env.PORT) || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  ALLOWED_ORIGINS: (
    process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:19006'
  ).split(','),

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || '',

  // Email (Gmail)
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD || '',

  // Twilio
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_VERIFY_SERVICE_ID: process.env.TWILIO_VERIFY_SERVICE_ID || '',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};

// Validate required environment variables
const requiredEnvVars: (keyof EnvConfig)[] = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'JWT_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!env[envVar]) {
    throw new AppError(
      `Missing required environment variable: ${envVar}`,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      ErrorType.DATABASE
    );
  }
}

// Validate specific environment variables
if (!['development', 'production', 'test'].includes(env.NODE_ENV)) {
  throw new AppError(
    'NODE_ENV must be development, production, or test',
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

if (isNaN(env.PORT)) {
  throw new AppError(
    'PORT must be a number',
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

try {
  new URL(env.FRONTEND_URL);
} catch {
  throw new AppError(
    'FRONTEND_URL must be a valid URL',
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

if (env.JWT_SECRET.length < 32) {
  throw new AppError(
    'JWT_SECRET must be at least 32 characters long',
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

// Validate Firebase credentials
try {
  env.FIREBASE_PRIVATE_KEY;
} catch {
  throw new AppError(
    'FIREBASE_PRIVATE_KEY must be a valid JSON string',
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

export default env;
