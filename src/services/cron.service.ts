import { supabase } from '../config/supabase'; // logic runs as admin/system
import { CreateExpenseDto } from '../models/expense.model';
import { logger } from '../utils/logger';
import { ExpenseService } from './expense.service';

export class CronService {
  private static instance: CronService;
  private expenseService: ExpenseService;

  private constructor() {
    this.expenseService = ExpenseService.getInstance();
  }

  public static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  /**
   * Process all recurring expenses that are due.
   * 1. Find expenses with is_recurring = true AND recurring_details->nextDueDate <= NOW()
   * 2. For each:
   *    - Create a new expense entry for "today"
   *    - Update the original expense's nextDueDate
   */
  async processRecurringExpenses(): Promise<{ processed: number; errors: number }> {
    logger.info('Starting recurring expense processing...');
    let processed = 0;
    let errors = 0;

    try {
      // 1. Fetch due expenses
      // recurring_details is a JSONB column.
      // We need to query inside it.
      // Note: Supabase/PostgREST filtering on JSON keys can be tricky.
      // Filter: is_recurring = true AND recurring_details->>nextDueDate <= current ISO string

      const now = new Date();
      const todayIso = now.toISOString();

      const { data: dueExpenses, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('is_recurring', true)
        // Check next_due_date column
        .lte('next_due_date', todayIso);

      if (error) {
        logger.error('Failed to fetch due recurring expenses', error);
        throw error;
      }

      if (!dueExpenses || dueExpenses.length === 0) {
        logger.info('No recurring expenses due.');
        return { processed: 0, errors: 0 };
      }

      logger.info(`Found ${dueExpenses.length} recurring expenses due.`);

      // 2. Process each
      for (const expense of dueExpenses) {
        try {
          await this.processSingleRecurringExpense(expense);
          processed++;
        } catch (err) {
          logger.error(`Failed to process recurring expense ${expense.id}`, err);
          errors++;
        }
      }
    } catch (err) {
      logger.error('Critical error in recurring expense job', err);
      // specific error handling if needed
    }

    logger.info(`Recurring expense job finished. Processed: ${processed}, Errors: ${errors}`);
    return { processed, errors };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async processSingleRecurringExpense(originalExpense: any): Promise<void> {
    // Columns are next_due_date and recurring_frequency
    const nextDueDate = new Date(originalExpense.next_due_date);
    const frequency = originalExpense.recurring_frequency; // 'daily', 'weekly', 'monthly', 'yearly'

    // Create new expense (The "occurrence")
    const newExpenseData: CreateExpenseDto = {
      amount: originalExpense.amount,
      category: originalExpense.category,
      description: originalExpense.description,
      date: new Date(), // Paid "today"
      currency: originalExpense.currency,
      isRecurring: false, // Child is not recurring
      isSplit: originalExpense.is_split,
      tags: originalExpense.tags,
      location: originalExpense.location,
      recurringDetails: undefined,
      splitDetails: originalExpense.split_details, // Using existing split details if any
    };

    // Use admin client (via ExpenseService with no token or direct DB)
    // ExpenseService.createExpense usually expects a token for RLS.
    // If we pass undefined, it uses supabase which is the admin client only if configured so?
    // Wait, in BaseService getClient(token): if token provided -> user client. if NOT -> supabase (admin).
    // So passing undefined works.
    await this.expenseService.createExpense(originalExpense.user_id, newExpenseData, undefined);

    // Update the next due date on the original expense
    const newNextDueDate = this.calculateNextDueDate(nextDueDate, frequency);

    await supabase
      .from('expenses')
      .update({
        next_due_date: newNextDueDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', originalExpense.id);
  }

  private calculateNextDueDate(currentDue: Date, frequency: string): Date {
    const date = new Date(currentDue);
    switch (frequency) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        // Default to monthly if unknown
        date.setMonth(date.getMonth() + 1);
    }
    return date;
  }
}
