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

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new AppError(
    `Config validation error: ${error.message}`,
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    ErrorType.VALIDATION
  );
}

export const env: EnvConfig = {
  NODE_ENV: envVars.NODE_ENV,
  PORT: envVars.PORT,
  FRONTEND_URL: envVars.FRONTEND_URL,
  ALLOWED_ORIGINS: envVars.ALLOWED_ORIGINS.split(','),

  FIREBASE_PROJECT_ID: envVars.FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY: envVars.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
  FIREBASE_CLIENT_EMAIL: envVars.FIREBASE_CLIENT_EMAIL,
  FIREBASE_API_KEY: envVars.FIREBASE_API_KEY,

  EMAIL_USER: envVars.EMAIL_USER,
  EMAIL_APP_PASSWORD: envVars.EMAIL_APP_PASSWORD,

  TWILIO_ACCOUNT_SID: envVars.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: envVars.TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_ID: envVars.TWILIO_VERIFY_SERVICE_ID,
  TWILIO_PHONE_NUMBER: envVars.TWILIO_PHONE_NUMBER,

  JWT_SECRET: envVars.JWT_SECRET,
  JWT_EXPIRES_IN: envVars.JWT_EXPIRES_IN,
};

export default env;
