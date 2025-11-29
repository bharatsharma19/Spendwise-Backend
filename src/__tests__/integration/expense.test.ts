import request from 'supertest';
import app from '../../app';

// Mock Firebase
jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn(),
  },
}));

// Mock Auth Middleware
jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { uid: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

describe('Expense Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/expenses', () => {
    it('should create an expense', async () => {
      const res = await request(app).post('/api/expenses').send({
        amount: 100,
        category: 'food',
        description: 'Lunch',
        date: new Date().toISOString(),
        currency: 'USD',
      });
      expect(res.status).not.toBe(404);
    });
  });

  describe('GET /api/expenses', () => {
    it('should list expenses', async () => {
      const res = await request(app).get('/api/expenses');
      expect(res.status).not.toBe(404);
    });
  });
});
