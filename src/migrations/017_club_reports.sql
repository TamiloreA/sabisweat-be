-- ============================================================
-- SabiSweat: Club Reports
-- ============================================================

CREATE TABLE IF NOT EXISTS public.club_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  reporter_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL,
  reported_sections TEXT[] DEFAULT '{}',
  details           TEXT,
  status            TEXT DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_reports_club_id ON public.club_reports(club_id);
CREATE INDEX IF NOT EXISTS idx_club_reports_reporter_id ON public.club_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_club_reports_status ON public.club_reports(status);

-- Row Level Security
ALTER TABLE public.club_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create club reports"
  ON public.club_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read own club reports"
  ON public.club_reports FOR SELECT USING (auth.uid() = reporter_id);

-- Grants
GRANT ALL ON TABLE public.club_reports TO anon, authenticated, service_role;
