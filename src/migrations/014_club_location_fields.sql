-- ============================================================
-- SabiSweat: Add locationScope, country, countryCode, regions, countries to clubs
-- ============================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS location_scope TEXT DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS regions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS countries JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clubs_location_scope'
  ) THEN
    ALTER TABLE public.clubs
      ADD CONSTRAINT chk_clubs_location_scope CHECK (location_scope IN ('single', 'multiple', 'global'));
  END IF;
END $$;
