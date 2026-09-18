-- ============================================================
-- SabiSweat: Club Polls and Events
-- ============================================================

-- 1. Community Poll Options
CREATE TABLE IF NOT EXISTS public.community_poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_poll_options_post_id ON public.community_poll_options(post_id);

-- 2. Community Poll Votes
CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  option_id  UUID NOT NULL REFERENCES public.community_poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (option_id, user_id)
);

-- 3. Club Events
CREATE TABLE IF NOT EXISTS public.club_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  location_text   TEXT NOT NULL DEFAULT '',
  start_at        TIMESTAMPTZ NOT NULL,
  cover_image_url TEXT,
  created_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON public.club_events(club_id);

-- 4. Club Event RSVPs
CREATE TABLE IF NOT EXISTS public.club_event_rsvps (
  event_id   UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- 5. Row Level Security
ALTER TABLE public.community_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Poll options publicly readable"
  ON public.community_poll_options FOR SELECT USING (true);

CREATE POLICY "Poll votes publicly readable"
  ON public.community_poll_votes FOR SELECT USING (true);

CREATE POLICY "Club events publicly readable"
  ON public.club_events FOR SELECT USING (true);

CREATE POLICY "Club event RSVPs publicly readable"
  ON public.club_event_rsvps FOR SELECT USING (true);

-- 6. Grants
GRANT ALL ON TABLE public.community_poll_options TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.community_poll_votes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.club_events TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.club_event_rsvps TO anon, authenticated, service_role;
