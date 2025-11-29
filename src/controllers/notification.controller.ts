import { NextFunction, Response } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/user.model';
import { NotificationService } from '../services/notification.service';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';

const notificationService = NotificationService.getInstance();

type AuthenticatedRequest = Omit<AuthRequest, 'user'> & {
  user: Required<Pick<User, 'uid'>> & Omit<User, 'uid'>;
};

export class NotificationController {
  private static instance: NotificationController;

  private constructor() {}

  public static getInstance(): NotificationController {
    if (!NotificationController.instance) {
      NotificationController.instance = new NotificationController();
    }
    return NotificationController.instance;
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

  async getUserNotifications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const notifications = await notificationService.getUserNotifications(userId);

      res.json({
        status: 'success',
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  }

  async markNotificationAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { notificationId } = req.params;
      if (!notificationId) {
        this.handleValidationError({ details: [{ message: 'Notification ID is required' }] });
      }

      const notification = await notificationService.markNotificationAsRead(userId, notificationId);

      res.json({
        status: 'success',
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAllNotificationsAsRead(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      await notificationService.markAllNotificationsAsRead(userId);

      res.json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteNotification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { notificationId } = req.params;
      if (!notificationId) {
        this.handleValidationError({ details: [{ message: 'Notification ID is required' }] });
      }

      await notificationService.deleteNotification(userId, notificationId);

      res.json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  }
}
