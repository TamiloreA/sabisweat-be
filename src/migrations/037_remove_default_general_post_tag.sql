-- ============================================================
-- SabiSweat: Remove Default 'General' Tag on Community Posts
-- Migration: 037_remove_default_general_post_tag.sql
-- ============================================================
-- Ensures community post tags remain optional at the database layer:
--   1. Drops DEFAULT 'General' and NOT NULL on public.posts.tag and
--      public.community_posts.tag so untagged posts persist as NULL / '{}'.
--   2. Updates sync_posts_author_and_tags() to normalize blank/whitespace
--      tags to NULL / '{}' without ever injecting 'General'.
--   3. Updates sync_posts_to_community_posts() to stop coalescing NULL tags
--      to 'General'.
--
-- NOTE: This migration intentionally does NOT mutate existing post rows.
--       See the optional commented cleanup query at the bottom if you decide
--       to clear legacy auto-assigned 'general' / 'General' tags after review.
-- ============================================================

-- 1. Remove DEFAULT 'General' and ensure tag is nullable on public.posts
ALTER TABLE public.posts ALTER COLUMN tag DROP NOT NULL;
ALTER TABLE public.posts ALTER COLUMN tag DROP DEFAULT;
ALTER TABLE public.posts ALTER COLUMN tags SET DEFAULT '{}'::text[];

-- 2. Remove NOT NULL and DEFAULT 'General' on legacy public.community_posts (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'community_posts'
  ) THEN
    ALTER TABLE public.community_posts ALTER COLUMN tag DROP NOT NULL;
    ALTER TABLE public.community_posts ALTER COLUMN tag DROP DEFAULT;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'community_posts' AND column_name = 'tags'
    ) THEN
      ALTER TABLE public.community_posts ALTER COLUMN tags SET DEFAULT '{}'::text[];
    END IF;
  END IF;
END $$;

-- 3. Replace bi-directional sync trigger on public.posts (no 'General' default, trims whitespace)
CREATE OR REPLACE FUNCTION public.sync_posts_author_and_tags()
RETURNS TRIGGER AS $$
DECLARE
  v_clean_tag  TEXT;
  v_clean_tags TEXT[];
BEGIN
  -- Sync author_id <-> user_id
  IF NEW.author_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.author_id := NEW.user_id;
  ELSIF NEW.user_id IS NULL AND NEW.author_id IS NOT NULL THEN
    NEW.user_id := NEW.author_id;
  END IF;

  -- Normalize tag and tags: trim whitespace and drop blank/null entries
  v_clean_tag := NULLIF(btrim(COALESCE(NEW.tag, '')), '');

  SELECT COALESCE(array_agg(cleaned), '{}'::text[])
  INTO v_clean_tags
  FROM (
    SELECT btrim(t) AS cleaned
    FROM unnest(COALESCE(NEW.tags, '{}'::text[])) AS t
    WHERE t IS NOT NULL AND btrim(t) <> ''
  ) AS filtered;

  -- Sync tag <-> tags without assigning any fallback/default tag
  IF cardinality(v_clean_tags) > 0 THEN
    NEW.tags := v_clean_tags;
    NEW.tag := COALESCE(v_clean_tag, v_clean_tags[1]);
  ELSIF v_clean_tag IS NOT NULL THEN
    NEW.tag := v_clean_tag;
    NEW.tags := ARRAY[v_clean_tag];
  ELSE
    NEW.tag := NULL;
    NEW.tags := '{}'::text[];
  END IF;

  -- Maintain updated_at
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_posts_author_and_tags ON public.posts;
CREATE TRIGGER trg_sync_posts_author_and_tags
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_posts_author_and_tags();

-- 4. Update compatibility trigger syncing public.posts -> public.community_posts (no 'General' fallback)
CREATE OR REPLACE FUNCTION public.sync_posts_to_community_posts()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'community_posts'
  ) THEN
    INSERT INTO public.community_posts (id, title, description, tag, tags, images_url, author_id, club_id, created_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.title, ''),
      COALESCE(NEW.description, ''),
      NULLIF(btrim(COALESCE(NEW.tag, '')), ''),
      COALESCE(NEW.tags, '{}'::text[]),
      COALESCE(NEW.images_url, '{}'::text[]),
      COALESCE(NEW.author_id, NEW.user_id),
      NEW.club_id::text,
      COALESCE(NEW.created_at, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      tag = EXCLUDED.tag,
      tags = EXCLUDED.tags,
      images_url = EXCLUDED.images_url,
      author_id = EXCLUDED.author_id,
      club_id = EXCLUDED.club_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_posts_to_community_posts ON public.posts;
CREATE TRIGGER trg_sync_posts_to_community_posts
  AFTER INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_posts_to_community_posts();

-- ============================================================
-- OPTIONAL DATA CLEANUP (commented out by default — run only after review):
-- Clears historical posts whose tag was auto-assigned 'general' / 'General'
-- by pre-2026-11-06 mobile clients (which hardcoded `|| 'general'` when no
-- tag picker value was selected and did not expose a free-text tag field)
-- or legacy backend defaults.
--
-- UPDATE public.posts
-- SET tag = NULL, tags = '{}'::text[]
-- WHERE lower(btrim(COALESCE(tag, ''))) = 'general'
--   AND (
--     tags IS NULL
--     OR cardinality(tags) = 0
--     OR (cardinality(tags) = 1 AND lower(btrim(tags[1])) = 'general')
--   );
-- ============================================================
