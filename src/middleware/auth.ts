import { NextFunction, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { User } from '../models/user.model';
import { AuthenticationError } from '../utils/error';

export interface AuthRequest extends Request {
  user?: User;
  /** Raw JWT token for creating user-scoped Supabase clients */
  token?: string;
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new AuthenticationError('Invalid token');
    }

    // Fetch user profile from 'profiles' table (renamed from 'users' collection to avoid conflict with auth schema)
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    (req as AuthRequest).user = {
      uid: user.id,
      email: user.email || '',
      phoneNumber: user.phone || '',
      // Merge Auth data with Profile data
      ...userProfile,
    } as User; // Cast to User model

    // Attach raw JWT token for user-scoped Supabase clients
    (req as AuthRequest).token = token;

    next();
  } catch (error) {
    next(new AuthenticationError('Authentication failed'));
  }
};
