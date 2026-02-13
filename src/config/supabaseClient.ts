import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.config';

/**
 * Creates a user-scoped Supabase client that respects Row Level Security (RLS).
 * This client is initialized with the anon key and the user's JWT token,
 * so all queries are filtered by the RLS policies defined in the database.
 *
 * Use this client for ALL data operations (CRUD on expenses, groups, etc.).
 * Use the admin client (supabase.ts) ONLY for admin operations like
 * user creation, phone verification, and magic link generation.
 */
export function createUserClient(token: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
