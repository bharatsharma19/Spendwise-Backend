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

describe('Analytics Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/groups/:groupId', () => {
    it('should get group analytics', async () => {
      const res = await request(app).get('/api/analytics/groups/group-123');
      expect(res.status).not.toBe(404);
    });
  });
});
