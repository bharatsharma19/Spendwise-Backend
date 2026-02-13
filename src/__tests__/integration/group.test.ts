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

describe('Group Routes', () => {
  describe('POST /api/groups', () => {
    it('should create a group successfully', async () => {
      // Mock Group Insert
      const mockGroup = {
        id: 'group-1',
        name: 'Trip',
        created_by: 'test-user-id',
        created_at: new Date().toISOString(),
      };

      (supabase.from as jest.Mock).mockImplementation((table) => {
        if (table === 'groups') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
          };
        }
        if (table === 'group_members') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'member-1', role: 'admin', user_id: 'test-user-id' },
              error: null,
            }),
          };
        }
        return { select: jest.fn() };
      });

      const res = await request(app).post('/api/groups').send({
        name: 'Trip',
        description: 'Summer Vacation',
        currency: 'USD',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Trip');
    });
  });
});
