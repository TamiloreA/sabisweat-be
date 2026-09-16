-- Migration: Life Happens Pass support
-- Adds columns to profiles and creates life_happens_redemptions table

-- 1. Add Life Happens columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS life_happens_passes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_free_pass_month TEXT;

-- 2. Create redemptions table
CREATE TABLE IF NOT EXISTS public.life_happens_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  missed_date DATE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'free',  -- 'free' or 'purchased'
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_redemption UNIQUE(user_id, missed_date)
);

-- 3. RLS
ALTER TABLE public.life_happens_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own redemptions"
  ON public.life_happens_redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own redemptions"
  ON public.life_happens_redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on redemptions"
  ON public.life_happens_redemptions FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.life_happens_redemptions(user_id);
