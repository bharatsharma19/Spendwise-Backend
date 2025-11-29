import { supabase } from '../config/supabase';
import { Notification } from '../models/notification.model';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';
import { BaseService } from './base.service';

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
      const notificationData = {
        user_id: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data, // JSONB
        read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;

      return this.transformNotificationResponse(notification);
    } catch (error) {
      throw new AppError(
        'Failed to create notification',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async getUserNotifications(userId: string): Promise<Notification[]> {
    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (notifications || []).map((n) => this.transformNotificationResponse(n));
    } catch (error) {
      throw new AppError(
        'Failed to get user notifications',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async getUnreadNotifications(userId: string): Promise<Notification[]> {
    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('read', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (notifications || []).map((n) => this.transformNotificationResponse(n));
    } catch (error) {
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
      // Verify ownership
      const { data: notification, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', notificationId)
        .single();

      if (fetchError || !notification) {
        throw new AppError('Notification not found', HttpStatusCode.NOT_FOUND, ErrorType.DATABASE);
      }

      if (notification.user_id !== userId) {
        throw new AppError(
          'Unauthorized to update this notification',
          HttpStatusCode.FORBIDDEN,
          ErrorType.AUTHORIZATION
        );
      }

      const { data: updatedNotification, error: updateError } = await supabase
        .from('notifications')
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId)
        .select()
        .single();

      if (updateError) throw updateError;

      return this.transformNotificationResponse(updatedNotification);
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
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('read', false);

      if (error) throw error;
    } catch (error) {
      throw new AppError(
        'Failed to mark all notifications as read',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async deleteNotification(userId: string, notificationId: string): Promise<void> {
    try {
      // Verify ownership
      const { data: notification, error: fetchError } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('id', notificationId)
        .single();

      if (fetchError || !notification) {
        throw new AppError('Notification not found', HttpStatusCode.NOT_FOUND, ErrorType.DATABASE);
      }

      if (notification.user_id !== userId) {
        throw new AppError(
          'Unauthorized to delete this notification',
          HttpStatusCode.FORBIDDEN,
          ErrorType.AUTHORIZATION
        );
      }

      const { error: deleteError } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (deleteError) throw deleteError;
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

  private transformNotificationResponse(data: any): Notification {
    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      read: data.read,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}
