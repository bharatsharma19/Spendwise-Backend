import { NextFunction, Request, Response } from 'express';

// Mock user object matching your User model
export const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  phone_number: '+1234567890',
  display_name: 'Test User',
  preferences: {
    currency: 'USD',
    language: 'en',
    notifications: { email: true, push: true, sms: false },
    theme: 'system',
    budgetAlerts: true,
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_email_verified: true,
  is_phone_verified: true,
  status: 'active',
};

// The middleware mock function
export const mockAuthenticate = (req: Request, _res: Response, next: NextFunction) => {
  // Inject the mock user into the request
  (req as any).user = mockUser;
  next();
};
