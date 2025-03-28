import { UserController } from '../controllers/user.controller';
import { userSchema } from '../validations/user.schema';
import { BaseRouter } from './base.routes';

export class UserRouter extends BaseRouter {
  private userController: UserController;

  constructor() {
    super();
    this.userController = UserController.getInstance();

    // Get user profile
    this.addProtectedRoute('get', '/profile', this.userController.getProfile);

    // Update user profile
    this.addProtectedRoute(
      'put',
      '/profile',
      this.userController.updateProfile,
      userSchema.updateProfile
    );

    // Update user preferences
    this.addProtectedRoute(
      'put',
      '/preferences',
      this.userController.updatePreferences,
      userSchema.updatePreferences
    );

    // Update user settings
    this.addProtectedRoute(
      'put',
      '/settings',
      this.userController.updateSettings,
      userSchema.updateSettings
    );

    // Get user notifications
    this.addProtectedRoute('get', '/notifications', this.userController.getNotifications);

    // Mark notification as read
    this.addProtectedRoute(
      'put',
      '/notifications/:id/read',
      this.userController.markNotificationAsRead
    );

    // Delete notification
    this.addProtectedRoute('delete', '/notifications/:id', this.userController.deleteNotification);

    // Get user statistics
    this.addProtectedRoute('get', '/stats', this.userController.getUserStats);
  }
}

export default new UserRouter().getRouter();
