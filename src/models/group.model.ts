import { Timestamp } from 'firebase-admin/firestore';
import { ExpenseCategory } from './expense.model';

export interface GroupMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: Timestamp;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  members: GroupMember[];
  expenses: GroupExpense[];
  settlements: GroupSettlement[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  currency: string;
  settings: GroupSettings;
}

export interface CreateGroupDto {
  name: string;
  description?: string;
  currency: string;
  settings?: {
    allowMemberInvites?: boolean;
    requireApproval?: boolean;
    defaultSplitType?: 'equal' | 'percentage' | 'custom';
  };
}

export interface UpdateGroupDto {
  name?: string;
  description?: string;
  status?: 'active' | 'settled' | 'archived';
  settings?: {
    allowMemberInvites?: boolean;
    requireApproval?: boolean;
    defaultSplitType?: 'equal' | 'percentage' | 'custom';
  };
}

export interface GroupResponse {
  id: string;
  name: string;
  description?: string;
  code: string;
  createdBy: string;
  members: {
    userId: string;
    displayName: string;
    email: string;
    joinedAt: Date;
    role: 'admin' | 'member';
  }[];
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'settled' | 'archived';
  totalExpenses: number;
  totalMembers: number;
  currency: string;
  settings: {
    allowMemberInvites: boolean;
    requireApproval: boolean;
    defaultSplitType: 'equal' | 'percentage' | 'custom';
  };
}

export interface GroupExpense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description?: string;
  date: Timestamp;
  location?: string;
  tags?: string[];
  receiptUrl?: string;
  paidBy: string;
  splits: ExpenseSplit[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpenseSplit {
  userId: string;
  amount: number;
  status: 'paid' | 'pending' | 'cancelled';
  paidAt?: Timestamp;
}

export interface GroupSettlement {
  id: string;
  from: string;
  to: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupSettings {
  allowMemberInvites: boolean;
  requireApproval: boolean;
  defaultSplitType: 'equal' | 'percentage' | 'custom';
}

export interface SettlementSummary {
  userId: string;
  displayName: string;
  totalPaid: number;
  totalOwed: number;
  netAmount: number;
  transactions: {
    toUserId: string;
    toUserName: string;
    amount: number;
  }[];
}

export interface GroupAnalytics {
  totalExpenses: number;
  categoryTotals: Record<ExpenseCategory, number>;
  memberTotals: {
    userId: string;
    displayName: string;
    totalPaid: number;
    totalOwed: number;
  }[];
  monthlyTrends: {
    month: string;
    total: number;
    categoryTotals: Record<ExpenseCategory, number>;
  }[];
  insights: {
    type: string;
    message: string;
  }[];
}
