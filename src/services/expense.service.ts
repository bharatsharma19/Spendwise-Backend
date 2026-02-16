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
import { logger } from '../utils/logger';
import { BaseService, PaginatedResponse, QueryOptions } from './base.service';

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

  private calculateNextDueDate(date: Date, frequency: string): Date {
    const nextDate = new Date(date);
    if (frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    if (frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    if (frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    if (frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
    return nextDate;
  }

  async createExpense(
    userId: string,
    data: CreateExpenseDto,
    token?: string
  ): Promise<ExpenseResponse> {
    try {
      const client = this.getClient(token);
      const dateObj = data.date instanceof Date ? data.date : new Date(data.date);
      const expenseData = {
        user_id: userId,
        amount: data.amount,
        category: data.category,
        description: data.description || '',
        date: dateObj.toISOString(),
        currency: data.currency || 'INR',
        is_recurring: data.isRecurring || false,
        recurring_frequency: data.recurringDetails?.frequency,
        next_due_date:
          data.isRecurring && data.recurringDetails?.frequency
            ? this.calculateNextDueDate(dateObj, data.recurringDetails.frequency).toISOString()
            : null,
        is_split: data.isSplit || false,
        split_details: data.splitDetails, // JSONB
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: expense, error } = await client
        .from('expenses')
        .insert(expenseData)
        .select()
        .single();

      if (error) throw error;

      // Log audit
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const auditService = require('../services/audit.service').AuditService.getInstance();
      auditService.logAction(userId, 'CREATE', 'expense', expense.id, {
        amount: expense.amount,
        category: expense.category,
      });

      return this.transformExpenseResponse(expense);
    } catch (error) {
      throw new AppError(
        'Failed to create expense',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  private transformExpenseResponse(data: Record<string, unknown>): ExpenseResponse {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      amount: Number(data.amount),
      category: data.category as ExpenseCategory,
      description: data.description as string,
      date: new Date(data.date as string | number | Date),
      currency: data.currency as string,
      isRecurring: data.is_recurring as boolean,
      recurringDetails: data.is_recurring
        ? {
            frequency: data.recurring_frequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
            nextDueDate: data.next_due_date
              ? new Date(data.next_due_date as string | number | Date)
              : new Date(),
          }
        : undefined,
      isSplit: data.is_split as boolean,
      splitDetails: data.split_details as ExpenseResponse['splitDetails'],
      createdAt: new Date(data.created_at as string | number | Date),
      updatedAt: new Date(data.updated_at as string | number | Date),
    };
  }

  async getExpenseById(userId: string, id: string, token?: string): Promise<ExpenseResponse> {
    try {
      const client = this.getClient(token);
      const { data: expense, error } = await client
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !expense) {
        throw new NotFoundError('Expense not found');
      }

      // Defense-in-depth: verify ownership even with RLS
      if (expense.user_id !== userId) {
        throw new AuthorizationError('Unauthorized access');
      }

      return this.transformExpenseResponse(expense);
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

  async getExpensesByUserId(
    userId: string,
    query: ExpenseQuery = {},
    options?: QueryOptions,
    token?: string
  ): Promise<ExpenseResponse[]> {
    try {
      const client = this.getClient(token);
      let supabaseQuery = client.from('expenses').select('*').eq('user_id', userId);

      if (query.startDate) {
        supabaseQuery = supabaseQuery.gte('date', query.startDate.toISOString());
      }

      if (query.endDate) {
        supabaseQuery = supabaseQuery.lte('date', query.endDate.toISOString());
      }

      if (query.category) {
        supabaseQuery = supabaseQuery.eq('category', query.category);
      }

      if (query.isRecurring !== undefined) {
        supabaseQuery = supabaseQuery.eq('is_recurring', query.isRecurring);
      }

      // Sorting
      if (options?.orderBy) {
        supabaseQuery = supabaseQuery.order(options.orderBy.field, {
          ascending: options.orderBy.direction === 'asc',
        });
      } else {
        supabaseQuery = supabaseQuery.order('date', { ascending: false });
      }

      // Pagination
      if (options?.limit) {
        supabaseQuery = supabaseQuery.limit(options.limit);
      }

      const { data: expenses, error } = await supabaseQuery;

      if (error) throw error;

      return (expenses || []).map((expense) => this.transformExpenseResponse(expense));
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
   * Paginated expense listing.
   * Returns data + totalCount + page metadata.
   */
  async getExpensesPaginated(
    userId: string,
    query: ExpenseQuery = {},
    options: QueryOptions = {},
    token?: string
  ): Promise<PaginatedResponse<ExpenseResponse>> {
    try {
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(100, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      const client = this.getClient(token);
      let supabaseQuery = client
        .from('expenses')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (query.startDate) {
        supabaseQuery = supabaseQuery.gte('date', query.startDate.toISOString());
      }
      if (query.endDate) {
        supabaseQuery = supabaseQuery.lte('date', query.endDate.toISOString());
      }
      if (query.category) {
        supabaseQuery = supabaseQuery.eq('category', query.category);
      }
      if (query.isRecurring !== undefined) {
        supabaseQuery = supabaseQuery.eq('is_recurring', query.isRecurring);
      }

      // Full-text Search
      if (options.search) {
        // Use 'websearch' type for Google-like search syntax (e.g. "food -dinner")
        supabaseQuery = supabaseQuery.textSearch('fts', options.search, {
          type: 'websearch',
          config: 'english',
        });
      }

      // Sorting
      if (options.orderBy) {
        supabaseQuery = supabaseQuery.order(options.orderBy.field, {
          ascending: options.orderBy.direction === 'asc',
        });
      } else {
        supabaseQuery = supabaseQuery.order('date', { ascending: false });
      }

      // Apply range for pagination
      supabaseQuery = supabaseQuery.range(offset, offset + limit - 1);

      const { data: expenses, error, count } = await supabaseQuery;

      if (error) throw error;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: (expenses || []).map((expense) => this.transformExpenseResponse(expense)),
        totalCount,
        page,
        totalPages,
        hasNextPage: page < totalPages,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to get expenses',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async updateExpense(
    userId: string,
    id: string,
    data: Partial<CreateExpenseDto>,
    token?: string
  ): Promise<ExpenseResponse> {
    try {
      const client = this.getClient(token);

      // Fetch existing to verify ownership
      const { data: currentExpense, error: fetchError } = await client
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !currentExpense) {
        throw new NotFoundError('Expense not found');
      }

      if (currentExpense.user_id !== userId) {
        throw new AuthorizationError('Unauthorized access');
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.date !== undefined)
        updateData.date = (
          data.date instanceof Date ? data.date : new Date(data.date)
        ).toISOString();
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.isRecurring !== undefined) updateData.is_recurring = data.isRecurring;
      if (data.recurringDetails?.frequency !== undefined)
        updateData.recurring_frequency = data.recurringDetails.frequency;
      if (data.isSplit !== undefined) updateData.is_split = data.isSplit;
      if (data.splitDetails !== undefined) updateData.split_details = data.splitDetails;

      const { data: updatedExpense, error: updateError } = await client
        .from('expenses')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log audit
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const auditService = require('../services/audit.service').AuditService.getInstance();
      auditService.logAction(userId, 'UPDATE', 'expense', id, {
        before: currentExpense,
        after: updatedExpense,
      });

      return this.transformExpenseResponse(updatedExpense);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      throw new AppError(
        'Failed to update expense',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async deleteExpense(userId: string, id: string, token?: string): Promise<void> {
    try {
      const client = this.getClient(token);

      // Defense-in-depth: check ownership even with RLS
      const { data: expense, error: fetchError } = await client
        .from('expenses')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError || !expense) {
        throw new NotFoundError('Expense not found');
      }

      if (expense.user_id !== userId) {
        throw new AuthorizationError('Unauthorized access');
      }

      const { error: deleteError } = await client.from('expenses').delete().eq('id', id);

      if (deleteError) throw deleteError;

      // Log audit
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const auditService = require('../services/audit.service').AuditService.getInstance();
      auditService.logAction(userId, 'DELETE', 'expense', id, { snapshot: expense });
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

  async getExpenseAnalytics(
    userId: string,
    startDate: Date,
    endDate: Date,
    token?: string
  ): Promise<ExpenseAnalytics> {
    try {
      const expenses = await this.getExpensesByUserId(
        userId,
        {
          startDate,
          endDate,
        },
        undefined,
        token
      );

      const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      const categoryTotals = expenses.reduce(
        (acc, expense) => {
          const category = expense.category || 'other';
          acc[category] = (acc[category] || 0) + expense.amount;
          return acc;
        },
        {} as Record<ExpenseCategory, number>
      );

      const dailySpending = expenses.reduce(
        (acc, expense) => {
          const dateKey = expense.date.toISOString().split('T')[0];
          if (!dateKey) return acc;
          acc[dateKey] = (acc[dateKey] || 0) + expense.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      const monthlyTrends = this.calculateMonthlyTrends(expenses);
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

  private calculateMonthlyTrends(
    expenses: ExpenseResponse[]
  ): { month: string; total: number; categoryTotals: Record<ExpenseCategory, number> }[] {
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

  private generateInsights(
    expenses: ExpenseResponse[],
    total: number,
    categoryTotals: Record<ExpenseCategory, number>
  ): { type: string; message: string }[] {
    const insights: { type: string; message: string }[] = [];

    if (expenses.length === 0) {
      return [{ type: 'no_data', message: 'No expense data available for insights' }];
    }

    const averageSpending = total / expenses.length;

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

    insights.push({
      type: 'spending_trend',
      message: `Your average spending is ${averageSpending.toFixed(2)} per transaction`,
    });

    if (expenses.length > 0) {
      const months = new Set<string>();
      expenses.forEach((expense) => {
        months.add(expense.date.toISOString().slice(0, 7));
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

  async updateExpenseSplitStatus(
    userId: string,
    expenseId: string,
    isSplit: boolean,
    token?: string
  ): Promise<ExpenseResponse> {
    return this.updateExpense(userId, expenseId, { isSplit }, token);
  }

  async getExpenseSummary(
    userId: string,
    query: { startDate?: Date; endDate?: Date } = {},
    token?: string
  ): Promise<ExpenseSummary> {
    try {
      const client = this.getClient(token);
      const { data, error } = await client.rpc('get_expense_summary', {
        p_user_id: userId,
        p_start_date: query.startDate?.toISOString() || null,
        p_end_date: query.endDate?.toISOString() || null,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      return {
        total: Number(row?.total ?? 0),
        count: Number(row?.count ?? 0),
        average: Number(row?.average ?? 0),
        min: Number(row?.min_amount ?? 0),
        max: Number(row?.max_amount ?? 0),
      };
    } catch (error) {
      throw new AppError(
        'Failed to get expense summary',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async getCategoryStats(
    userId: string,
    query: { startDate?: Date; endDate?: Date } = {},
    token?: string
  ): Promise<CategoryStats> {
    try {
      const client = this.getClient(token);
      const { data, error } = await client.rpc('get_category_stats', {
        p_user_id: userId,
        p_start_date: query.startDate?.toISOString() || null,
        p_end_date: query.endDate?.toISOString() || null,
      });

      if (error) throw error;

      const categoryStats: CategoryStats = {};
      if (Array.isArray(data)) {
        for (const row of data) {
          categoryStats[row.category] = {
            total: Number(row.total),
            count: Number(row.count),
            average: Number(row.average),
            percentage: Number(row.percentage),
          };
        }
      }

      return categoryStats;
    } catch (error) {
      throw new AppError(
        'Failed to get category statistics',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async getExpenseTrends(
    userId: string,
    interval: 'daily' | 'weekly' | 'monthly' = 'monthly',
    token?: string
  ): Promise<ExpenseTrends> {
    try {
      const client = this.getClient(token);

      // Get date-bucketed trends from SQL
      const { data: trendData, error: trendError } = await client.rpc('get_expense_trends', {
        p_user_id: userId,
        p_interval: interval,
      });

      if (trendError) throw trendError;

      // Get category breakdown from SQL (reuse category stats RPC)
      const { data: catData, error: catError } = await client.rpc('get_category_stats', {
        p_user_id: userId,
        p_start_date: null,
        p_end_date: null,
      });

      if (catError) throw catError;

      const byDate: Record<string, { total: number; count: number }> = {};
      let total = 0;
      let count = 0;

      if (Array.isArray(trendData)) {
        for (const row of trendData) {
          byDate[row.period] = {
            total: Number(row.total),
            count: Number(row.count),
          };
          total += Number(row.total);
          count += Number(row.count);
        }
      }

      const byCategory: Record<string, { total: number; count: number }> = {};
      if (Array.isArray(catData)) {
        for (const row of catData) {
          byCategory[row.category] = {
            total: Number(row.total),
            count: Number(row.count),
          };
        }
      }

      return { total, count, byCategory, byDate };
    } catch (error) {
      throw new AppError(
        'Failed to get expense trends',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  // Upload receipt
  public async uploadReceipt(
    expenseId: string,
    file: { buffer: Buffer; mimetype: string },
    userToken?: string
  ): Promise<string> {
    const client = this.getClient(userToken);
    const userId = (await client.auth.getUser()).data.user?.id;

    if (!userId) {
      throw new AppError(
        'User not authenticated',
        HttpStatusCode.UNAUTHORIZED,
        ErrorType.AUTHENTICATION
      );
    }

    // Generate unique filename: userId/expenseId-timestamp.ext
    const ext = file.mimetype.split('/')[1] || 'jpg';
    const filename = `${userId}/${expenseId}-${Date.now()}.${ext}`;

    const { error } = await client.storage.from('receipts').upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

    if (error) {
      logger.error('Failed to upload receipt', error);
      throw new AppError(
        'Failed to upload receipt',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE // Fallback as ExternalService might not exist
      );
    }

    // Get public URL
    const { data: publicUrlData } = client.storage.from('receipts').getPublicUrl(filename);
    const publicUrl = publicUrlData.publicUrl;

    // Update expense record with receipt URL
    // Note: updateExpense expects (userId, id, updates, token)
    await this.updateExpense(
      userId, // Corrected to include userId as per updateExpenseSplitStatus usage
      expenseId,
      { receiptUrl: publicUrl },
      userToken
    );

    return publicUrl;
  }
}
