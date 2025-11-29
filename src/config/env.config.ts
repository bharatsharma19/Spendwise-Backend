import { config } from 'dotenv';
import Joi from 'joi';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

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

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:19006'),

  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_PRIVATE_KEY: Joi.string().required(),
  FIREBASE_CLIENT_EMAIL: Joi.string().email().required(),
  FIREBASE_API_KEY: Joi.string().required(),

  EMAIL_USER: Joi.string().email().allow('').default(''),
  EMAIL_APP_PASSWORD: Joi.string().allow('').default(''),

  TWILIO_ACCOUNT_SID: Joi.string().required(),
  TWILIO_AUTH_TOKEN: Joi.string().required(),
  TWILIO_VERIFY_SERVICE_ID: Joi.string().allow('').default(''),
  TWILIO_PHONE_NUMBER: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env, {
  allowUnknown: true,
  abortEarly: false,
});

if (error && process.env.NODE_ENV !== 'test') {
  throw new AppError(
    `Config validation error: ${error.message}`,
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

// Provide default mock values for test environment if validation failed
const safeEnvVars =
  process.env.NODE_ENV === 'test' && error
    ? {
        ...process.env,
        NODE_ENV: 'test',
        PORT: 5000,
        FRONTEND_URL: 'http://localhost:3000',
        ALLOWED_ORIGINS: 'http://localhost:3000',
        FIREBASE_PROJECT_ID: 'test-project',
        FIREBASE_PRIVATE_KEY: 'test-key',
        FIREBASE_CLIENT_EMAIL: 'test@example.com',
        FIREBASE_API_KEY: 'test-api-key',
        EMAIL_USER: '',
        EMAIL_APP_PASSWORD: '',
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token',
        TWILIO_VERIFY_SERVICE_ID: '',
        TWILIO_PHONE_NUMBER: '1234567890',
        JWT_SECRET: 'test-secret-key-must-be-at-least-32-chars-long',
        JWT_EXPIRES_IN: '1d',
      }
    : envVars;

export const env: EnvConfig = {
  NODE_ENV: safeEnvVars.NODE_ENV,
  PORT: safeEnvVars.PORT,
  FRONTEND_URL: safeEnvVars.FRONTEND_URL,
  ALLOWED_ORIGINS:
    typeof safeEnvVars.ALLOWED_ORIGINS === 'string'
      ? safeEnvVars.ALLOWED_ORIGINS.split(',')
      : safeEnvVars.ALLOWED_ORIGINS,

  FIREBASE_PROJECT_ID: safeEnvVars.FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY: safeEnvVars.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
  FIREBASE_CLIENT_EMAIL: safeEnvVars.FIREBASE_CLIENT_EMAIL,
  FIREBASE_API_KEY: safeEnvVars.FIREBASE_API_KEY,

  EMAIL_USER: safeEnvVars.EMAIL_USER,
  EMAIL_APP_PASSWORD: safeEnvVars.EMAIL_APP_PASSWORD,

  TWILIO_ACCOUNT_SID: safeEnvVars.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: safeEnvVars.TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_ID: safeEnvVars.TWILIO_VERIFY_SERVICE_ID,
  TWILIO_PHONE_NUMBER: safeEnvVars.TWILIO_PHONE_NUMBER,

  JWT_SECRET: safeEnvVars.JWT_SECRET,
  JWT_EXPIRES_IN: safeEnvVars.JWT_EXPIRES_IN,
};

export default env;
