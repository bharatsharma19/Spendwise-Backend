import request from 'supertest';
import app from '../../app';
import { supabase } from '../../config/supabase';

// Mock the authentication middleware for these protected routes
jest.mock('../../middleware/auth', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { mockAuthenticate } = require('../utils/mockAuth');
  return {
    authenticate: mockAuthenticate,
    AuthRequest: jest.fn(),
  };
});

describe('Expense Routes', () => {
  describe('POST /api/expenses', () => {
    it('should create an expense successfully', async () => {
      const mockExpenseData = {
        amount: 50.0,
        category: 'food',
        description: 'Lunch',
        date: new Date().toISOString(),
        currency: 'USD',
        isRecurring: false,
      };

      // Mock Supabase insert response
      (supabase.from as jest.Mock).mockImplementation((table) => {
        if (table === 'expenses') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'expense-123', user_id: 'test-user-id', ...mockExpenseData },
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const res = await request(app).post('/api/expenses').send(mockExpenseData);

      expect(res.status).toBe(201);
      expect(res.body.data.amount).toBe(50);
      expect(res.body.data.id).toBeDefined();
    });

    it('should fail if required fields are missing', async () => {
      const res = await request(app).post('/api/expenses').send({
        description: 'Missing amount',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/expenses', () => {
    it('should return a list of expenses', async () => {
      // Mock Supabase select response
      (supabase.from as jest.Mock).mockImplementation(() => {
        const mockData = [
          {
            id: '1',
            amount: 20,
            category: 'food',
            user_id: 'test-user-id',
            date: new Date().toISOString(),
          },
          {
            id: '2',
            amount: 30,
            category: 'transport',
            user_id: 'test-user-id',
            date: new Date().toISOString(),
          },
        ];

        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          then: (
            resolve: (value: { data: unknown[]; error: null }) => void
          ): Promise<{ data: unknown[]; error: null }> => {
            resolve({ data: mockData, error: null });
            return Promise.resolve({ data: mockData, error: null });
          },
        };
      });

      const res = await request(app).get('/api/expenses');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });
});
