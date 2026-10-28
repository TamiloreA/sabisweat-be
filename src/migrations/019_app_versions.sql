-- ============================================================
-- SabiSweat Migration 019: App Versions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE DEFAULT 'all',
  latest_version TEXT NOT NULL DEFAULT '1.0.11',
  minimum_version TEXT NOT NULL DEFAULT '1.0.0',
  force_update BOOLEAN NOT NULL DEFAULT false,
  release_notes TEXT,
  store_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Allow public read access so unauthenticated apps can check versions at launch
CREATE POLICY "Allow public read access to app_versions"
  ON public.app_versions
  FOR SELECT
  USING (true);

-- Allow authenticated and service_role full access to manage versions
CREATE POLICY "Allow service and authenticated full access to app_versions"
  ON public.app_versions
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.app_versions TO anon, authenticated, service_role;

-- Insert default version record if not present
INSERT INTO public.app_versions (platform, latest_version, minimum_version, force_update)
VALUES ('all', '1.0.11', '1.0.0', false)
ON CONFLICT (platform) DO UPDATE SET
  updated_at = NOW();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
