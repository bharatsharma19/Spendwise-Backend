import {
  CreateExpenseDto,
  ExpenseResponse,
  ExpenseAnalytics,
  ExpenseCategory,
  ExpenseTrends,
} from '../models/expense.model';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';
import { Timestamp } from 'firebase-admin/firestore';
import { BaseService } from './base.service';
import { db } from '../config/firebase';
import { NotFoundError, AuthorizationError } from '../utils/error';

interface ExpenseData {
  amount: number;
  category: string;
  description?: string;
  date: Date;
  currency?: string;
  isRecurring?: boolean;
  recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  isSplit?: boolean;
  splitWith?: string[];
  splitAmount?: number;
}

interface ExpenseQuery {
  startDate?: Date;
  endDate?: Date;
  category?: string;
  isRecurring?: boolean;
}

interface ExpenseSummary {
  total: number;
  count: number;
  average: number;
  min: number;
  max: number;
}

interface CategoryStats {
  [category: string]: {
    total: number;
    count: number;
    average: number;
    percentage: number;
  };
}

export class ExpenseService extends BaseService {
  private static instance: ExpenseService;

  private constructor() {
    super('expenses');
  }

  public static getInstance(): ExpenseService {
    if (!ExpenseService.instance) {
      ExpenseService.instance = new ExpenseService();
    }
    return ExpenseService.instance;
  }

  async createExpense(userId: string, data: CreateExpenseDto): Promise<ExpenseResponse> {
    const expenseData = {
      ...data,
      userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      currency: data.currency || 'USD', // Default to USD if not specified
      description: data.description || '', // Default to empty string if not specified
      isRecurring: data.isRecurring || false, // Default to false if not specified
      isSplit: data.isSplit || false, // Default to false if not specified
      date: data.date instanceof Date ? data.date : new Date(data.date), // Ensure date is always a Date object
    };

    const docRef = await db.collection('expenses').add(expenseData);

    return {
      id: docRef.id,
      ...expenseData,
      createdAt: expenseData.createdAt.toDate(),
      updatedAt: expenseData.updatedAt.toDate(),
    } as unknown as ExpenseResponse;
  }

  async getExpenseById(userId: string, id: string): Promise<ExpenseResponse> {
    const expenseRef = db.collection('expenses').doc(id);
    const expense = await expenseRef.get();

    if (!expense.exists) {
      throw new NotFoundError('Expense not found');
    }

    const expenseData = expense.data();
    if (!expenseData || expenseData.userId !== userId) {
      throw new AuthorizationError('Unauthorized access');
    }

    return {
      id: expense.id,
      ...expenseData,
      createdAt: expenseData.createdAt.toDate(),
      updatedAt: expenseData.updatedAt.toDate(),
      date: expenseData.date instanceof Date ? expenseData.date : new Date(expenseData.date),
    } as unknown as ExpenseResponse;
  }

