import { ExpenseCategory } from './expense.model';

export interface GroupMember {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  members: GroupMember[];
  expenses: GroupExpense[];
  settlements: GroupSettlement[];
  created_at: string;
  updated_at: string;
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
  date: string;
  location?: string;
  tags?: string[];
  receipt_url?: string;
  paid_by: string;
  splits: ExpenseSplit[];
  created_at: string;
  updated_at: string;
}

export interface ExpenseSplit {
  user_id: string;
  amount: number;
  status: 'paid' | 'pending' | 'cancelled';
  paid_at?: string;
}

export interface GroupSettlement {
  id: string;
  from_user: string;
  to_user: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
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

export interface GroupMemberResponse {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: Date;
}

export interface GroupExpenseResponse {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description?: string;
  date: Date;
  location?: string;
  tags?: string[];
  receiptUrl?: string;
  paidBy: string;
  splits: {
    userId: string;
    amount: number;
    status: 'paid' | 'pending' | 'cancelled';
    paidAt?: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupSettlementResponse {
  id: string;
  from: string;
  to: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupAnalyticsResponse {
  totalExpenses: number;
  totalSettlements: number;
  memberBalances: Record<string, number>;
  expenseByCategory: Record<string, number>;
}
