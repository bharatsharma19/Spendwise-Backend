import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const notificationController = NotificationController.getInstance();

// Apply authentication to all routes
router.use(authenticate);

// Get notifications
router.get('/', notificationController.getUserNotifications);

// Mark as read
router.patch('/:notificationId/read', notificationController.markNotificationAsRead);
router.patch('/read-all', notificationController.markAllNotificationsAsRead);

// Delete
router.delete('/:notificationId', notificationController.deleteNotification);

// Push Notifications
router.post('/register-token', notificationController.registerPushToken);
router.post('/broadcast', notificationController.sendBroadcast);

export default router;
