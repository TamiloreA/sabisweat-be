-- ============================================================
-- 023_post_optional_title_and_tags.sql
-- SabiSweat: Make community post title optional and support tags list
-- ============================================================

-- 1. Make title optional
ALTER TABLE public.community_posts ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.community_posts ALTER COLUMN title SET DEFAULT '';

-- 2. Add tags array column
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 3. Backfill tags from existing tag column where empty
UPDATE public.community_posts
SET tags = ARRAY[tag]
WHERE (tags IS NULL OR cardinality(tags) = 0) AND tag IS NOT NULL AND tag != '';
