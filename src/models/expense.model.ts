import { Timestamp } from 'firebase-admin/firestore';

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
  userId: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt?: Timestamp;
}

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  date: Timestamp;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  tags?: string[];
  receiptUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isRecurring: boolean;
  recurringDetails?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    nextDueDate: Timestamp;
    endDate?: Timestamp;
  };
  isSplit: boolean;
  splitDetails?: {
    splits: ExpenseSplit[];
    totalSplits: number;
    paidSplits: number;
    splitAmount: number;
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
