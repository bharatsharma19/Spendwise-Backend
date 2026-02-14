import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.config';
import { CronService } from '../services/cron.service';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

export class CronController {
  private static instance: CronController;
  private cronService: CronService;

  private constructor() {
    this.cronService = CronService.getInstance();
  }

  public static getInstance(): CronController {
    if (!CronController.instance) {
      CronController.instance = new CronController();
    }
    return CronController.instance;
  }

  processRecurring = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Simple security check
      const authHeader = req.headers.authorization;

      // Expecting "Bearer <CRON_SECRET>"
      if (
        !authHeader ||
        !authHeader.startsWith('Bearer ') ||
        authHeader.split(' ')[1] !== env.CRON_SECRET
      ) {
        throw new AppError(
          'Unauthorized cron access',
          HttpStatusCode.UNAUTHORIZED,
          ErrorType.AUTHENTICATION
        );
      }

      const result = await this.cronService.processRecurringExpenses();

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
