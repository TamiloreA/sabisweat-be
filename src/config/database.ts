import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing Supabase environment variables');
}

// Global data client (service role). Configured to never hold a user
// session so RLS is always bypassed for data queries.
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// Dedicated client for auth operations (signInWithPassword, refreshSession,
// verifyOtp). These set a session on the client instance — if they ran on the
// shared data client, every later data query would inherit that user's token
// and become RLS-scoped (the "anonymous authors" bug). Keep them isolated.
export const authClient: SupabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// User-scoped client for operations that need to satisfy RLS using the user's token
export const getUserSupabase = (token: string): SupabaseClient => {
  return createClient(supabaseUrl, supabaseSecretKey, {
    global: {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    },
  });
};

export default supabase;
