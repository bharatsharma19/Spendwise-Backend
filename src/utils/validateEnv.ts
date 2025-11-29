import { config } from 'dotenv';

// Load environment variables
config();

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'FRONTEND_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EMAIL_USER',
  'EMAIL_APP_PASSWORD',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
] as const;

export const validateEnv = (): void => {
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

  try {
    new URL(process.env.SUPABASE_URL!);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL');
  }
};
