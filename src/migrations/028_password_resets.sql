-- ============================================================
-- SabiSweat Migration 028: Password Resets Table
-- Dedicated storage for backend-generated 6-digit OTP codes
-- ============================================================

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email ON public.password_resets(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON public.password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_created_at ON public.password_resets(created_at);

-- Grant permissions
GRANT ALL ON TABLE public.password_resets TO service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.password_resets TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

