-- ============================================================
-- SabiSweat: Community tables + image bucket
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Depends on: 001_create_profiles.sql
-- NOTE: Backend connects with the secret key, which bypasses RLS.
-- ============================================================

-- 1. Community posts
CREATE TABLE IF NOT EXISTS public.community_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT 'General',
  images_url  TEXT[] NOT NULL DEFAULT '{}',
  author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author_id ON public.community_posts(author_id);

-- 2. Likes (supports likesCount + likedByMe)
CREATE TABLE IF NOT EXISTS public.community_likes (
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_likes_post_id ON public.community_likes(post_id);

-- 3. Comments (supports commentsCount)
CREATE TABLE IF NOT EXISTS public.community_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post_id ON public.community_comments(post_id);

-- 4. Storage bucket for post images (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Row Level Security (matters only for direct client access)
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are publicly readable"
  ON public.community_posts FOR SELECT USING (true);

CREATE POLICY "Users can create their own posts"
  ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Likes are publicly readable"
  ON public.community_likes FOR SELECT USING (true);

CREATE POLICY "Users can like posts"
  ON public.community_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts"
  ON public.community_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Comments are publicly readable"
  ON public.community_comments FOR SELECT USING (true);

CREATE POLICY "Users can comment on posts"
  ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Storage policies for post images
CREATE POLICY "Community images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-images');

CREATE POLICY "Users can upload community images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'community-images');
