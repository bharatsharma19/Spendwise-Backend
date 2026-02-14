import { config } from 'dotenv';
import Joi from 'joi';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

config();

export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string[];

  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;

  // Email (Gmail SMTP)
  EMAIL_USER: string;
  EMAIL_APP_PASSWORD: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  CRON_SECRET: string;
}

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:19006'),

  SUPABASE_URL: Joi.string().uri().required(),

  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  EMAIL_USER: Joi.string().email().required(),
  EMAIL_APP_PASSWORD: Joi.string().required(),

  TWILIO_ACCOUNT_SID: Joi.string().required(),
  TWILIO_AUTH_TOKEN: Joi.string().required(),
  TWILIO_PHONE_NUMBER: Joi.string().required(),
  CRON_SECRET: Joi.string().required(),
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
const safeEnvVars = envVars;

export const env: EnvConfig = {
  NODE_ENV: safeEnvVars.NODE_ENV,
  PORT: safeEnvVars.PORT,
  FRONTEND_URL: safeEnvVars.FRONTEND_URL,
  ALLOWED_ORIGINS:
    typeof safeEnvVars.ALLOWED_ORIGINS === 'string'
      ? safeEnvVars.ALLOWED_ORIGINS.split(',')
      : safeEnvVars.ALLOWED_ORIGINS,

  SUPABASE_URL: safeEnvVars.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: safeEnvVars.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: safeEnvVars.SUPABASE_ANON_KEY,

  EMAIL_USER: safeEnvVars.EMAIL_USER,
  EMAIL_APP_PASSWORD: safeEnvVars.EMAIL_APP_PASSWORD,

  TWILIO_ACCOUNT_SID: safeEnvVars.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: safeEnvVars.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: safeEnvVars.TWILIO_PHONE_NUMBER,
  CRON_SECRET: safeEnvVars.CRON_SECRET,
};

export default env;
