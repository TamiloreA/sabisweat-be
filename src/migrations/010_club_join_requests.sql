-- ============================================================
-- SabiSweat: Club Join Requests
-- ============================================================

CREATE TYPE public.join_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS public.club_join_requests (
  club_id    UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     public.join_request_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_join_requests_status ON public.club_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_club_join_requests_user_id ON public.club_join_requests(user_id);

ALTER TABLE public.club_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own join requests"
  ON public.club_join_requests FOR SELECT USING (auth.uid() = user_id);

-- Grants
GRANT ALL ON TABLE public.club_join_requests TO anon, authenticated, service_role;
