-- ============================================================
-- SabiSweat: Clubs
-- ============================================================

CREATE TYPE public.club_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.club_role AS ENUM ('admin', 'member');

-- 1. Clubs table
CREATE TABLE IF NOT EXISTS public.clubs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  tag               TEXT,
  location_text     TEXT,
  cover_image_url   TEXT,
  profile_image_url TEXT,
  theme             TEXT DEFAULT 'green',
  status            public.club_status DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clubs_status ON public.clubs(status);

-- 2. Club members
CREATE TABLE IF NOT EXISTS public.club_members (
  club_id   UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      public.club_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_user_id ON public.club_members(user_id);

-- 3. Row Level Security
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clubs are publicly readable"
  ON public.clubs FOR SELECT USING (true);

-- Only admins/backend service key can insert/update directly (in backend it uses service key so RLS is bypassed)

CREATE POLICY "Club members are publicly readable"
  ON public.club_members FOR SELECT USING (true);

-- 4. Grants
GRANT ALL ON TABLE public.clubs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.club_members TO anon, authenticated, service_role;
