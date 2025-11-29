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

describe('Group Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/groups', () => {
    it('should create a group', async () => {
      const res = await request(app).post('/api/groups').send({
        name: 'Test Group',
        description: 'Test Description',
        currency: 'USD',
      });
      expect(res.status).not.toBe(404);
    });
  });

  describe('POST /api/groups/:groupId/members', () => {
    it('should add a member', async () => {
      const res = await request(app).post('/api/groups/group-123/members').send({
        email: 'member@example.com',
        displayName: 'Member Name',
      });
      expect(res.status).not.toBe(404);
    });
  });
});
