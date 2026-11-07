-- ============================================================
-- SabiSweat Migration 026: User Unit & Start of Week Preferences
-- Adds preferences JSONB column to public.profiles
-- ============================================================

-- Ensure search_path includes both public and extensions schema
SET search_path TO public, extensions;

-- 1. Add preferences JSONB column with defaults
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{
    "distanceUnit": "Kilometres",
    "energyUnit": "Calories",
    "startOfWeek": "Saturday"
  }'::jsonb;

-- 2. Backfill existing profile rows where preferences is NULL
UPDATE public.profiles
SET preferences = '{
  "distanceUnit": "Kilometres",
  "energyUnit": "Calories",
  "startOfWeek": "Saturday"
}'::jsonb
WHERE preferences IS NULL;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
