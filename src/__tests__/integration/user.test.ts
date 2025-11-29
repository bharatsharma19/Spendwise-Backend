import request from 'supertest';
import app from '../../app';
import { supabase } from '../../config/supabase';
import { mockUser } from '../utils/mockAuth';

jest.mock('../../middleware/auth', () => {
  const { mockAuthenticate } = require('../utils/mockAuth');
  return {
    authenticate: mockAuthenticate,
  };
});

describe('User Routes', () => {
  describe('GET /api/users/profile', () => {
    it('should return the user profile', async () => {
      // Mock finding the user
      (supabase.from as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
      }));

      const res = await request(app).get('/api/users/profile');

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(mockUser.email);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user display name', async () => {
      const updatedUser = { ...mockUser, display_name: 'Updated Name' };

      (supabase.from as jest.Mock).mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedUser, error: null }),
      }));

      const res = await request(app)
        .put('/api/users/profile')
        .send({ displayName: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.display_name).toBe('Updated Name');
    });
  });
});
