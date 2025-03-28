import * as admin from 'firebase-admin';
import { env } from './env.config';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
config();

let firebaseApp: admin.app.App;

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
  throw error;
}

// Export Firebase services
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Test database connection
db.collection('test')
  .doc('test')
  .get()
  .then(() => {
    console.log('Successfully connected to Firestore');
  })
  .catch((error) => {
    console.error('Error connecting to Firestore:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  });

// Export Firebase app instance
export const firebaseAdmin = admin;
