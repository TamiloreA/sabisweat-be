-- Fix permissions for daily_steps
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_steps TO service_role;

-- Fix RLS policy for profiles to allow new users to insert their own row during onboarding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);
  END IF;
END
$$;
