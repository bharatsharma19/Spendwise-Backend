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

describe('User Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users/profile', () => {
    it('should get user profile', async () => {
      const res = await request(app).get('/api/users/profile');
      expect(res.status).not.toBe(404);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user profile', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .send({ displayName: 'Updated Name' });
      expect(res.status).not.toBe(404);
    });
  });
});
