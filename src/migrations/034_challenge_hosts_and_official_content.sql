-- ============================================================
-- SabiSweat Migration 034: Challenge Hosts, Co-Hosts, Official Flags, and Winner Announcement
-- ============================================================

-- 1. Co-host support on challenges
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS co_host_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL;

-- 2. Official Sabi Sweat content flags
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

-- 3. Prize draw and winner announcement locking on challenges
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS has_prize_draw BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prize_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_currency TEXT DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS winner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winner_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winner_announced_at TIMESTAMPTZ;

-- 4. Winner announcement notification subscription preference on participants
ALTER TABLE public.challenge_participants
  ADD COLUMN IF NOT EXISTS notify_announcement BOOLEAN NOT NULL DEFAULT false;

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_challenges_co_host ON public.challenges(co_host_club_id) WHERE co_host_club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_challenges_official ON public.challenges(is_official);
CREATE INDEX IF NOT EXISTS idx_clubs_official ON public.clubs(is_official);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_notify ON public.challenge_participants(challenge_id, notify_announcement) WHERE notify_announcement = true;

NOTIFY pgrst, 'reload schema';

