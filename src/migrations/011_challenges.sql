-- ============================================================
-- SabiSweat: Challenges
-- ============================================================

-- 1. Challenges table
CREATE TABLE IF NOT EXISTS public.challenges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  subtitle          TEXT,
  description       TEXT,
  reward_text       TEXT,
  hero_image_url    TEXT,
  challenge_image   TEXT,
  rules             TEXT[],
  goals             TEXT[],
  sponsor_text      TEXT,
  city_tag          TEXT,
  country           TEXT,
  region            TEXT,
  goal_type         TEXT DEFAULT 'steps',
  goal_value        INTEGER,
  max_participants  INTEGER,
  host_name         TEXT,
  host_logo_url     TEXT,
  host_club_id      UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_dates ON public.challenges(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_challenges_country_region ON public.challenges(country, region);

-- 2. Challenge participants (join table)
CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  left_at         TIMESTAMPTZ,
  claimed_at      TIMESTAMPTZ,
  CONSTRAINT unique_challenge_user UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON public.challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON public.challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_active ON public.challenge_participants(challenge_id, user_id) WHERE left_at IS NULL;

-- 3. Row Level Security
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challenges are publicly readable"
  ON public.challenges FOR SELECT USING (true);

CREATE POLICY "Challenge participants are publicly readable"
  ON public.challenge_participants FOR SELECT USING (true);

-- 4. Grants (service role bypasses RLS; anon/authenticated can read)
GRANT ALL ON TABLE public.challenges TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.challenge_participants TO anon, authenticated, service_role;

-- 5. Seed: Insert a few test challenges
INSERT INTO public.challenges (title, subtitle, description, reward_text, hero_image_url, rules, goals, country, region, goal_type, goal_value, max_participants, host_name, start_at, end_at)
VALUES
  (
    'Sabi Sweat 30-Day Step Challenge',
    'Join the community to hit 10,000 steps a day and win exclusive sabi coin rewards!',
    'Walk, run, or stay active to complete a total of 300,000 verified steps within 30 days. Track your steps daily and climb the leaderboard to earn Sabi Coins and an exclusive challenge badge.',
    '10,000 Sabi Coins + Exclusive Badge',
    'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    ARRAY['Open to all active Sabi Sweat users with verified account', 'Steps must be synced from a connected device or in-app tracking.', 'All activities must be recorded within the challenge period', 'Incomplete milestones will not qualify for challenge rewards.'],
    ARRAY['Walk, run, or stay active to complete a total of 300,000 verified steps.', 'All steps must be recorded between the challenge start and end dates.', 'Hit the goal before the deadline to unlock your challenge badge and rewards.'],
    'Nigeria', 'Lagos', 'steps', 10000, 500, 'Sabi Sweat',
    NOW() - INTERVAL '5 days',
    NOW() + INTERVAL '25 days'
  ),
  (
    'ERC 5K Daily Run',
    'Keep moving and log your 5K daily',
    'Complete a 5K run daily for a week. This challenge is hosted by the Ekò Runners Club to keep the running community active.',
    '500 Sabi Coins',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    ARRAY['Must complete at least 5,000 steps per day', 'Steps tracked via the app only'],
    ARRAY['Complete 5,000 steps every day for 7 consecutive days'],
    'Nigeria', 'Lagos', 'steps', 5000, 500, 'Ekò Runners Club',
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '5 days'
  ),
  (
    'Weekend Warrior',
    'Push your limits this weekend',
    'A high-intensity weekend step challenge. Complete 15,000 steps over the weekend to prove you are a weekend warrior.',
    '100 Sabi Coins',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    ARRAY['Only weekend steps count (Saturday & Sunday)', 'Must complete before Sunday midnight'],
    ARRAY['Complete 15,000 steps over the weekend'],
    'Nigeria', 'Abuja (FCT)', 'steps', 15000, NULL, 'Sabi Sweat',
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '3 days'
  ),
  (
    'London Summer Sprint',
    'Get ready for the summer with this high-intensity sprint challenge.',
    'A 30-day sprint challenge for London runners. Complete 50,000 steps and earn your summer badge.',
    '5,000 Sabi Coins',
    'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    ARRAY['Open to users in Greater London area', 'Steps must be synced daily'],
    ARRAY['Complete 50,000 verified steps in 30 days'],
    'United Kingdom', 'Greater London', 'steps', 50000, 500, 'Sabi Sweat',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '37 days'
  ),
  (
    '10 & 20K Steps Everyday',
    'Complete a 40K run in January whether its running or moving',
    'Push your limits with this intense daily challenge. Hit either 10K or 20K steps every single day for a month.',
    '2,000 Sabi Coins',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    ARRAY['Must log steps every single day', 'No rest days allowed'],
    ARRAY['Hit at least 10,000 steps daily for 30 days'],
    'Nigeria', 'Lagos', 'steps', 20000, NULL, 'Sabi Sweat',
    NOW() - INTERVAL '40 days',
    NOW() - INTERVAL '10 days'
  );
