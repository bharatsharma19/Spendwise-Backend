import { Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AuthController } from '../controllers/auth.controller';
import { authSchema } from '../validations/auth.schema';
import { BaseRouter } from './base.routes';

export class AuthRouter extends BaseRouter {
  private authController: AuthController;

  constructor() {
    super();
    this.authController = AuthController.getInstance();

    // Rate limiting for sensitive routes
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Increased for testing
      message: 'Too many authentication attempts, please try again after 15 minutes',
    });

    const verificationLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 1000, // Increased for testing
      message: 'Too many verification attempts, please try again after an hour',
    });

    // Apply rate limiters to specific routes
    this.router.use('/register', authLimiter);
    this.router.use('/login', authLimiter);
    this.router.use('/verify-phone', verificationLimiter);
    this.router.use('/verify-phone-code', verificationLimiter);
    this.router.use('/reset-password', verificationLimiter);
    this.router.use('/resend-email-verification', verificationLimiter);
    this.router.use('/verify-email/:uid', verificationLimiter);

    // Authentication routes
    this.addPublicRoute('post', '/register', this.authController.register, authSchema.register);
    this.addPublicRoute('post', '/login', this.authController.login, authSchema.login);
    this.addProtectedRoute('post', '/logout', this.authController.logout);

    // Phone verification routes
    this.addPublicRoute(
      'post',
      '/verify-phone',
      this.authController.verifyPhone,
      authSchema.verifyPhone
    );
    this.addPublicRoute(
      'post',
      '/verify-phone-code',
      this.authController.verifyPhoneCode,
      authSchema.verifyPhoneCode
    );

    // Password and email verification routes
    this.addPublicRoute(
      'post',
      '/reset-password',
      this.authController.resetPassword,
      authSchema.resetPassword
    );
    this.addPublicRoute(
      'post',
      '/resend-email-verification',
      this.authController.resendEmailVerification,
      authSchema.resendEmailVerification
    );
    this.addPublicRoute('get', '/verify-email/:uid', this.authController.verifyEmail);

    // Protected routes
    this.addProtectedRoute('get', '/me', this.authController.getCurrentUser);

    // Health check route
    this.router.get('/health', (_, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    });
  }
}

export default new AuthRouter().getRouter();
