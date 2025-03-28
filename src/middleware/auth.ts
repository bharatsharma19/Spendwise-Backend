import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { AuthenticationError } from '../utils/error';
import { User } from '../models/user.model';
import { Timestamp } from 'firebase-admin/firestore';

export interface AuthRequest extends Request {
  user?: User;
}

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AuthenticationError('Invalid token format');
    }

    const decodedToken = await getAuth().verifyIdToken(token);
    if (!decodedToken.uid) {
      throw new AuthenticationError('Invalid token');
    }

    // Add user to request
    (req as AuthRequest).user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      phoneNumber: decodedToken.phone_number || '',
      displayName: decodedToken.name || '',
      photoURL: decodedToken.picture || '',
      preferences: {
        currency: 'USD',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          sms: true,
        },
        theme: 'system',
        budgetAlerts: true,
        monthlyBudget: 0,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      isEmailVerified: decodedToken.email_verified || false,
      isPhoneVerified: !!decodedToken.phone_number,
      status: 'active',
    };

    next();
  } catch (error) {
    next(new AuthenticationError('Authentication failed'));
  }
};
