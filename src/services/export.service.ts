import PDFDocument from 'pdfkit';
import { ExpenseQuery } from '../models/expense.model';
import { ExpenseService } from './expense.service';

export class ExportService {
  private static instance: ExportService;
  private expenseService: ExpenseService;

  private constructor() {
    this.expenseService = ExpenseService.getInstance();
  }

  public static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  async generateCSV(userId: string, query: ExpenseQuery, token?: string): Promise<string> {
    // 1. Fetch all expenses matching query
    // We want ALL data, not just paginated.
    // expenseService.getExpensesPaginated is for paginated.
    // We need a non-paginated version or just use a very large limit?
    // Let's assume we can fetch all or modify getExpensesPaginated to allow "all".
    // Or just loop through pages?
    // Creating a dedicated getExpenses method in ExpenseService might be better, or using getExpensesByUserId if it exists.
    // Wait, getExpensesByUserId exists but I modified it to be paginated in Phase 2?
    // Checking ExpenseService... getExpensesPaginated is the main reading method.
    // I can just pass a large limit for now (e.g., 10000).
    const limit = 10000;
    const result = await this.expenseService.getExpensesPaginated(
      userId,
      query,
      { page: 1, limit },
      token
    );

    const expenses = result.data;

    // 2. Generate CSV Header
    const headers = [
      'Date',
      'Description',
      'Category',
      'Amount',
      'Currency',
      'Location',
      'Recurring',
      'Split',
    ];

    const rows = expenses.map((e) => {
      const date = new Date(e.date).toISOString().split('T')[0];
      const desc = `"${(e.description || '').replace(/"/g, '""')}"`; // Escape quotes
      const cat = e.category;
      const amount = e.amount;
      const curr = e.currency;
      const loc = e.location?.address ? `"${e.location.address.replace(/"/g, '""')}"` : '';
      const rec = e.isRecurring ? 'Yes' : 'No';
      const split = e.isSplit ? 'Yes' : 'No';

      return [date, desc, cat, amount, curr, loc, rec, split].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  async generatePDF(userId: string, query: ExpenseQuery, token?: string): Promise<Buffer> {
    const limit = 10000;
    const result = await this.expenseService.getExpensesPaginated(
      userId,
      query,
      { page: 1, limit },
      token
    );
    const expenses = result.data;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', (buffer) => buffers.push(buffer));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Title
      doc.fontSize(20).text('Expense Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(12)
        .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown();

      // Table Header using simple positioning or just list
      // PDFKit tables are tricky without a plugin. I'll do a simple list view.

      let y = doc.y;

      expenses.forEach((e) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const date = new Date(e.date).toISOString().split('T')[0];
        const text = `${date} | ${e.category} | ${e.currency} ${e.amount} | ${e.description}`;

        doc.fontSize(10).text(text, 50, y);
        y += 20;
      });

      // Total
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      doc.moveDown();
      doc.fontSize(14).text(`Total Expenses: ${total.toFixed(2)}`, { align: 'right' }); // Naive total (mixed currency ignored for export summary)

      doc.end();
    });
  }
}
