import { Group, GroupMember, GroupExpense, GroupSettlement } from './group.model';

export interface GroupResponse extends Omit<Group, 'createdAt' | 'updatedAt'> {
  code: string;
  status: 'active' | 'settled' | 'archived';
  totalExpenses: number;
  totalMembers: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMemberResponse extends Omit<GroupMember, 'joinedAt'> {
  joinedAt: Date;
}

export interface GroupExpenseResponse
  extends Omit<GroupExpense, 'date' | 'createdAt' | 'updatedAt'> {
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupSettlementResponse extends Omit<GroupSettlement, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupAnalyticsResponse {
  totalExpenses: number;
  totalSettlements: number;
  memberBalances: Record<string, number>;
  expenseByCategory: Record<string, number>;
}
