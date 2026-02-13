import request from 'supertest';
import app from '../../app';
import { supabase } from '../../config/supabase';

jest.mock('../../middleware/auth', () => {
  const { mockAuthenticate } = require('../utils/mockAuth');
  return {
    authenticate: mockAuthenticate,
    AuthRequest: jest.fn(),
  };
});

describe('Analytics Routes', () => {
  describe('GET /api/analytics/groups/:groupId', () => {
    it('should get group analytics', async () => {
      // Mock validation access (member check)
      const mockGroup = { id: 'group-123', name: 'Test Group' };

      (supabase.from as jest.Mock).mockImplementation((table) => {
        if (table === 'group_members') {
          // Mock that user is a member
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { role: 'member' }, error: null }),
          };
        }
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
          };
        }
        if (table === 'group_expenses') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: [], error: null }), // No expenses for simplicity
          };
        }
        if (table === 'group_settlements') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      });

      const res = await request(app).get('/api/analytics/groups/group-123');
      expect(res.status).toBe(200);
    });
  });
});
