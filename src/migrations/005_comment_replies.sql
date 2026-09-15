-- ============================================================
-- SabiSweat: Community comments — nested replies support
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE;

-- Explicit FK to profiles so PostgREST can join comments → author
ALTER TABLE public.community_comments
  DROP CONSTRAINT IF EXISTS community_comments_user_id_fkey;

ALTER TABLE public.community_comments
  ADD CONSTRAINT community_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_comments_parent_id
  ON public.community_comments(parent_id);

-- Reload PostgREST schema cache so the new relationship is picked up
NOTIFY pgrst, 'reload schema';
