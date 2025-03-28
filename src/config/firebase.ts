import * as admin from 'firebase-admin';
import { env } from './env.config';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
config();

let firebaseApp: admin.app.App;

/**
 * Initialize Firebase Admin SDK
 * This function initializes Firebase Admin SDK with credentials from environment variables.
 * If Firebase Admin is already initialized, it uses the existing instance.
 */
try {
  // Check if Firebase is already initialized
  if (admin.apps.length === 0) {
    // Initialize Firebase Admin
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
      }),
    });

    logger.info('Firebase Admin initialized successfully');
  } else {
    const existingApp = admin.apps[0];
    if (!existingApp) {
      throw new Error('Failed to get existing Firebase Admin instance');
    }
    firebaseApp = existingApp;
    logger.info('Using existing Firebase Admin instance');
  }
} catch (error) {
  logger.error('Failed to initialize Firebase Admin:', error);
  // Use a more descriptive error message
  if (error instanceof Error) {
    logger.error(`Error details: ${error.message}`);
  }
  throw new Error(
    'Firebase initialization failed. Check your environment variables and credentials.'
  );
}

// Export Firebase services
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Validate Firebase connection asynchronously without blocking server startup
(async () => {
  try {
    // Simple read operation to validate connection without creating test documents
    await db.collection('_connection_test_').limit(1).get();
    logger.info('Successfully connected to Firestore');
  } catch (error) {
    logger.error('Error connecting to Firestore:');
    if (error instanceof Error) {
      logger.error(`Code: ${(error as any).code || 'N/A'}`);
      logger.error(`Message: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
    } else {
      logger.error(`Unknown error: ${String(error)}`);
    }
    // Don't throw here to prevent crashing the app during startup
    // Connection issues will be handled by request handlers
  }
})();

// Export Firebase app instance
export const firebaseAdmin = admin;
