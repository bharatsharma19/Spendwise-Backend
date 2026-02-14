import { supabase } from '../config/supabase';
import { User } from '../models/user.model';
import { logger } from '../utils/logger';
import { EmailService } from './email.service';
import { ExpenseService } from './expense.service';

export class BudgetService {
  private static instance: BudgetService;
  private expenseService: ExpenseService;
  private emailService: EmailService;

  private constructor() {
    this.expenseService = ExpenseService.getInstance();
    this.emailService = EmailService.getInstance();
  }

  public static getInstance(): BudgetService {
    if (!BudgetService.instance) {
      BudgetService.instance = new BudgetService();
    }
    return BudgetService.instance;
  }

  /**
   * Check if user has exceeded budget thresholds and send alerts.
   * This should be called after an expense is created or updated.
   * It is "fire and forget" - errors are logged but don't stop execution.
   */
  async checkBudget(userId: string): Promise<void> {
    try {
      // 1. Get User Profile for budget settings
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !profile) {
        logger.warn(`Could not fetch profile for budget check: ${userId}`, error);
        return;
      }

      const user = profile as User;
      const budget = user.preferences?.monthlyBudget;
      const alertsEnabled = user.preferences?.budgetAlerts;

      if (!budget || !alertsEnabled) {
        return;
      }

      // 2. Calculate total spending for this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // We use the admin client (no token) to get true total
      const summary = await this.expenseService.getExpenseSummary(
        userId,
        {
          startDate: startOfMonth,
          endDate: endOfMonth,
        },
        undefined
      );

      const totalSpent = summary.total;
      const percentage = (totalSpent / budget) * 100;

      // 3. Check Thresholds
      // We want to alert at 80, 90, 100.
      // We need to know what was the LAST alert sent for this month.

      const lastAlert = user.preferences.lastBudgetAlert;
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // If last alert was from a previous month, reset it (conceptually, we just ignore it)
      let lastLevel = 0;
      if (lastAlert && lastAlert.month === currentMonthStr) {
        lastLevel = lastAlert.percentage;
      }

      let newLevel = 0;
      if (percentage >= 100) newLevel = 100;
      else if (percentage >= 90) newLevel = 90;
      else if (percentage >= 80) newLevel = 80;

      // Only send if we crossed a NEW threshold higher than the last one
      if (newLevel > lastLevel) {
        await this.sendBudgetAlert(user, totalSpent, budget, newLevel);

        // Update user preference
        const updatedPreferences = {
          ...user.preferences,
          lastBudgetAlert: {
            month: currentMonthStr,
            percentage: newLevel,
            sentAt: new Date(),
          },
        };

        await supabase
          .from('profiles')
          .update({ preferences: updatedPreferences })
          .eq('id', userId);

        logger.info(`Sent budget alert to ${user.email} for ${newLevel}% usage.`);
      }
    } catch (error) {
      logger.error(`Error checking budget for user ${userId}`, error);
    }
  }

  private async sendBudgetAlert(
    user: User,
    spent: number,
    budget: number,
    level: number
  ): Promise<void> {
    const subject = `Budget Alert: You've reached ${level}% of your monthly budget`;

    // Formatting currency (naive, assuming USD or user pref if we had it easily accessible,
    // actually user.preferences.currency might exist but let's just use numbers for now or generic symbol)
    const currency = user.preferences.currency || 'USD';
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });

    let message = `Hello ${user.displayName || 'User'},\n\n`;
    message += `You have spent ${formatter.format(spent)} out of your ${formatter.format(budget)} monthly budget.\n`;
    message += `This is ${(spent / budget) * 100}% of your limit.\n\n`;

    if (level === 100) {
      message += `⚠️ You have exceeded or reached your budget limit!`;
    } else {
      message += `Please review your expenses to stay on track.`;
    }

    await this.emailService.sendEmail(user.email, subject, message);
  }
}
