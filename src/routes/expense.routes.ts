import { ExpenseController } from '../controllers/expense.controller';
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
  }
}

export default new ExpenseRouter().getRouter();
