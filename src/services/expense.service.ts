import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import {
  CreateExpenseDto,
  ExpenseAnalytics,
  ExpenseCategory,
  ExpenseResponse,
  ExpenseTrends,
} from '../models/expense.model';
import {
  AppError,
  AuthorizationError,
  ErrorType,
  HttpStatusCode,
  NotFoundError,
} from '../utils/error';
import { BaseService, QueryOptions } from './base.service';

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

  /**
   * Creates a new expense
   * @param userId User ID
   * @param data Expense data
   * @returns Created expense
   */
  async createExpense(userId: string, data: CreateExpenseDto): Promise<ExpenseResponse> {
    try {
      const expenseData = {
        ...data,
        userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        currency: data.currency || 'INR',
        description: data.description || '',
        isRecurring: data.isRecurring || false,
        isSplit: data.isSplit || false,
        date: data.date instanceof Date ? data.date : new Date(data.date),
      };

      const docRef = await db.collection('expenses').add(expenseData);

      return {
        id: docRef.id,
        ...expenseData,
        createdAt: expenseData.createdAt.toDate(),
        updatedAt: expenseData.updatedAt.toDate(),
      } as unknown as ExpenseResponse;
    } catch (error) {
      throw new AppError(
        'Failed to create expense',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Gets expense by ID
   * @param userId User ID
   * @param id Expense ID
   * @returns Expense data
   */
  async getExpenseById(userId: string, id: string): Promise<ExpenseResponse> {
    try {
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
        createdAt: expenseData.createdAt?.toDate() || new Date(),
        updatedAt: expenseData.updatedAt?.toDate() || new Date(),
        date:
          expenseData.date instanceof Timestamp
            ? expenseData.date.toDate()
            : new Date(expenseData.date),
      } as unknown as ExpenseResponse;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      throw new AppError(
        'Failed to get expense',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Gets expenses by user ID with optional filtering and pagination
   * @param userId User ID
   * @param query Filter query
   * @param options Pagination and sorting options
   * @returns List of expenses
   */
  async getExpensesByUserId(
    userId: string,
    query: ExpenseQuery = {},
    options?: QueryOptions
  ): Promise<ExpenseResponse[]> {
    try {
      const filters: { field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }[] = [
        { field: 'userId', operator: '==', value: userId },
      ];

      if (query.startDate) {
        filters.push({ field: 'date', operator: '>=', value: query.startDate });
      }

      if (query.endDate) {
        filters.push({ field: 'date', operator: '<=', value: query.endDate });
      }

      if (query.category) {
        filters.push({ field: 'category', operator: '==', value: query.category });
      }

      if (query.isRecurring !== undefined) {
        filters.push({ field: 'isRecurring', operator: '==', value: query.isRecurring });
      }

      // Use default sort by date for expenses if not provided
      const queryOptions: QueryOptions = options || {
        orderBy: { field: 'date', direction: 'desc' },
      };

      const expenses = await this.getCollection<any>(filters, queryOptions);

      return expenses.map((data) => ({
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
      })) as ExpenseResponse[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to get expenses',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Updates an expense
   * @param userId User ID
   * @param id Expense ID
   * @param data Updated expense data
   * @returns Updated expense
   */
  async updateExpense(
    userId: string,
    id: string,
    data: Partial<ExpenseData>
  ): Promise<ExpenseResponse> {
    return db.runTransaction(async (transaction) => {
      const expenseRef = db.collection('expenses').doc(id);
      const expenseDoc = await transaction.get(expenseRef);

      if (!expenseDoc.exists) {
        throw new NotFoundError('Expense not found');
      }

      const currentData = expenseDoc.data();
      if (!currentData || currentData.userId !== userId) {
        throw new AuthorizationError('Unauthorized access');
      }

      // Validate split consistency if changing split details
      const isSplit = data.isSplit !== undefined ? data.isSplit : currentData.isSplit;
      const amount = data.amount !== undefined ? data.amount : currentData.amount;
      const splitAmount =
        data.splitAmount !== undefined ? data.splitAmount : currentData.splitAmount;

      if (isSplit && splitAmount > amount) {
        throw new AppError(
          'Split amount cannot be greater than total amount',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      const updateData = {
        ...data,
        updatedAt: Timestamp.now(),
      };

      transaction.update(expenseRef, updateData);

      // Return updated data (optimistic)
      const mergedData = { ...currentData, ...updateData } as ExpenseData & {
        createdAt: Timestamp;
        updatedAt: Timestamp;
      };

      return {
        id: expenseDoc.id,
        ...mergedData,
        createdAt: mergedData.createdAt?.toDate() || new Date(),
        updatedAt: mergedData.updatedAt?.toDate() || new Date(),
        date:
          mergedData.date instanceof Timestamp
            ? mergedData.date.toDate()
            : new Date(mergedData.date || Date.now()),
      } as unknown as ExpenseResponse;
    });
  }

  /**
   * Deletes an expense
   * @param userId User ID
   * @param id Expense ID
   */
  async deleteExpense(userId: string, id: string): Promise<void> {
    try {
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
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      throw new AppError(
        'Failed to delete expense',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Generates expense analytics
   * @param userId User ID
   * @param startDate Start date
   * @param endDate End date
   * @returns Expense analytics
   */
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
          const category = expense.category || 'other';
          acc[category] = (acc[category] || 0) + expense.amount;
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

  /**
   * Calculates monthly spending trends
   * @param expenses List of expenses
   * @returns Monthly trends data
   */
  private calculateMonthlyTrends(expenses: ExpenseResponse[]) {
    const monthlyData = expenses.reduce(
      (acc, expense) => {
        const date = expense.date instanceof Date ? expense.date : new Date(expense.date);
        const month = date.toISOString().slice(0, 7); // YYYY-MM
        if (!acc[month]) {
          acc[month] = {
            total: 0,
            categoryTotals: {} as Record<ExpenseCategory, number>,
          };
        }
        acc[month].total += expense.amount;
        const category = expense.category || 'other';
        acc[month].categoryTotals[category] =
          (acc[month].categoryTotals[category] || 0) + expense.amount;
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

  /**
   * Generates spending insights
   * @param expenses List of expenses
   * @param total Total spending
   * @param categoryTotals Category totals
   * @returns Array of insights
   */
  private generateInsights(
    expenses: ExpenseResponse[],
    total: number,
    categoryTotals: Record<ExpenseCategory, number>
  ) {
    const insights = [];

    if (expenses.length === 0) {
      return [{ type: 'no_data', message: 'No expense data available for insights' }];
    }

    const averageSpending = total / expenses.length;

    // Top spending category insight
    const topCategories = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);
    if (topCategories.length > 0) {
      const topCategory = topCategories[0];
      if (topCategory && topCategory.length === 2) {
        const [categoryName, categoryAmount] = topCategory;
        insights.push({
          type: 'category_insight',
          message: `Your top spending category is ${categoryName} at ${(
            (categoryAmount / total) *
            100
          ).toFixed(1)}%`,
        });
      }
    }

    // Average spending insight
    insights.push({
      type: 'spending_trend',
      message: `Your average spending is ${averageSpending.toFixed(2)} per transaction`,
    });

    // Month-over-month comparison if possible
    if (expenses.length > 0) {
      const months = new Set<string>();
      expenses.forEach((expense) => {
        const date = expense.date instanceof Date ? expense.date : new Date(expense.date);
        months.add(date.toISOString().slice(0, 7));
      });

      if (months.size >= 2) {
        insights.push({
          type: 'monthly_comparison',
          message:
            'Your spending data spans multiple months, check the monthly trends for detailed analysis',
        });
      }
    }

    return insights;
  }

  /**
   * Updates expense split status
   * @param userId User ID
   * @param expenseId Expense ID
   * @param isSplit Split status
   * @returns Updated expense
   */
  async updateExpenseSplitStatus(
    userId: string,
    expenseId: string,
    isSplit: boolean
  ): Promise<ExpenseResponse> {
    try {
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

      const updatedExpense = await expenseRef.get();
      const updatedData = updatedExpense.data();

      if (!updatedData) {
        throw new NotFoundError('Updated expense not found');
      }

      return {
        id: expense.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate() || new Date(),
        updatedAt: updatedData.updatedAt?.toDate() || new Date(),
        date:
          updatedData.date instanceof Timestamp
            ? updatedData.date.toDate()
            : new Date(updatedData.date),
      } as unknown as ExpenseResponse;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      throw new AppError(
        'Failed to update expense split status',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Gets expense summary
   * @param userId User ID
   * @param query Filter query
   * @returns Expense summary
   */
  async getExpenseSummary(
    userId: string,
    query: { startDate?: Date; endDate?: Date } = {}
  ): Promise<ExpenseSummary> {
    try {
      const expenses = await this.getExpensesByUserId(userId, query);
      const amounts = expenses.map((expense) => expense.amount);

      return {
        total: amounts.reduce((sum, amount) => sum + amount, 0),
        count: expenses.length,
        average:
          amounts.length > 0
            ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
            : 0,
        min: amounts.length > 0 ? Math.min(...amounts) : 0,
        max: amounts.length > 0 ? Math.max(...amounts) : 0,
      };
    } catch (error) {
      throw new AppError(
        'Failed to get expense summary',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Gets category statistics
   * @param userId User ID
   * @param query Filter query
   * @returns Category statistics
   */
  async getCategoryStats(
    userId: string,
    query: { startDate?: Date; endDate?: Date } = {}
  ): Promise<CategoryStats> {
    try {
      const expenses = await this.getExpensesByUserId(userId, query);
      const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      if (total === 0) {
        return {};
      }

      const categoryStats: CategoryStats = {};
      expenses.forEach((expense) => {
        const category = expense.category || 'other';
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
    } catch (error) {
      throw new AppError(
        'Failed to get category statistics',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  /**
   * Gets expense trends
   * @param userId User ID
   * @param interval Interval (daily, weekly, monthly)
   * @returns Expense trends
   */
  async getExpenseTrends(
    userId: string,
    interval: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<ExpenseTrends> {
    try {
      const expenses = await this.getExpensesByUserId(userId);
      const trends: ExpenseTrends = {
        total: 0,
        count: 0,
        byCategory: {},
        byDate: {},
      };

      for (const expense of expenses) {
        const amount = expense.amount;
        const category = expense.category || 'other';
        const date = expense.date instanceof Date ? expense.date : new Date(expense.date);

        // Skip invalid dates
        if (isNaN(date.getTime())) {
          continue;
        }

        // Update totals
        trends.total += amount;
        trends.count += 1;

        // Update category totals
        if (!trends.byCategory[category]) {
          trends.byCategory[category] = { total: 0, count: 0 };
        }

        // Non-null assertion is safe here because we just checked/initialized it
        const categoryData = trends.byCategory[category];
        if (categoryData) {
          categoryData.total += amount;
          categoryData.count += 1;
        }

        // Generate key based on interval
        let key = '';

        switch (interval) {
          case 'daily': {
            const dailyKey = date.toISOString().split('T')[0];
            if (dailyKey) key = dailyKey;
            break;
          }
          case 'weekly': {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weeklyKey = weekStart.toISOString().split('T')[0];
            if (weeklyKey) key = weeklyKey;
            break;
          }
          case 'monthly':
          default: {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            key = `${year}-${month}`;
            break;
          }
        }

        // Skip if key is empty
        if (!key) continue;

        // Update date totals
        if (!trends.byDate[key]) {
          trends.byDate[key] = { total: 0, count: 0 };
        }

        // Access safely with explicit check
        const dateData = trends.byDate[key];
        if (dateData) {
          dateData.total += amount;
          dateData.count += 1;
        }
      }

      return trends;
    } catch (error) {
      throw new AppError(
        'Failed to get expense trends',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }
}
