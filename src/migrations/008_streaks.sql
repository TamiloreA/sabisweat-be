-- ============================================================
-- SabiSweat: Streaks + Life Happens Pass
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Depends on: 001_create_profiles.sql, 002_create_daily_steps.sql
-- ============================================================

-- 1. Pass balance on profiles (1 free pass by default; +1 per month granted lazily)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS life_happens_passes INTEGER NOT NULL DEFAULT 1;

-- Tracks which month the free monthly pass was last granted ('YYYY-MM')
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_free_pass_month TEXT;

-- 2. Life Happens Pass redemptions
-- A row means: this user used a pass to save the streak on this missed date.
CREATE TABLE IF NOT EXISTS public.life_happens_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  missed_date DATE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'free' CHECK (source IN ('free', 'points')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, missed_date)
);

CREATE INDEX IF NOT EXISTS idx_life_happens_redemptions_user
  ON public.life_happens_redemptions(user_id, missed_date);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.life_happens_redemptions TO anon, authenticated, service_role;

-- 4. RLS (backend uses the secret key, which bypasses RLS)
ALTER TABLE public.life_happens_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own redemptions"
  ON public.life_happens_redemptions FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
