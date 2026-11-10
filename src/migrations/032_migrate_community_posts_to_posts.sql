-- ============================================================
-- SabiSweat: Community Posts Table Migration
-- Migration: 032_migrate_community_posts_to_posts.sql
-- ============================================================
-- Migrates community post functionality from public.community_posts
-- to the canonical public.posts table, ensuring all necessary fields exist:
--   - title (optional TEXT default '')
--   - description (TEXT not null default '')
--   - tag (TEXT default 'General')
--   - tags (TEXT[] default '{}')
--   - images_url (TEXT[] default '{}')
--   - author_id (UUID references public.profiles(id) on delete cascade)
--   - user_id (UUID references public.profiles(id) on delete cascade)
--   - club_id (UUID or TEXT)
--   - likes_count, comments_count, shares_count, visible, created_at, updated_at
-- Includes bi-directional sync trigger between author_id and user_id,
-- migrates existing rows from community_posts to posts, and retargets
-- foreign keys on community_likes, community_comments, community_poll_options.
-- ============================================================

-- 1. Create public.posts table if it does not already exist
CREATE TABLE IF NOT EXISTS public.posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tag         TEXT DEFAULT 'General',
  tags        TEXT[] DEFAULT '{}',
  images_url  TEXT[] NOT NULL DEFAULT '{}',
  author_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id     TEXT,
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  shares_count INT DEFAULT 0,
  visible     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure all required columns exist on public.posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'General';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS images_url TEXT[] DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_id UUID;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS club_id TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make title optional (drop NOT NULL if set)
ALTER TABLE public.posts ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.posts ALTER COLUMN title SET DEFAULT '';

-- Make description default to empty string if NULL
ALTER TABLE public.posts ALTER COLUMN description SET DEFAULT '';

-- 3. Add foreign key constraints on author_id and user_id safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_author_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.posts
        ADD CONSTRAINT posts_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_user_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.posts
        ADD CONSTRAINT posts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
END $$;

-- 4. Bi-directional sync trigger between author_id and user_id, tag and tags
CREATE OR REPLACE FUNCTION public.sync_posts_author_and_tags()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync author_id <-> user_id
  IF NEW.author_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.author_id := NEW.user_id;
  ELSIF NEW.user_id IS NULL AND NEW.author_id IS NOT NULL THEN
    NEW.user_id := NEW.author_id;
  END IF;

  -- Sync tag <-> tags
  IF (NEW.tags IS NULL OR cardinality(NEW.tags) = 0) AND NEW.tag IS NOT NULL AND NEW.tag != '' THEN
    NEW.tags := ARRAY[NEW.tag];
  ELSIF (NEW.tag IS NULL OR NEW.tag = '' OR NEW.tag = 'General') AND NEW.tags IS NOT NULL AND cardinality(NEW.tags) > 0 THEN
    NEW.tag := NEW.tags[1];
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

