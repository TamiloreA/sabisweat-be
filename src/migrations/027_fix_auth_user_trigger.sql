-- ============================================================
-- SabiSweat Migration 027: Fix Auth User Trigger
-- Resolves "Database error creating new user" on signup
-- ============================================================

SET search_path TO public, extensions;

-- 1. Ensure generate_referral_code() has search_path set and proper grants
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO anon, authenticated, service_role, postgres;

-- 2. Make handle_new_user fail-safe with EXCEPTION block and explicit search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    referral_code,
    has_password,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    public.generate_referral_code(),
    COALESCE((NEW.raw_app_meta_data->>'provider' = 'email'), true),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never abort the auth.users transaction; application code in authService creates profile row directly
    RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role, postgres;

-- 3. Recreate trigger cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
