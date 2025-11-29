import { NextFunction, Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';

// Mock user object matching your User model
export const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  phoneNumber: '+1234567890',
  displayName: 'Test User',
  preferences: {
    currency: 'USD',
    language: 'en',
    notifications: { email: true, push: true, sms: false },
    theme: 'system' as const,
    budgetAlerts: true,
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  isEmailVerified: true,
  isPhoneVerified: true,
  status: 'active' as const,
};

// The middleware mock function
export const mockAuthenticate = (req: Request, _res: Response, next: NextFunction): void => {
  // Inject the mock user into the request
  (req as AuthRequest).user = mockUser;
  next();
};
