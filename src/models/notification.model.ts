export type NotificationType = 'group_invite' | 'expense_added' | 'expense_paid' | 'group_settled';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, any>;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}
