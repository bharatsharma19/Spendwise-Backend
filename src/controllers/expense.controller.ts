import { NextFunction, Response } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../middleware/auth';
import { CreateExpenseDto } from '../models/expense.model';
import { User } from '../models/user.model';
import { ExpenseService } from '../services/expense.service';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';
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

      const { startDate, endDate, category, isRecurring } = req.query;
      const expenses = await expenseService.getExpensesByUserId(
        req.user.uid,
        {
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          category: category as string | undefined,
          isRecurring: isRecurring ? isRecurring === 'true' : undefined,
        },
        undefined,
        req.token
      );

      res.json({
        status: 'success',
        data: expenses,
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
}
