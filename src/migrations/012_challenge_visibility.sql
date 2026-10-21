-- ============================================================
-- SabiSweat: Challenge visibility & join restriction fields
-- ============================================================

-- Add who_can_join column (defaults to 'everyone')
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS who_can_join TEXT DEFAULT 'everyone';

-- Add leaderboard_visibility column (defaults to 'public')
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS leaderboard_visibility TEXT DEFAULT 'public';

-- Add CHECK constraints for valid enum values
ALTER TABLE public.challenges
  ADD CONSTRAINT chk_who_can_join CHECK (who_can_join IN ('everyone', 'club_members'));

ALTER TABLE public.challenges
  ADD CONSTRAINT chk_leaderboard_visibility CHECK (leaderboard_visibility IN ('public', 'private'));
