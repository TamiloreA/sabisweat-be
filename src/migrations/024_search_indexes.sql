-- ============================================================
-- SabiSweat Migration 024: Search Indexes & Extensions
-- PostgreSQL Full-Text Search (tsvector), Trigram Similarity (pg_trgm), Unaccent
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Immutable wrapper function for unaccent
-- PostgreSQL marks unaccent() as STABLE because it relies on dictionary files.
-- Since PostgreSQL requires functions in index expressions to be IMMUTABLE (ERROR: 42P17),
-- this immutable wrapper function satisfies that requirement.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT unaccent($1);
$$;

-- 3. Challenges Search Indexes
-- GIN Index for Full-Text Search on Challenges (title, subtitle, description)
CREATE INDEX IF NOT EXISTS idx_challenges_search_fts
  ON public.challenges
  USING gin (
    to_tsvector(
      'english',
      public.immutable_unaccent(coalesce(title, '')) || ' ' ||
      public.immutable_unaccent(coalesce(subtitle, '')) || ' ' ||
      public.immutable_unaccent(coalesce(description, ''))
    )
  );

-- GIN Trigram Index on Challenge Title for typo tolerance & fuzzy matching
CREATE INDEX IF NOT EXISTS idx_challenges_title_trgm
  ON public.challenges
  USING gin (public.immutable_unaccent(lower(title)) gin_trgm_ops);

-- GIN Trigram Index on Challenge Subtitle
CREATE INDEX IF NOT EXISTS idx_challenges_subtitle_trgm
  ON public.challenges
  USING gin (public.immutable_unaccent(lower(coalesce(subtitle, ''))) gin_trgm_ops);

-- 4. Clubs Search Indexes
-- GIN Index for Full-Text Search on Clubs (name, description, tag, location_text)
CREATE INDEX IF NOT EXISTS idx_clubs_search_fts
  ON public.clubs
  USING gin (
    to_tsvector(
      'english',
      public.immutable_unaccent(coalesce(name, '')) || ' ' ||
      public.immutable_unaccent(coalesce(description, '')) || ' ' ||
      public.immutable_unaccent(coalesce(tag, '')) || ' ' ||
      public.immutable_unaccent(coalesce(location_text, ''))
    )
  );

-- GIN Trigram Index on Club Name for typo tolerance & fuzzy matching
CREATE INDEX IF NOT EXISTS idx_clubs_name_trgm
  ON public.clubs
  USING gin (public.immutable_unaccent(lower(name)) gin_trgm_ops);

-- GIN Trigram Index on Club Tag
CREATE INDEX IF NOT EXISTS idx_clubs_tag_trgm
  ON public.clubs
  USING gin (public.immutable_unaccent(lower(coalesce(tag, ''))) gin_trgm_ops);
