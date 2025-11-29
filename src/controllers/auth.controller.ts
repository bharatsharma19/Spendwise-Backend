import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { env } from '../config/env.config';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';
import { logger } from '../utils/logger';
import { authSchema } from '../validations/auth.schema';

export class AuthController {
  private static instance: AuthController;

  private constructor() {}

  public static getInstance(): AuthController {
    if (!AuthController.instance) {
      AuthController.instance = new AuthController();
    }
    return AuthController.instance;
  }

  private handleValidationError(
    error: Joi.ValidationError | { details?: Array<{ message: string }> }
  ): never {
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      throw new ValidationError(error.details[0].message, []);
    }
    throw new ValidationError('Validation failed', []);
  }

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { error, value } = authSchema.register.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { email, password, phoneNumber, displayName } = value;

      // Format phone number to E.164 format (only if provided)
      const formattedPhoneNumber = phoneNumber
        ? phoneNumber.startsWith('+')
          ? phoneNumber
          : `+${phoneNumber}`
        : undefined;

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email || undefined,
        password,
        phone: formattedPhoneNumber || undefined,
        options: {
          data: {
            display_name: displayName,
            phone_number: formattedPhoneNumber || '',
          },
        },
      });

      if (authError) {
        throw new AppError(authError.message, HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION);
      }

      if (!authData.user) {
        throw new AppError(
          'Failed to create user',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      // Create user profile in 'profiles' table (if not handled by trigger)
      // Note: If email confirmation is enabled, the user might not be fully active yet.
      // However, we use Service Role key so we can insert into profiles.
      // Frontend should handle the "check email" flow.
      // We use upsert to handle potential race conditions if a trigger also creates the profile.
      const userData = {
        id: authData.user.id,
        email: authData.user.email || email || '',
        phone_number: formattedPhoneNumber || authData.user.phone || '',
        display_name: displayName,
        photo_url: '',
        preferences: {
          currency: 'INR',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_email_verified: false,
        is_phone_verified: false,
        status: 'active',
      };

      const { error: profileError } = await supabase.from('profiles').upsert(userData);

      if (profileError) {
        logger.error('Profile creation failed:', profileError);
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw new AppError(
          'Failed to create user profile. Please try again.',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      res.status(201).json({
        status: 'success',
        data: {
          uid: authData.user.id,
          email: authData.user.email,
          phoneNumber: formattedPhoneNumber,
          displayName: displayName,
          message: 'Please check your email to verify your account',
        },
      });
    } catch (error: unknown) {
      logger.error('Registration error:', error);
      next(error);
    }
  };

  public login = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    next(
      new AppError(
        'Server-side login is deprecated. Please use client-side Supabase SDK to login.',
        HttpStatusCode.GONE,
        ErrorType.VALIDATION
      )
    );
  };

  public sendEmailVerification = async (uid: string): Promise<void> => {
    try {
      const { data: user, error: userError } = await supabase.auth.admin.getUserById(uid);
      if (userError || !user.user.email) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.user.email,
        options: {
          emailRedirectTo: `${env.FRONTEND_URL}/verify-email`,
        },
      });

      if (error) throw error;
    } catch (error) {
      logger.error('Error sending email verification:', error);
      throw error;
    }
  };

  public verifyEmail = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    res.json({
      status: 'success',
      message: 'Please use the verification link sent to your email.',
    });
  };

  public resendEmailVerification = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { error, value } = authSchema.resendEmailVerification.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { email } = value;

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${env.FRONTEND_URL}/verify-email`,
        },
      });

      if (resendError) {
        throw new AppError(resendError.message, HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION);
      }

      res.json({
        status: 'success',
        message: 'Email verification link sent successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public verifyPhone = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { error, value } = authSchema.verifyPhone.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { phoneNumber } = value;
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: formattedPhoneNumber,
      });

      if (otpError) {
        throw new AppError(otpError.message, HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION);
      }

      res.json({
        status: 'success',
        message: 'OTP sent successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public verifyPhoneCode = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { error, value } = authSchema.verifyPhoneCode.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { phoneNumber, code } = value;
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // 1. Verify OTP via Twilio
      const { TwilioService } = await import('../services/twilio.service');
      const isValid = await TwilioService.getInstance().verifyOTP(formattedPhoneNumber, code);
      if (!isValid) {
        throw new AppError('Invalid OTP', HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION);
      }

      // 2. Find User
      const { data: listData } = await supabase.auth.admin.listUsers();
      const user = listData.users.find((u) => u.phone === formattedPhoneNumber);
      if (!user) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }

      // 3. Mark Verified
      await supabase
        .from('profiles')
        .update({ is_phone_verified: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      // 4. Generate Session Link
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email || `phone-${user.phone}@placeholder.spendwise.com`,
        options: { redirectTo: `${env.FRONTEND_URL}/dashboard` },
      });

      res.json({
        status: 'success',
        message: 'Phone verified',
        // Return this so frontend can log the user in
        actionLink: linkData.properties?.action_link,
      });
    } catch (error) {
      next(error);
    }
  };

  public resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { error, value } = authSchema.resetPassword.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { email } = value;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${env.FRONTEND_URL}/reset-password`,
      });

      if (resetError) {
        throw new AppError(resetError.message, HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION);
      }

      res.json({
        status: 'success',
        message: 'Password reset link sent successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public logout = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user?.uid) {
        throw new AppError(
          'User not authenticated',
          HttpStatusCode.UNAUTHORIZED,
          ErrorType.AUTHENTICATION
        );
      }

      // Supabase signOut is client side. Admin signOut requires JWT.
      // If we don't have the session JWT here (only decoded uid), we can't easily sign out from backend for Supabase.
      // But we can update the profile.

      await supabase
        .from('profiles')
        .update({
          last_logout_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.uid);

      res.json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public getCurrentUser = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user?.uid) {
        throw new AppError(
          'User not authenticated',
          HttpStatusCode.UNAUTHORIZED,
          ErrorType.AUTHENTICATION
        );
      }

      const { data: userData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.uid)
        .single();

      if (error || !userData) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }

      res.json({
        status: 'success',
        data: userData,
      });
    } catch (error) {
      next(error);
    }
  };
}
