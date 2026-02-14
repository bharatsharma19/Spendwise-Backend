import { NextFunction, Response } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/user.model';
import { UserService } from '../services/user.service';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';
import { userSchema } from '../validations/user.schema';

const userService = UserService.getInstance();

type AuthenticatedRequest = Omit<AuthRequest, 'user'> & {
  user: Required<Pick<User, 'uid'>> & Omit<User, 'uid'>;
};

export class UserController {
  private static instance: UserController;

  private constructor() {}

  public static getInstance(): UserController {
    if (!UserController.instance) {
      UserController.instance = new UserController();
    }
    return UserController.instance;
  }

  private handleValidationError(
    error: Joi.ValidationError | { details?: Array<{ message: string }> }
  ): never {
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      throw new ValidationError(error.details[0].message, []);
    }
    throw new ValidationError('Validation failed', []);
  }

  private validateUser(req: AuthRequest): asserts req is AuthenticatedRequest {
    if (!req.user?.uid) {
      throw new AppError(
        'User not authenticated',
        HttpStatusCode.UNAUTHORIZED,
        ErrorType.AUTHENTICATION
      );
    }
  }

  getProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const profile = await userService.getProfile(userId);

      res.json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { error, value } = userSchema.updateProfile.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const profile = await userService.updateProfile(userId, value);

      res.json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  };

  updatePreferences = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { error, value } = userSchema.updatePreferences.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const updatedPreferences = await userService.updatePreferences(userId, value);

      res.json({
        status: 'success',
        data: updatedPreferences,
      });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { error, value } = userSchema.updateSettings.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const updatedSettings = await userService.updateSettings(userId, value);

      res.json({
        status: 'success',
        data: updatedSettings,
      });
    } catch (error) {
      next(error);
    }
  };

  getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const notifications = await userService.getNotifications(userId);

      res.json({
        status: 'success',
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  };

  markNotificationAsRead = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Notification ID is required' }] });
      }

      const notification = await userService.markNotificationAsRead(userId, id);

      res.json({
        status: 'success',
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteNotification = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Notification ID is required' }] });
      }

      await userService.deleteNotification(userId, id);

      res.json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  };

  getUserStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const stats = await userService.getUserStats(userId);

      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      await userService.deleteUser(userId);

      res.json({
        status: 'success',
        message: 'Account deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}
