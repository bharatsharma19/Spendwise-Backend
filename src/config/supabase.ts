import { createClient } from '@supabase/supabase-js';
import { env } from './env.config';

/**
 * Supabase Admin Client — BYPASSES Row Level Security (RLS).
 *
 * ⚠️  WARNING: This client uses the Service Role Key.
 * Use ONLY for admin operations:
 *   - User creation (auth.signUp, auth.admin.*)
 *   - Phone verification (admin.getUserById, admin.generateLink)
 *   - Profile creation during registration
 *
 * For ALL data operations (expenses, groups, notifications),
 * use createUserClient() from './supabaseClient.ts' which respects RLS.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
