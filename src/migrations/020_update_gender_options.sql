-- ============================================================
-- SabiSweat Migration 020: Update Gender Options
-- Supports Female, Male, Non-binary, and Prefer not to say
-- ============================================================

-- 1. Drop existing gender check constraint if present
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;

-- 2. Migrate existing legacy gender data to standard options
UPDATE public.profiles
SET gender = 'Female'
WHERE gender = 'Woman' OR LOWER(gender) = 'female';

UPDATE public.profiles
SET gender = 'Male'
WHERE gender = 'Man' OR LOWER(gender) = 'male';

UPDATE public.profiles
SET gender = 'Prefer not to say'
WHERE gender = 'Others' OR LOWER(gender) = 'others' OR LOWER(gender) = 'prefer not to say';

UPDATE public.profiles
SET gender = 'Non-binary'
WHERE LOWER(gender) = 'non-binary' OR LOWER(gender) = 'nonbinary' OR LOWER(gender) = 'non_binary';

-- 3. Add updated constraint allowing new standard options and legacy fallbacks
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_gender_check
CHECK (
  gender IS NULL OR
  gender IN (
    'Female',
    'Male',
    'Non-binary',
    'Prefer not to say',
    'Woman',
    'Man',
    'Others'
  )
);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
