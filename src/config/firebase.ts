import { config } from 'dotenv';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { env } from './env.config';

// Load environment variables
config();

console.log('Current NODE_ENV:', process.env.NODE_ENV);

let firebaseApp: admin.app.App;

// Export Firebase services
export let auth: any;
export let db: any;
export let firebaseAdmin: any = admin;

if (process.env.NODE_ENV === 'test') {
  logger.info('Test environment detected, skipping Firebase initialization');
  auth = {} as any;
  db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({}) }),
        set: async () => {},
        update: async () => {},
        delete: async () => {},
      }),
      where: () => ({ get: async () => ({ docs: [] }) }),
      add: async () => ({ id: 'test-id' }),
    }),
  } as any;
} else {
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

    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);

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
      }
    })();
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin:', error);
    if (error instanceof Error) {
      logger.error(`Error details: ${error.message}`);
    }
    throw new Error(
      'Firebase initialization failed. Check your environment variables and credentials.'
    );
  }
}
