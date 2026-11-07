-- ============================================================
-- SabiSweat Migration 025: FAQs & Help Search Indexes
-- Table, Missing Column Additions, Full-Text Search and Trigram Indexes
-- ============================================================

-- Ensure search_path includes both public and extensions schema
SET search_path TO public, extensions;

-- 1. Create FAQs Table (if not exists)
CREATE TABLE IF NOT EXISTS public.faqs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'General',
  "order"      INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  url          TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- 2. Add any missing columns to existing faqs table if it pre-existed
ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- If existing table used sort_order or display_order, populate "order" from it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faqs' AND column_name = 'sort_order'
  ) THEN
    UPDATE public.faqs SET "order" = sort_order WHERE ("order" = 0 OR "order" IS NULL) AND sort_order IS NOT NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faqs' AND column_name = 'display_order'
  ) THEN
    UPDATE public.faqs SET "order" = display_order WHERE ("order" = 0 OR "order" IS NULL) AND display_order IS NOT NULL;
  END IF;
END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_faqs_category_order ON public.faqs(category, "order" ASC);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON public.faqs(is_published) WHERE is_published = true;

-- GIN Index for Full-Text Search on FAQs (question, answer)
CREATE INDEX IF NOT EXISTS idx_faqs_search_fts
  ON public.faqs
  USING gin (
    to_tsvector(
      'english',
      public.immutable_unaccent(coalesce(question, '')) || ' ' ||
      public.immutable_unaccent(coalesce(answer, ''))
    )
  );

-- GIN Trigram Index on FAQ Question for typo tolerance
CREATE INDEX IF NOT EXISTS idx_faqs_question_trgm
  ON public.faqs
  USING gin (public.immutable_unaccent(lower(question)) gin_trgm_ops);

-- 4. Row Level Security
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'faqs' AND policyname = 'Published FAQs are publicly readable'
  ) THEN
    CREATE POLICY "Published FAQs are publicly readable"
      ON public.faqs FOR SELECT
      USING (is_published = true AND deleted_at IS NULL);
  END IF;
END $$;

GRANT ALL ON TABLE public.faqs TO anon, authenticated, service_role;

-- 5. Seed Initial FAQs (only if question doesn't already exist)
INSERT INTO public.faqs (question, answer, category, "order", is_published, url)
SELECT q.question, q.answer, q.category, q."order", q.is_published, q.url
FROM (
  VALUES
    (
      'How do I earn Sabi coins?',
      'You earn Sabi coins by completing daily step goals, joining challenges, and participating in clubs.',
      'Rewards',
      1,
      true,
      '/help/how-to-earn-sabi-coins'
    ),
    (
      'How to create or join a Club',
      'Learn how to request access or build your own community. Navigate to the Clubs tab, explore available clubs or tap Create Club to start your own.',
      'Clubs',
      1,
      true,
      '/help/how-to-join-a-club'
    ),
    (
      'How do step challenges work?',
      'Challenges allow you to compete with other users to reach a step target within a set timeframe. Track your progress daily and climb the leaderboard to unlock exclusive badges and rewards.',
      'Challenges',
      1,
      true,
      '/help/challenges-guide'
    ),
    (
      'How do streaks and Life Happens pass work?',
      'Maintain your daily step goal to build a streak. If life gets in the way, you can redeem a Life Happens pass to protect your streak from resetting.',
      'General',
      1,
      true,
      '/help/streaks-and-passes'
    ),
    (
      'How do I update my profile or delete my account?',
      'You can update your personal details and fitness goals in Profile Settings. To delete your account, visit Help & Support and submit an account deletion request.',
      'Account',
      1,
      true,
      '/help/account-management'
    ),
    (
      'How is my daily step count tracked?',
      'SabiSweat syncs your verified steps directly from connected fitness trackers like Apple Health and Google Fit. Keep the app updated for seamless syncing.',
      'General',
      2,
      true,
      '/help/step-tracking'
    )
) AS q(question, answer, category, "order", is_published, url)
WHERE NOT EXISTS (
  SELECT 1 FROM public.faqs f WHERE lower(f.question) = lower(q.question)
);

-- 6. Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
