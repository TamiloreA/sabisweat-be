-- ============================================================
-- SabiSweat Migration 024: Search Indexes & Extensions
-- PostgreSQL Full-Text Search (tsvector), Trigram Similarity (pg_trgm), Unaccent
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Challenges Search Indexes
-- GIN Index for Full-Text Search on Challenges (title, subtitle, description)
CREATE INDEX IF NOT EXISTS idx_challenges_search_fts
  ON public.challenges
  USING gin (
    to_tsvector(
      'english',
      unaccent(coalesce(title, '')) || ' ' ||
      unaccent(coalesce(subtitle, '')) || ' ' ||
      unaccent(coalesce(description, ''))
    )
  );

-- GIN Trigram Index on Challenge Title for typo tolerance & fuzzy matching
CREATE INDEX IF NOT EXISTS idx_challenges_title_trgm
  ON public.challenges
  USING gin (unaccent(lower(title)) gin_trgm_ops);

-- GIN Trigram Index on Challenge Subtitle
CREATE INDEX IF NOT EXISTS idx_challenges_subtitle_trgm
  ON public.challenges
  USING gin (unaccent(lower(coalesce(subtitle, ''))) gin_trgm_ops);

-- 3. Clubs Search Indexes
-- GIN Index for Full-Text Search on Clubs (name, description, tag, location_text)
CREATE INDEX IF NOT EXISTS idx_clubs_search_fts
  ON public.clubs
  USING gin (
    to_tsvector(
      'english',
      unaccent(coalesce(name, '')) || ' ' ||
      unaccent(coalesce(description, '')) || ' ' ||
      unaccent(coalesce(tag, '')) || ' ' ||
      unaccent(coalesce(location_text, ''))
    )
  );

-- GIN Trigram Index on Club Name for typo tolerance & fuzzy matching
CREATE INDEX IF NOT EXISTS idx_clubs_name_trgm
  ON public.clubs
  USING gin (unaccent(lower(name)) gin_trgm_ops);

-- GIN Trigram Index on Club Tag
CREATE INDEX IF NOT EXISTS idx_clubs_tag_trgm
  ON public.clubs
  USING gin (unaccent(lower(coalesce(tag, ''))) gin_trgm_ops);
