-- ============================================================
-- SabiSweat: Add reward_id to challenges table
-- ============================================================

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS reward_id TEXT;
