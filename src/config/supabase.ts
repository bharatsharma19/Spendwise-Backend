import { createClient } from '@supabase/supabase-js';
import { env } from './env.config';

// Initialize Supabase Admin Client (Bypasses RLS)
// WARNING: This client uses the Service Role Key which bypasses Row Level Security.
// Ensure all queries using this client explicitly filter by user_id or check permissions.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
