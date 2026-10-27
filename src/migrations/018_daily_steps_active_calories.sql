-- ============================================================
-- SabiSweat: Add active_calories to daily_steps table
-- ============================================================

ALTER TABLE public.daily_steps
  ADD COLUMN IF NOT EXISTS active_calories NUMERIC(10, 2) DEFAULT 0;

-- Refresh schema cache if needed
NOTIFY pgrst, 'reload schema';
