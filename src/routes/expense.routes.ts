import { ExpenseController } from '../controllers/expense.controller';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { expenseSchema } from '../validations/expense.schema';
import { BaseRouter } from './base.routes';

export class ExpenseRouter extends BaseRouter {
  private expenseController: ExpenseController;

  constructor() {
    super();
    this.expenseController = ExpenseController.getInstance();

    // Create expense
    this.addProtectedRoute(
      'post',
      '/',
      this.expenseController.createExpense,
      expenseSchema.createExpense
    );

    // Get expenses
    this.addProtectedRoute('get', '/', this.expenseController.getExpenses);
    this.addProtectedRoute('get', '/:id', this.expenseController.getExpense);

    // Update expense
    this.addProtectedRoute(
      'put',
      '/:id',
      this.expenseController.updateExpense,
      expenseSchema.updateExpense
    );
    this.addProtectedRoute(
      'patch',
      '/:id/split-status',
      this.expenseController.updateExpenseSplitStatus,
      expenseSchema.updateExpenseSplitStatus
    );

    // Delete expense
    this.addProtectedRoute('delete', '/:id', this.expenseController.deleteExpense);

    // Get expense statistics
    this.addProtectedRoute('get', '/stats/summary', this.expenseController.getExpenseSummary);
    this.addProtectedRoute('get', '/stats/categories', this.expenseController.getCategoryStats);
    this.addProtectedRoute('get', '/stats/trends', this.expenseController.getExpenseTrends);

    // Upload receipt
    // Note: We access the router directly here because BaseRouter methods wrap handlers in async catch
    // but we need to inject the multer middleware before the handler.
    // However, BaseRouter doesn't easily support arbitrary middleware in the middle of the chain via addProtectedRoute unless we extend it.
    // For simplicity, let's use the router directly but apply the common middleware manually or use a new helper.
    // Actually, BaseRouter methods take ...middlewares. But the current implementation of addProtectedRoute
    // takes schema as the last arg, not flexible middlewares.
    // Let's modify BaseRouter to accept extra middlewares, OR just bypass it for this specific route.

    // Bypassing BaseRouter helper for this specific route to add 'upload' middleware
    this.router.post(
      '/:id/receipt',
      this.limiter,
      authenticate,
      upload.single('receipt'),
      this.asRequestHandler(this.expenseController.uploadReceipt)
    );
  }
}

export default new ExpenseRouter().getRouter();
