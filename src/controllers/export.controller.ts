import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ExpenseQuery } from '../models/expense.model';
import { ExportService } from '../services/export.service';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

const exportService = ExportService.getInstance();

export class ExportController {
  private static instance: ExportController;

  private constructor() {}

  public static getInstance(): ExportController {
    if (!ExportController.instance) {
      ExportController.instance = new ExportController();
    }
    return ExportController.instance;
  }

  getExport = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.uid) {
        throw new AppError(
          'User not authenticated',
          HttpStatusCode.UNAUTHORIZED,
          ErrorType.AUTHENTICATION
        );
      }

      const { format, startDate, endDate, category } = req.query;
      const query: ExpenseQuery = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      if (category) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query.category = category as any;
      }

      if (format === 'pdf') {
        const pdfBuffer = await exportService.generatePDF(req.user.uid, query, req.token);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="expenses.pdf"');
        res.send(pdfBuffer);
      } else {
        // Default to CSV
        const csvString = await exportService.generateCSV(req.user.uid, query, req.token);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
        res.send(csvString);
      }
    } catch (error) {
      next(error);
    }
  };
}
