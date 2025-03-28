import { BaseService } from './base.service';
import { Notification } from '../models/notification.model';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';
import { db } from '../config/firebase';
import { Timestamp } from 'firebase-admin/firestore';

export class NotificationService extends BaseService {
  private static instance: NotificationService;

  private constructor() {
    super('notifications');
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async createNotification(
    data: Omit<Notification, 'id' | 'createdAt' | 'updatedAt' | 'read'>
  ): Promise<Notification> {
    try {
      const notification = await this.createDocument<Notification>({
        ...data,
        read: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return notification;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to create notification',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async getUserNotifications(userId: string): Promise<Notification[]> {
    try {
      return this.getCollection<Notification>([{ field: 'userId', operator: '==', value: userId }]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to get user notifications',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async getUnreadNotifications(userId: string): Promise<Notification[]> {
    try {
      return this.getCollection<Notification>([
        { field: 'userId', operator: '==', value: userId },
        { field: 'read', operator: '==', value: false },
      ]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to get unread notifications',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async markNotificationAsRead(
    userId: string,
    notificationId: string
  ): Promise<Notification> {
    try {
      const notification = await this.getDocument<Notification>(notificationId);
      if (notification.userId !== userId) {
        throw new AppError(
          'Unauthorized to update this notification',
          HttpStatusCode.FORBIDDEN,
          ErrorType.AUTHORIZATION
        );
      }
      return this.updateDocument<Notification>(notificationId, { read: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to mark notification as read',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async markAllNotificationsAsRead(userId: string): Promise<void> {
    try {
      const notifications = await this.getUnreadNotifications(userId);
      const batch = db.batch();

      notifications.forEach((notification) => {
        const docRef = db.collection(this.collection).doc(notification.id);
        batch.update(docRef, { read: true });
      });

      await batch.commit();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to mark all notifications as read',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async deleteNotification(userId: string, notificationId: string): Promise<void> {
    try {
      const notification = await this.getDocument<Notification>(notificationId);
      if (notification.userId !== userId) {
        throw new AppError(
          'Unauthorized to delete this notification',
          HttpStatusCode.FORBIDDEN,
          ErrorType.AUTHORIZATION
        );
      }
      await this.deleteDocument(notificationId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to delete notification',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async createGroupInviteNotification(
    userId: string,
    groupId: string,
    groupName: string,
    invitedBy: string
  ): Promise<Notification> {
    return this.createNotification({
      userId,
      type: 'group_invite',
      title: 'New Group Invitation',
      message: `You have been invited to join the group "${groupName}"`,
      data: {
        groupId,
        groupName,
        invitedBy,
      },
    });
  }

  public async createExpenseAddedNotification(
    userId: string,
    groupId: string,
    groupName: string,
    expenseId: string,
    amount: number,
    currency: string
  ): Promise<Notification> {
    return this.createNotification({
      userId,
      type: 'expense_added',
      title: 'New Expense Added',
      message: `A new expense of ${amount} ${currency} has been added to "${groupName}"`,
      data: {
        groupId,
        groupName,
        expenseId,
        amount,
        currency,
      },
    });
  }

  public async createExpensePaidNotification(
    userId: string,
    groupId: string,
    groupName: string,
    expenseId: string,
    amount: number,
    currency: string
  ): Promise<Notification> {
    return this.createNotification({
      userId,
      type: 'expense_paid',
      title: 'Expense Paid',
      message: `An expense of ${amount} ${currency} in "${groupName}" has been paid`,
      data: {
        groupId,
        groupName,
        expenseId,
        amount,
        currency,
      },
    });
  }

  public async createGroupSettledNotification(
    userId: string,
    groupId: string,
    groupName: string
  ): Promise<Notification> {
    return this.createNotification({
      userId,
      type: 'group_settled',
      title: 'Group Settled',
      message: `All expenses in "${groupName}" have been settled`,
      data: {
        groupId,
        groupName,
      },
    });
  }
}
