-- ============================================================
-- SabiSweat: News Weekly Trivia Rounds, Questions & Submissions
-- Migration: 038_news_weekly_trivia.sql
-- ============================================================
-- Supports admin-uploaded, Sabi-wide timed weekly trivia rounds
-- displayed on the News tab, with hidden answers until round close,
-- draft saving, points scoring, answer explanations, and weekly /
-- all-time leaderboards.
-- ============================================================

-- 1. Trivia Rounds (uploaded from the Admin portal)
CREATE TABLE IF NOT EXISTS public.trivia_rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label          TEXT NOT NULL DEFAULT 'THIS WEEK',
  week_number         INT,
  title               TEXT NOT NULL,
  subtitle            TEXT NOT NULL DEFAULT '',
  duration_hours      INT NOT NULL DEFAULT 24,
  points_per_question INT NOT NULL DEFAULT 20,
  starts_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at           TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'published'
                        CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trivia_rounds_status_closes
  ON public.trivia_rounds(status, closes_at DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_rounds_starts_at
  ON public.trivia_rounds(starts_at DESC);

-- 2. Trivia Questions (ordered per round; correct_option_id hidden until closes_at)
CREATE TABLE IF NOT EXISTS public.trivia_questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id          UUID NOT NULL REFERENCES public.trivia_rounds(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  category          TEXT NOT NULL DEFAULT 'MOVEMENT',
  prompt            TEXT NOT NULL,
  options           JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option_id TEXT NOT NULL,
  explanation       TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trivia_questions_round_order
  ON public.trivia_questions(round_id, sort_order ASC);

-- 3. Member Trivia Submissions (supports draft saving + final locked submit)
CREATE TABLE IF NOT EXISTS public.trivia_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id          UUID NOT NULL REFERENCES public.trivia_rounds(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answers           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted')),
  submitted_at      TIMESTAMPTZ,
  score             INT NOT NULL DEFAULT 0,
  points_earned     INT NOT NULL DEFAULT 0,
  notify_on_results BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trivia_submissions_round_status
  ON public.trivia_submissions(round_id, status, points_earned DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_submissions_user
  ON public.trivia_submissions(user_id, status);

-- 4. Row Level Security
ALTER TABLE public.trivia_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published trivia rounds are readable" ON public.trivia_rounds;
DROP POLICY IF EXISTS "Service role full access trivia_rounds" ON public.trivia_rounds;
CREATE POLICY "Published trivia rounds are readable"
  ON public.trivia_rounds FOR SELECT
  USING (status IN ('published', 'closed'));
CREATE POLICY "Service role full access trivia_rounds"
  ON public.trivia_rounds FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access trivia_questions" ON public.trivia_questions;
CREATE POLICY "Service role full access trivia_questions"
  ON public.trivia_questions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users manage own trivia submissions" ON public.trivia_submissions;
DROP POLICY IF EXISTS "Service role full access trivia_submissions" ON public.trivia_submissions;
CREATE POLICY "Users manage own trivia submissions"
  ON public.trivia_submissions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access trivia_submissions"
  ON public.trivia_submissions FOR ALL USING (true) WITH CHECK (true);
