import { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { User } from '../models/user.model';
import { AuthenticationError } from '../utils/error';

export interface AuthRequest extends Request {
  user?: User; // This is now a Partial User effectively
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

    // REAL WORLD FIX: Do not hardcode default preferences here.
    // If you populate defaults here, you might accidentally overwrite
    // real DB data if a controller uses this object to "update" the user.
    // We only populate what we verify from the token.
    (req as AuthRequest).user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      phoneNumber: decodedToken.phone_number || '',
      displayName: decodedToken.name || '',
      photoURL: decodedToken.picture || '',
      isEmailVerified: decodedToken.email_verified || false,
      isPhoneVerified: !!decodedToken.phone_number,
      // Defaulting status to active for the request context,
      // but specific business logic should check the DB if 'suspended' is a real concern.
      status: 'active',
      // Initialize required empty objects to prevent crashes, but don't assume values
      // preferences: {} as any, // REMOVED: Do not assume defaults
      createdAt: {} as any,
      updatedAt: {} as any,
    } as User; // Cast to User but be aware it's partial

    next();
  } catch (error) {
    // Log the actual error for debugging
    // console.error(error);
    next(new AuthenticationError('Authentication failed'));
  }
};
