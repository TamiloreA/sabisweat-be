-- ============================================================
-- SabiSweat: News + Polls
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- NOTE: Backend connects with the secret key, which bypasses RLS.
-- ============================================================

-- 1. News (admin-authored; may be an article or a poll)
CREATE TABLE IF NOT EXISTS public.news (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT,
  kind        TEXT NOT NULL DEFAULT 'article' CHECK (kind IN ('article', 'poll')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_created_at ON public.news(created_at DESC);

-- 2. News likes
CREATE TABLE IF NOT EXISTS public.news_likes (
  news_id    UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (news_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_news_likes_news_id ON public.news_likes(news_id);

-- 3. News comments (flat)
CREATE TABLE IF NOT EXISTS public.news_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id    UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_comments_news_id ON public.news_comments(news_id);
CREATE INDEX IF NOT EXISTS idx_news_comments_user_id ON public.news_comments(user_id);

-- 4. Poll options (only used when news.kind = 'poll')
CREATE TABLE IF NOT EXISTS public.news_poll_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id    UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_poll_options_news_id ON public.news_poll_options(news_id);

-- 5. Poll votes (one per user per poll)
CREATE TABLE IF NOT EXISTS public.news_poll_votes (
  option_id  UUID NOT NULL REFERENCES public.news_poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (option_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_news_poll_votes_option_id ON public.news_poll_votes(option_id);

-- 6. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_likes TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_comments TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_poll_options TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_poll_votes TO anon, authenticated, service_role;

-- 7. RLS (public read; writes happen via backend secret key)
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news publicly readable" ON public.news FOR SELECT USING (true);
CREATE POLICY "news likes publicly readable" ON public.news_likes FOR SELECT USING (true);
CREATE POLICY "news comments publicly readable" ON public.news_comments FOR SELECT USING (true);
CREATE POLICY "poll options publicly readable" ON public.news_poll_options FOR SELECT USING (true);
CREATE POLICY "poll votes publicly readable" ON public.news_poll_votes FOR SELECT USING (true);

-- Allow inserts (backend uses the secret key; admin flows insert news/comments/votes)
CREATE POLICY "news insert allowed" ON public.news FOR INSERT WITH CHECK (true);
CREATE POLICY "news likes insert allowed" ON public.news_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "news likes delete allowed" ON public.news_likes FOR DELETE USING (true);
CREATE POLICY "news comments insert allowed" ON public.news_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "poll options insert allowed" ON public.news_poll_options FOR INSERT WITH CHECK (true);
CREATE POLICY "poll votes insert allowed" ON public.news_poll_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "poll votes delete allowed" ON public.news_poll_votes FOR DELETE USING (true);

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
