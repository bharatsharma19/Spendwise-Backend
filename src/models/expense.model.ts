export type ExpenseCategory =
  | 'food'
  | 'transportation'
  | 'housing'
  | 'utilities'
  | 'entertainment'
  | 'healthcare'
  | 'shopping'
  | 'education'
  | 'other';

export interface ExpenseSplit {
  user_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at?: string;
}

export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  date: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  tags?: string[];
  receipt_url?: string;
  created_at: string;
  updated_at: string;
  is_recurring: boolean;
  recurring_frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  is_split: boolean;
  split_details?: {
    splits: ExpenseSplit[];
    total_splits: number;
    paid_splits: number;
    split_amount: number;
  };
}

export interface CreateExpenseDto {
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  date: Date;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  tags?: string[];
  receiptUrl?: string;
  isRecurring: boolean;
  recurringDetails?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    nextDueDate: Date;
    endDate?: Date;
  };
  isSplit?: boolean;
  splitDetails?: {
    splits: {
      userId: string;
      amount: number;
    }[];
  };
}

export interface UpdateExpenseDto {
  amount?: number;
  currency?: string;
  category?: ExpenseCategory;
  description?: string;
  date?: Date;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  tags?: string[];
  receiptUrl?: string;
  isRecurring?: boolean;
  recurringDetails?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    nextDueDate: Date;
    endDate?: Date;
  };
  isSplit?: boolean;
  splitDetails?: {
    splits: {
      userId: string;
      amount: number;
    }[];
  };
}

export interface ExpenseResponse {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  date: Date;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  tags?: string[];
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  isRecurring: boolean;
  recurringDetails?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    nextDueDate: Date;
    endDate?: Date;
  };
  isSplit: boolean;
  splitDetails?: {
    splits: {
      userId: string;
      amount: number;
      status: 'pending' | 'paid' | 'cancelled';
      paidAt?: Date;
    }[];
    totalSplits: number;
    paidSplits: number;
    splitAmount: number;
  };
}

export interface ExpenseAnalytics {
  total: number;
  categoryTotals: Record<ExpenseCategory, number>;
  dailySpending: Record<string, number>;
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

export interface ExpenseTrends {
  total: number;
  count: number;
  byCategory: Record<string, { total: number; count: number }>;
  byDate: Record<string, { total: number; count: number }>;
}

export interface ExpenseQuery {
  startDate?: Date;
  endDate?: Date;
  category?: ExpenseCategory;
  isRecurring?: boolean;
}
