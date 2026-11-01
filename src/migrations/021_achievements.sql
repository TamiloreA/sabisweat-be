-- ============================================================
-- SabiSweat Migration 021: User Achievements & Referral Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'step_milestone', 'daily_streak', 'monthly_badge', 'invite_badge', 'challenge_completed'
    badge_key VARCHAR(100) NOT NULL, -- e.g. 'step_10k', 'streak_40', 'monthly_2026_03_20k', 'invite_1', 'challenge_c101'
    earned_at TIMESTAMPTZ,
    progress_value BIGINT DEFAULT 0,
    target_value BIGINT NOT NULL,
    month_period VARCHAR(7), -- 'YYYY-MM' for monthly badges, NULL for others
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to enforce uniqueness across user, category, badge_key, and month_period
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_achievement_idx
ON public.user_achievements (user_id, category, badge_key, COALESCE(month_period, ''));

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id, category);

-- Add referred_by_code to profiles so invited users link to the inviter's referral code
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- Row Level Security
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to user_achievements"
  ON public.user_achievements
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service and authenticated full access to user_achievements"
  ON public.user_achievements
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.user_achievements TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
