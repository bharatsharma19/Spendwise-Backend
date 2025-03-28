import { Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { ValidationError, AppError, HttpStatusCode, ErrorType } from '../utils/error';
import { AuthRequest } from '../middleware/auth';
import { userSchema } from '../validations/user.schema';
import { User } from '../models/user.model';

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

  private handleValidationError(error: any): never {
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

  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async updatePreferences(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async updateSettings(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async markNotificationAsRead(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async deleteNotification(req: AuthRequest, res: Response, next: NextFunction) {
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
  }

  async getUserStats(req: AuthRequest, res: Response, next: NextFunction) {
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
  }
}
