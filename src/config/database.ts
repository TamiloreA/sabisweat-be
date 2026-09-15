import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing Supabase environment variables');
}

// Global client (acts as anon or restricted depending on the key)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseSecretKey);

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
