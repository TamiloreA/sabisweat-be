-- Migration 041: Historical Step-Goal Preservation & Longest Streak High-Water Mark
-- Ensures step-goal updates apply from their effective local calendar date onwards
-- without rewriting historical daily completion states, streaks, or retroactive achievements.

-- 1. Versioned step-goal history keyed by (user_id, effective_date)
--    Unique constraint guarantees non-overlapping, unambiguous goal periods per user.
CREATE TABLE IF NOT EXISTS public.user_step_goal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  step_goal INTEGER NOT NULL CHECK (step_goal >= 1000 AND step_goal <= 100000),
  effective_date DATE NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_step_goal_effective_date UNIQUE (user_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_user_step_goal_history_user_date
  ON public.user_step_goal_history (user_id, effective_date DESC);

ALTER TABLE public.user_step_goal_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own step goal history" ON public.user_step_goal_history;
  CREATE POLICY "Users can view their own step goal history"
    ON public.user_step_goal_history FOR SELECT
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can insert their own step goal history" ON public.user_step_goal_history;
  CREATE POLICY "Users can insert their own step goal history"
    ON public.user_step_goal_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update their own step goal history" ON public.user_step_goal_history;
  CREATE POLICY "Users can update their own step goal history"
    ON public.user_step_goal_history FOR UPDATE
    USING (auth.uid() = user_id);
END $$;

-- 2. Nullable per-day goal snapshot on daily_steps.
--    Intentionally NOT backfilled from profiles.step_goal to avoid fabricating
--    incorrect historical goals for users who may have previously changed their goal.
ALTER TABLE public.daily_steps
  ADD COLUMN IF NOT EXISTS step_goal INTEGER;

-- 3. Monotonic high-water mark for longest streak on profiles so legitimate
--    longest streaks never decrease when a user changes their step goal.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS longest_streak_days INTEGER NOT NULL DEFAULT 0;