  async getExpensesByUserId(userId: string, query: ExpenseQuery = {}): Promise<ExpenseResponse[]> {
    let expensesRef = db.collection('expenses').where('userId', '==', userId);

    if (query.startDate) {
      expensesRef = expensesRef.where('date', '>=', query.startDate);
    }

    if (query.endDate) {
      expensesRef = expensesRef.where('date', '<=', query.endDate);
    }

    if (query.category) {
      expensesRef = expensesRef.where('category', '==', query.category);
    }

    if (query.isRecurring !== undefined) {
      expensesRef = expensesRef.where('isRecurring', '==', query.isRecurring);
    }

    const snapshot = await expensesRef.orderBy('date', 'desc').get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
        date: data.date instanceof Date ? data.date : new Date(data.date),
      } as unknown as ExpenseResponse;
    });
  }

  async updateExpense(
    userId: string,
    id: string,
    data: Partial<ExpenseData>
  ): Promise<ExpenseResponse> {
    const expenseRef = db.collection('expenses').doc(id);
    const expense = await expenseRef.get();

    if (!expense.exists) {
      throw new NotFoundError('Expense not found');
    }

    const expenseData = expense.data();
    if (!expenseData || expenseData.userId !== userId) {
      throw new AuthorizationError('Unauthorized access');
    }

    const updateData = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    await expenseRef.update(updateData);

    return {
      id: expense.id,
      ...expenseData,
      ...updateData,
      createdAt: expenseData.createdAt.toDate(),
      updatedAt: updateData.updatedAt.toDate(),
      date: updateData.date
        ? updateData.date instanceof Date
          ? updateData.date
          : new Date(updateData.date)
        : expenseData.date,
    } as unknown as ExpenseResponse;
  }

  async deleteExpense(userId: string, id: string): Promise<void> {
    const expenseRef = db.collection('expenses').doc(id);
    const expense = await expenseRef.get();

    if (!expense.exists) {
      throw new NotFoundError('Expense not found');
    }

    const expenseData = expense.data();
    if (!expenseData || expenseData.userId !== userId) {
      throw new AuthorizationError('Unauthorized access');
    }

    await expenseRef.delete();
  }

  async getExpenseAnalytics(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExpenseAnalytics> {
    try {
      const expenses = await this.getExpensesByUserId(userId, {
        startDate,
        endDate,
      });

      // Calculate total spending
      const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Calculate category totals
      const categoryTotals = expenses.reduce(
        (acc, expense) => {
          acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
          return acc;
        },
        {} as Record<ExpenseCategory, number>
      );

      // Calculate daily spending
      const dailySpending = expenses.reduce(
        (acc, expense) => {
          const date = expense.date instanceof Date ? expense.date : new Date(expense.date);
          const dateKey = date.toISOString().split('T')[0];
          if (!dateKey) return acc;
          acc[dateKey] = (acc[dateKey] || 0) + expense.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      // Calculate monthly trends
      const monthlyTrends = this.calculateMonthlyTrends(expenses);

      // Generate insights
      const insights = this.generateInsights(expenses, total, categoryTotals);

      return {
        total,
        categoryTotals,
        dailySpending,
        monthlyTrends,
        insights,
      };
    } catch (error) {
      throw new AppError(
        'Failed to generate expense analytics',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  private calculateMonthlyTrends(expenses: ExpenseResponse[]) {
    const monthlyData = expenses.reduce(
      (acc, expense) => {
        const month = expense.date.toISOString().slice(0, 7); // YYYY-MM
        if (!acc[month]) {
          acc[month] = {
            total: 0,
            categoryTotals: {} as Record<ExpenseCategory, number>,
          };
        }
        acc[month].total += expense.amount;
        acc[month].categoryTotals[expense.category] =
          (acc[month].categoryTotals[expense.category] || 0) + expense.amount;
        return acc;
      },
      {} as Record<string, { total: number; categoryTotals: Record<ExpenseCategory, number> }>
    );

    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      total: data.total,
      categoryTotals: data.categoryTotals,
    }));
  }

  private generateInsights(
    expenses: ExpenseResponse[],
    total: number,
    categoryTotals: Record<ExpenseCategory, number>
  ) {
    const insights = [];
    const averageSpending = total / expenses.length;

    // Top spending category insight
    const topCategory = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0];
    if (topCategory) {
      insights.push({
        type: 'category_insight',
        message: `Your top spending category is ${topCategory[0]} at ${(
          (topCategory[1] / total) *
          100
        ).toFixed(1)}%`,
      });
    }

    // Average spending insight
    insights.push({
      type: 'spending_trend',
      message: `Your average spending is ${averageSpending.toFixed(2)} per transaction`,
    });

    return insights;
  }

  async updateExpenseSplitStatus(
    userId: string,
    expenseId: string,
    isSplit: boolean
  ): Promise<ExpenseResponse> {
    const expenseRef = db.collection('expenses').doc(expenseId);
    const expense = await expenseRef.get();

    if (!expense.exists) {
      throw new NotFoundError('Expense not found');
    }

    const expenseData = expense.data();
    if (!expenseData || expenseData.userId !== userId) {
      throw new AuthorizationError('Unauthorized access');
    }

    const updateData = {
      isSplit,
      updatedAt: Timestamp.now(),
    };

    await expenseRef.update(updateData);

    return {
      id: expense.id,
      ...expenseData,
      ...updateData,
      createdAt: expenseData.createdAt.toDate(),
      updatedAt: updateData.updatedAt.toDate(),
      date: expenseData.date instanceof Date ? expenseData.date : new Date(expenseData.date),
    } as unknown as ExpenseResponse;
  }

  async getExpenseSummary(
    userId: string,
    query: { startDate?: Date; endDate?: Date } = {}
  ): Promise<ExpenseSummary> {
    const expenses = await this.getExpensesByUserId(userId, query);
    const amounts = expenses.map((expense) => expense.amount);

    return {
      total: amounts.reduce((sum, amount) => sum + amount, 0),
      count: expenses.length,
      average:
        amounts.length > 0 ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length : 0,
      min: amounts.length > 0 ? Math.min(...amounts) : 0,
      max: amounts.length > 0 ? Math.max(...amounts) : 0,
    };
  }

  async getCategoryStats(
    userId: string,
    query: { startDate?: Date; endDate?: Date } = {}
  ): Promise<CategoryStats> {
    const expenses = await this.getExpensesByUserId(userId, query);
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    const categoryStats: CategoryStats = {};
    expenses.forEach((expense) => {
      const category = expense.category;
      if (!categoryStats[category]) {
        categoryStats[category] = {
          total: 0,
          count: 0,
          average: 0,
          percentage: 0,
        };
      }

      categoryStats[category].total += expense.amount;
      categoryStats[category].count += 1;
      categoryStats[category].average =
        categoryStats[category].total / categoryStats[category].count;
      categoryStats[category].percentage = (categoryStats[category].total / total) * 100;
    });

    return categoryStats;
  }

  async getExpenseTrends(
    userId: string,
    interval: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<ExpenseTrends> {
    const expenses = await this.getExpensesByUserId(userId);
    const trends: ExpenseTrends = {
      total: 0,
      count: 0,
      byCategory: {},
      byDate: {},
    };

    expenses.forEach((expense) => {
      const amount = expense.amount;
      const category = expense.category || 'Uncategorized';
      const date = expense.date instanceof Date ? expense.date : new Date(expense.date);

      // Update totals
      trends.total += amount;
      trends.count += 1;

      // Update category totals
      if (!trends.byCategory[category]) {
        trends.byCategory[category] = { total: 0, count: 0 };
      }
      trends.byCategory[category].total += amount;
      trends.byCategory[category].count += 1;

      // Generate key based on interval
      let key: string;
      switch (interval) {
        case 'daily':
          key = date.toISOString().split('T')[0] || '';
          break;
        case 'weekly':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0] || '';
          break;
        case 'monthly':
        default:
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      // Update date totals
      if (!trends.byDate[key]) {
        trends.byDate[key] = { total: 0, count: 0 };
      }
      const dateEntry = trends.byDate[key];
      if (dateEntry) {
        dateEntry.total += amount;
        dateEntry.count += 1;
      }
    });

    return trends;
  }
}
