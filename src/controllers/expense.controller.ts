import { Response, NextFunction } from 'express';
import { ExpenseService } from '../services/expense.service';
import { ValidationError, AppError, HttpStatusCode, ErrorType } from '../utils/error';
import { AuthRequest } from '../middleware/auth';
import { expenseSchema } from '../validations/expense.schema';
import { User } from '../models/user.model';

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

  private handleValidationError(error: any): never {
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

  async createExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);
      const uid = req.user!.uid;

      const { error, value } = expenseSchema.createExpense.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const expense = await expenseService.createExpense(uid, value);

      res.status(201).json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      const expense = await expenseService.getExpenseById(req.user!.uid, id);

      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);

      const { startDate, endDate, category, isRecurring } = req.query;
      const expenses = await expenseService.getExpensesByUserId(req.user.uid, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        category: category as string | undefined,
        isRecurring: isRecurring ? isRecurring === 'true' : undefined,
      });

      res.json({
        status: 'success',
        data: expenses,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);
      const uid = req.user!.uid;

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      const { error, value } = expenseSchema.updateExpense.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const expense = await expenseService.updateExpense(uid, id, value);

      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateExpenseSplitStatus(req: AuthRequest, res: Response, next: NextFunction) {
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
        value.isSplit
      );

      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteExpense(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);

      const { id } = req.params;
      if (!id) {
        this.handleValidationError({ details: [{ message: 'Expense ID is required' }] });
      }

      await expenseService.deleteExpense(req.user!.uid, id);

      res.json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpenseSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);

      const { startDate, endDate } = req.query;
      const summary = await expenseService.getExpenseSummary(req.user.uid, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        status: 'success',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategoryStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);

      const { startDate, endDate } = req.query;
      const stats = await expenseService.getCategoryStats(req.user.uid, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpenseTrends(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      this.validateUser(req);

      const { interval } = req.query;
      const trends = await expenseService.getExpenseTrends(
        req.user.uid,
        interval as 'daily' | 'weekly' | 'monthly' | undefined
      );

      res.json({
        status: 'success',
        data: trends,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpenseAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
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
        new Date(endDate as string)
      );

      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }
}
