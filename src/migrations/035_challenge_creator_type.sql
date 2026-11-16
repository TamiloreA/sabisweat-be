-- ============================================================
-- SabiSweat Migration 035: Challenge Creator Type
-- ============================================================

-- 1. Add creator_type column with check constraint
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS creator_type TEXT NOT NULL DEFAULT 'club'
  CHECK (creator_type IN ('sabi_sweat', 'club'));

-- 2. Populate legacy records based on creation source
UPDATE public.challenges
  SET creator_type = 'club'
  WHERE creator_type IS NULL;

-- 3. Performance index
CREATE INDEX IF NOT EXISTS idx_challenges_creator_type ON public.challenges(creator_type);

NOTIFY pgrst, 'reload schema';
