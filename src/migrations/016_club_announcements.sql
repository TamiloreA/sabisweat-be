-- ============================================================
-- SabiSweat: Club Announcements and Reads Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.club_announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title       TEXT,
  content     TEXT NOT NULL,
  image_url   TEXT,
  images      TEXT[] DEFAULT '{}',
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_announcements_club_id ON public.club_announcements(club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.club_announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.club_announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_announcement_reads_user ON public.club_announcement_reads(user_id);

-- Row Level Security
ALTER TABLE public.club_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club announcements are publicly readable"
  ON public.club_announcements FOR SELECT USING (true);

CREATE POLICY "Club announcement reads are readable by user"
  ON public.club_announcement_reads FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Club announcement reads insertable by user"
  ON public.club_announcement_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