-- 5. Migrate existing data from public.community_posts to public.posts (if community_posts exists)
DO $$
DECLARE
  v_club_id_type text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'community_posts') THEN
    SELECT data_type INTO v_club_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'club_id';

    IF v_club_id_type = 'uuid' THEN
      INSERT INTO public.posts (
        id, title, description, tag, tags, images_url, author_id, user_id, club_id, created_at
      )
      SELECT
        cp.id,
        COALESCE(cp.title, ''),
        COALESCE(cp.description, ''),
        COALESCE(cp.tag, 'General'),
        CASE
          WHEN cp.tags IS NOT NULL AND cardinality(cp.tags) > 0 THEN cp.tags
          WHEN cp.tag IS NOT NULL AND cp.tag != '' THEN ARRAY[cp.tag]
          ELSE '{}'::text[]
        END,
        COALESCE(cp.images_url, '{}'),
        cp.author_id,
        cp.author_id,
        CASE
          WHEN cp.club_id IS NOT NULL AND cp.club_id ~* '^[0-9a-f-]{36}$' THEN cp.club_id::uuid
          ELSE NULL
        END,
        COALESCE(cp.created_at, NOW())
      FROM public.community_posts cp
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        tag = EXCLUDED.tag,
        tags = EXCLUDED.tags,
        images_url = EXCLUDED.images_url,
        author_id = COALESCE(public.posts.author_id, EXCLUDED.author_id),
        user_id = COALESCE(public.posts.user_id, EXCLUDED.user_id),
        club_id = COALESCE(public.posts.club_id, EXCLUDED.club_id);
    ELSE
      INSERT INTO public.posts (
        id, title, description, tag, tags, images_url, author_id, user_id, club_id, created_at
      )
      SELECT
        cp.id,
        COALESCE(cp.title, ''),
        COALESCE(cp.description, ''),
        COALESCE(cp.tag, 'General'),
        CASE
          WHEN cp.tags IS NOT NULL AND cardinality(cp.tags) > 0 THEN cp.tags
          WHEN cp.tag IS NOT NULL AND cp.tag != '' THEN ARRAY[cp.tag]
          ELSE '{}'::text[]
        END,
        COALESCE(cp.images_url, '{}'),
        cp.author_id,
        cp.author_id,
        cp.club_id,
        COALESCE(cp.created_at, NOW())
      FROM public.community_posts cp
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        tag = EXCLUDED.tag,
        tags = EXCLUDED.tags,
        images_url = EXCLUDED.images_url,
        author_id = COALESCE(public.posts.author_id, EXCLUDED.author_id),
        user_id = COALESCE(public.posts.user_id, EXCLUDED.user_id),
        club_id = COALESCE(public.posts.club_id, EXCLUDED.club_id);
    END IF;
  END IF;
END $$;

-- 6. Backfill author_id, user_id, and tags on any pre-existing posts rows
UPDATE public.posts
SET author_id = user_id
WHERE author_id IS NULL AND user_id IS NOT NULL;

UPDATE public.posts
SET user_id = author_id
WHERE user_id IS NULL AND author_id IS NOT NULL;

UPDATE public.posts
SET tags = ARRAY[tag]
WHERE (tags IS NULL OR cardinality(tags) = 0) AND tag IS NOT NULL AND tag != '';

-- 7. Retarget foreign keys of community_likes, community_comments, community_poll_options to public.posts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name, tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE ccu.table_name = 'community_posts' AND tc.constraint_type = 'FOREIGN KEY'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I;', r.table_name, r.constraint_name);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'community_likes') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'community_likes' AND ccu.table_name = 'posts' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
      BEGIN
        ALTER TABLE public.community_likes
          ADD CONSTRAINT fk_community_likes_post_id FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'community_comments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'community_comments' AND ccu.table_name = 'posts' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
      BEGIN
        ALTER TABLE public.community_comments
          ADD CONSTRAINT fk_community_comments_post_id FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'community_poll_options') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'community_poll_options' AND ccu.table_name = 'posts' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
      BEGIN
        ALTER TABLE public.community_poll_options
          ADD CONSTRAINT fk_community_poll_options_post_id FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  END IF;
END $$;

-- 8. Compatibility: keep community_posts table in sync with posts if community_posts table remains
CREATE OR REPLACE FUNCTION public.sync_posts_to_community_posts()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'community_posts') THEN
    INSERT INTO public.community_posts (id, title, description, tag, tags, images_url, author_id, club_id, created_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.title, ''),
      COALESCE(NEW.description, ''),
      COALESCE(NEW.tag, 'General'),
      COALESCE(NEW.tags, '{}'),
      COALESCE(NEW.images_url, '{}'),
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

-- 9. Row Level Security & Policies
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posts are publicly readable" ON public.posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;
DROP POLICY IF EXISTS "Service role full access posts" ON public.posts;

CREATE POLICY "Posts are publicly readable"
  ON public.posts FOR SELECT USING (true);

CREATE POLICY "Users can create their own posts"
  ON public.posts FOR INSERT WITH CHECK (auth.uid() = COALESCE(user_id, author_id));

CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE USING (auth.uid() = COALESCE(user_id, author_id));

CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE USING (auth.uid() = COALESCE(user_id, author_id));

CREATE POLICY "Service role full access posts"
  ON public.posts FOR ALL USING (true) WITH CHECK (true);

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_club_id ON public.posts(club_id);
