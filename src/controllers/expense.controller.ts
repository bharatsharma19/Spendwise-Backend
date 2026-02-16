import { NextFunction, Response } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../middleware/auth';
import { CreateExpenseDto } from '../models/expense.model';
import { User } from '../models/user.model';
import { BudgetService } from '../services/budget.service';
import { ExpenseService } from '../services/expense.service';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';
import { logger } from '../utils/logger';
import { expenseSchema } from '../validations/expense.schema';

const expenseService = ExpenseService.getInstance();

type AuthenticatedRequest = Omit<AuthRequest, 'user'> & {
  user: Required<Pick<User, 'uid'>> & Omit<User, 'uid'>;
};

function isAuthenticated(req: AuthRequest): req is AuthenticatedRequest {
  return (
    req.user !== undefined &&
    typeof req.user === 'object' &&
    'uid' in req.user &&
    typeof req.user.uid === 'string'
  );
}

export class ExpenseController {
  private static instance: ExpenseController;

  private constructor() {}

  public static getInstance(): ExpenseController {
    if (!ExpenseController.instance) {
      ExpenseController.instance = new ExpenseController();
    }
    return ExpenseController.instance;
  }

  private handleValidationError(
    error: Joi.ValidationError | { details?: Array<{ message: string }> }
  ): never {
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      throw new ValidationError(error.details[0].message, []);
    }
    throw new ValidationError('Validation failed', []);
  }

  private validateUser(req: AuthRequest): asserts req is AuthenticatedRequest {
    if (!isAuthenticated(req)) {
      throw new AppError(
        'User not authenticated',
        HttpStatusCode.UNAUTHORIZED,
        ErrorType.AUTHENTICATION
      );
    }
  }

  createExpense = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const uid = req.user!.uid;
      const token = req.token;

      const { error, value } = expenseSchema.createExpense.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const expenseData: CreateExpenseDto = {
        amount: value.amount,
        category: value.category,
        description: value.description,
        date: value.date,
        currency: value.currency,
        isRecurring: value.isRecurring,
        isSplit: value.isSplit,
        tags: value.tags,
        receiptUrl: value.receiptUrl,
        location: value.location,
        ...(value.isRecurring && value.recurringFrequency
          ? {
              recurringDetails: {
                frequency: value.recurringFrequency,
                nextDueDate: value.date,
              },
            }
          : {}),
        ...(value.isSplit && value.splitWith
          ? {
              splitDetails: {
                splits: value.splitWith.map((userId: string) => ({
                  userId,
                  amount: value.splitAmount || 0,
                })),
              },
            }
          : {}),
      };

      const expense = await expenseService.createExpense(uid, expenseData, token);

      // Check budget (async, fire and forget)
      const budgetService = BudgetService.getInstance();
      budgetService.checkBudget(uid).catch((err: unknown) => {
        logger.error('Failed to run budget check', err);
      });

      res.status(201).json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  };

  getExpense = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      const expense = await expenseService.getExpenseById(req.user!.uid, id, req.token);

      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  };

  getExpenses = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { startDate, endDate, category, isRecurring, page, limit, search } = req.query;
      const result = await expenseService.getExpensesPaginated(
        req.user.uid,
        {
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          category: category as string | undefined,
          isRecurring: isRecurring ? isRecurring === 'true' : undefined,
        },
        {
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
          search: search as string | undefined,
        },
        req.token
      );

      res.json({
        status: 'success',
        data: result.data,
        pagination: {
          totalCount: result.totalCount,
          page: result.page,
          totalPages: result.totalPages,
          hasNextPage: result.hasNextPage,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateExpense = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);
      const uid = req.user!.uid;
      const token = req.token;

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      const { error, value } = expenseSchema.updateExpense.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const expenseData: Record<string, unknown> = {
        ...value,
      };

      // Map flat fields to nested objects if present
      if (value.recurringFrequency) {
        expenseData.recurringDetails = {
          frequency: value.recurringFrequency,
          nextDueDate: value.date || new Date(),
        };
        delete expenseData.recurringFrequency;
      }

      if (value.splitWith) {
        expenseData.splitDetails = {
          splits: value.splitWith.map((userId: string) => ({
            userId,
            amount: value.splitAmount || 0,
          })),
        };
        delete expenseData.splitWith;
        delete expenseData.splitAmount;
      }

      const expense = await expenseService.updateExpense(uid, id, expenseData, token);

      // Check budget (async, fire and forget)
      const budgetService = BudgetService.getInstance();
      budgetService.checkBudget(uid).catch((err: unknown) => {
        logger.error('Failed to run budget check', err);
      });

      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  };

  updateExpenseSplitStatus = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      const { error, value } = expenseSchema.updateExpenseSplitStatus.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const expense = await expenseService.updateExpenseSplitStatus(
        req.user!.uid,
        id,
        value.isSplit,
        req.token
      );

      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteExpense = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      await expenseService.deleteExpense(req.user!.uid, id, req.token);

      res.json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  };

  getExpenseSummary = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);

      const { startDate, endDate } = req.query;
      const summary = await expenseService.getExpenseSummary(
        req.user.uid,
        {
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
        },
        req.token
      );

      // Convert total to user's preferred currency if available
      // logic removed as it incorrectly assumes base currency is USD
      // TODO: Implement proper multi-currency aggregation
      /*
      if (req.user.preferences?.currency && req.user.preferences.currency !== 'USD') {
        const currencyService = CurrencyService.getInstance();
        try {
          const targetCurrency = (req.query.currency as string) || req.user.preferences.currency;
          if (targetCurrency && targetCurrency !== 'USD') {
            const convertedTotal = await currencyService.convert(
              summary.total,
              'USD',
              targetCurrency
            );
            summary.total = convertedTotal;
            (summary as unknown as { currency: string }).currency = targetCurrency;
          }
        } catch (err) {
          logger.warn('Currency conversion failed', err);
        }
      }
      */

      res.json({
        status: 'success',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  };

  getCategoryStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { startDate, endDate } = req.query;
      const stats = await expenseService.getCategoryStats(
        req.user.uid,
        {
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
        },
        req.token
      );

      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  getExpenseTrends = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { interval } = req.query;
      const trends = await expenseService.getExpenseTrends(
        req.user.uid,
        interval as 'daily' | 'weekly' | 'monthly' | undefined,
        req.token
      );

      res.json({
        status: 'success',
        data: trends,
      });
    } catch (error) {
      next(error);
    }
  };

  getExpenseAnalytics = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const uid = req.user!.uid;

      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        this.handleValidationError({
          details: [{ message: 'Start date and end date are required' }],
        });
      }

      const analytics = await expenseService.getExpenseAnalytics(
        uid,
        new Date(startDate as string),
        new Date(endDate as string),
        req.token
      );

      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };

  uploadReceipt = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      if (!req.file) {
        this.handleValidationError({ details: [{ message: 'No file uploaded' }] });
      }

      const publicUrl = await expenseService.uploadReceipt(
        id,
        {
          buffer: req.file!.buffer,
          mimetype: req.file!.mimetype,
        },
        req.token
      );

      res.json({
        status: 'success',
        data: { receiptUrl: publicUrl },
      });
    } catch (error) {
      next(error);
    }
  };
}
