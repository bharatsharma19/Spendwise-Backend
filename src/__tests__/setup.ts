import { jest } from '@jest/globals';

// 1. Mock UUID to ensure consistent IDs in snapshots/assertions if needed
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234-5678'),
}));

// 2. Mock Supabase Client
// This prevents real network calls during tests
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  auth: {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(), // If used
    getUser: jest.fn(),
    admin: {
      deleteUser: jest.fn(),
      getUserById: jest.fn(),
    },
  },
  rpc: jest.fn(),
};

jest.mock('../config/supabase', () => ({
  supabase: mockSupabase,
}));

// Global before/after hooks
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
});

afterEach(() => {
  jest.clearAllMocks();
});
