-- ============================================================
-- SabiSweat: Poll votes → profiles FK (for the result breakdown)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE public.news_poll_votes
  DROP CONSTRAINT IF EXISTS news_poll_votes_user_id_fkey;

ALTER TABLE public.news_poll_votes
  ADD CONSTRAINT news_poll_votes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
