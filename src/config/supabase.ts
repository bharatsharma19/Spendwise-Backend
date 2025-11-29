import { createClient } from '@supabase/supabase-js';
import { env } from './env.config';

// Initialize Supabase Admin Client (Bypasses RLS)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
