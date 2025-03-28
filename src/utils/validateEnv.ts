import { config } from 'dotenv';

// Load environment variables
config();

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'FRONTEND_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
] as const;

export const validateEnv = () => {
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  // Validate specific environment variables
  if (!['development', 'production', 'test'].includes(process.env.NODE_ENV!)) {
    throw new Error('NODE_ENV must be development, production, or test');
  }

  if (isNaN(Number(process.env.PORT))) {
    throw new Error('PORT must be a number');
  }

  try {
    new URL(process.env.FRONTEND_URL!);
  } catch {
    throw new Error('FRONTEND_URL must be a valid URL');
  }

  if (process.env.JWT_SECRET!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  // Validate Firebase credentials
  try {
    JSON.parse(process.env.FIREBASE_PRIVATE_KEY!);
  } catch {
    throw new Error('FIREBASE_PRIVATE_KEY must be a valid JSON string');
  }
};
