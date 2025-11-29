import { NextFunction, Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env.config';
import { auth, db } from '../config/firebase';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/user.model';

import { EmailService } from '../services/email.service';
import { TwilioService } from '../services/twilio.service';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';
import { logger } from '../utils/logger';
import { authSchema } from '../validations/auth.schema';

const emailService = EmailService.getInstance();
const twilioService = TwilioService.getInstance();

export class AuthController {
  private static instance: AuthController;

  private constructor() {}

  public static getInstance(): AuthController {
    if (!AuthController.instance) {
      AuthController.instance = new AuthController();
    }
    return AuthController.instance;
  }

  private handleValidationError(error: any): never {
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      throw new ValidationError(error.details[0].message, []);
    }
    throw new ValidationError('Validation failed', []);
  }

  public register = async (req: Request, res: Response, next: NextFunction) => {
    let userRecord;
    try {
      const { error, value } = authSchema.register.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { email, password, phoneNumber, displayName } = value;

      // Format phone number to E.164 format
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Create user in Firebase Auth
      userRecord = await auth.createUser({
        email,
        password,
        phoneNumber: formattedPhoneNumber,
        displayName,
        emailVerified: false,
        disabled: false,
      });

      if (!userRecord.email || !userRecord.uid) {
        throw new AppError(
          'Failed to create user',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      // Create user profile in Firestore
      const userData: Omit<User, 'lastLoginAt'> = {
        uid: userRecord.uid,
        email: userRecord.email,
        phoneNumber: userRecord.phoneNumber || '',
        displayName: userRecord.displayName || '',
        photoURL: userRecord.photoURL || '',
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isEmailVerified: false,
        isPhoneVerified: false,
        status: 'active',
      };

      // ATOMIC OPERATION: Try to write to Firestore. If it fails, rollback Auth user.
      try {
        await db.collection('users').doc(userRecord.uid).set(userData);
      } catch (firestoreError) {
        logger.error('Firestore creation failed, rolling back Auth user:', firestoreError);
        await auth.deleteUser(userRecord.uid);
        throw new AppError(
          'Failed to create user profile. Please try again.',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      // Send email verification
      await this.sendEmailVerification(userRecord.uid);

      res.status(201).json({
        status: 'success',
        data: {
          uid: userRecord.uid,
          email: userRecord.email,
          phoneNumber: userRecord.phoneNumber,
          displayName: userRecord.displayName,
          message: 'Please check your email to verify your account',
        },
      });
    } catch (error: any) {
      logger.error('Registration error:', error);
      if (error.code === 'auth/email-already-exists') {
        next(new AppError('Email already exists', HttpStatusCode.CONFLICT, ErrorType.VALIDATION));
      } else if (error.code === 'auth/invalid-email') {
        next(
          new AppError('Invalid email format', HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION)
        );
      } else if (error.code === 'auth/operation-not-allowed') {
        next(
          new AppError(
            'Email/password accounts are not enabled. Please enable Email/Password authentication in Firebase Console.',
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION
          )
        );
      } else if (error.code === 'auth/weak-password') {
        next(
          new AppError('Password is too weak', HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION)
        );
      } else if (error.code === 'auth/configuration-not-found') {
        next(
          new AppError(
            'Firebase configuration error. Please check your Firebase project settings and enable Email/Password authentication.',
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.DATABASE
          )
        );
      } else {
        next(error);
      }
    }
  };

  public login = async (_req: Request, _res: Response, next: NextFunction) => {
    // DEPRECATED: Server-side login is insecure and not recommended.
    // The frontend should handle login via Firebase SDK and send the ID token.
    next(
      new AppError(
        'Server-side login is deprecated. Please use client-side Firebase SDK to login and provide the ID token in the Authorization header.',
        HttpStatusCode.GONE, // 410 Gone indicates the resource is no longer available
        ErrorType.VALIDATION
      )
    );
  };

  public sendEmailVerification = async (uid: string) => {
    try {
      const user = await auth.getUser(uid);
      if (!user.email) {
        throw new AppError(
          'User email not found',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      const actionCodeSettings = {
        url: `${env.FRONTEND_URL}/verify-email?uid=${uid}`,
        handleCodeInApp: true,
      };

      const verificationLink = await auth.generateEmailVerificationLink(
        user.email,
        actionCodeSettings
      );
      await emailService.sendVerificationEmail(user.email, verificationLink);
      await auth.updateUser(uid, { emailVerified: false });
    } catch (error) {
      logger.error('Error sending email verification:', error);
      throw error;
    }
  };

  public verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uid } = req.params;

      if (!uid) {
        throw new ValidationError('User ID is required', []);
      }

      // Update user's email verification status
      await auth.updateUser(uid, { emailVerified: true });
      await db.collection('users').doc(uid).update({
        isEmailVerified: true,
        updatedAt: Timestamp.now(),
      });

      res.json({
        status: 'success',
        message: 'Email verified successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public resendEmailVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = authSchema.resendEmailVerification.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { email } = value;
      const user = await auth.getUserByEmail(email);
      if (!user.uid) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
      await this.sendEmailVerification(user.uid);

      res.json({
        status: 'success',
        message: 'Email verification link sent successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public verifyPhone = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = authSchema.verifyPhone.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { phoneNumber } = value;
      // Format phone number to E.164 format if needed
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      const result = await twilioService.sendOTP(formattedPhoneNumber);

      res.json({
        status: 'success',
        message: 'OTP sent successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public verifyPhoneCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = authSchema.verifyPhoneCode.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { phoneNumber, code } = value;
      // Format phone number to E.164 format if needed
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      const result = await twilioService.verifyOTP(formattedPhoneNumber, code);

      if (result) {
        // Update user's phone verification status
        const userQuery = await db
          .collection('users')
          .where('phoneNumber', '==', formattedPhoneNumber)
          .limit(1)
          .get();

        if (!userQuery.empty) {
          const userDoc = userQuery.docs[0];
          if (userDoc) {
            await db.collection('users').doc(userDoc.id).update({
              isPhoneVerified: true,
              updatedAt: Timestamp.now(),
            });
          }
        }
      } else {
        throw new AppError(
          'Invalid or expired OTP',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      res.json({
        status: 'success',
        message: 'Phone number verified successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = authSchema.resetPassword.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const { email } = value;
      const user = await auth.getUserByEmail(email);
      if (!user.uid) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
      const actionCodeSettings = {
        url: `${env.FRONTEND_URL}/reset-password`,
        handleCodeInApp: true,
      };

      const resetLink = await auth.generatePasswordResetLink(email, actionCodeSettings);
      await emailService.sendPasswordResetEmail(email, resetLink);

      res.json({
        status: 'success',
        message: 'Password reset link sent successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.uid) {
        throw new AppError(
          'User not authenticated',
          HttpStatusCode.UNAUTHORIZED,
          ErrorType.AUTHENTICATION
        );
      }

      // Update user's last logout time
      await db.collection('users').doc(user.uid).update({
        lastLogoutAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      res.json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public getCurrentUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.uid) {
        throw new AppError(
          'User not authenticated',
          HttpStatusCode.UNAUTHORIZED,
          ErrorType.AUTHENTICATION
        );
      }

      const userDoc = await db.collection('users').doc(user.uid).get();
      const userData = userDoc.data() as User | undefined;

      if (!userData) {
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
