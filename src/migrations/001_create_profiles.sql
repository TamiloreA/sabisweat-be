-- ============================================================
-- SabiSweat: profiles table + auto-creation trigger
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  first_name      TEXT,
  last_name       TEXT,
  username        TEXT UNIQUE,
  date_of_birth   DATE,
  gender          TEXT CHECK (gender IN ('Man', 'Woman', 'Others')),
  movement_relationship TEXT CHECK (movement_relationship IN ('NONE', 'POOR', 'OCCASIONAL', 'CONSISTENT')),
  main_goal       TEXT,
  walking_frequency TEXT,
  step_goal       INTEGER DEFAULT 8000,
  avatar_id       TEXT,
  photo_url       TEXT,
  photo_base64    TEXT,
  city            TEXT,
  referral_code   TEXT,
  race            TEXT,
  specific_subgroup TEXT,
  country         TEXT,
  region          TEXT,
  bio             TEXT,
  has_password    BOOLEAN DEFAULT TRUE,
  onboarding_status TEXT DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed')),
  leaderboard_visible BOOLEAN DEFAULT TRUE,
  sharing_default BOOLEAN DEFAULT TRUE,
  sabi_level      TEXT DEFAULT 'Starter' CHECK (sabi_level IN ('Starter', 'Mover', 'Strider', 'Champion', 'Legend')),
  steps_count     INTEGER DEFAULT 0,
  points_balance  INTEGER DEFAULT 0,
  streak_count    INTEGER DEFAULT 0,
  finished_onboarded_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);

-- 3. Auto-generate referral codes
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, referral_code, has_password, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    generate_referral_code(),
    (NEW.raw_app_meta_data->>'provider' = 'email'),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can do everything (for backend)
CREATE POLICY "Service role full access"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');
