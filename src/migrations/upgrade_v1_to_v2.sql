-- ==============================================================================
-- SabiSweat: Master In-Place Upgrade Script (V1 Production -> V2 Production)
-- Target Database: dmrpnarmvqxlxqhkowhj
-- Preserves all live users, backfills steps, upgrades overlapping tables in-place,
-- and provisions all new V2 structures, triggers, RPCs, and RLS policies.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. UPGRADE public.profiles IN-PLACE (CRITICAL)
-- ==============================================================================

-- 1.1 Rename V1 columns in-place
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN user_id TO id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'dob'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN dob TO date_of_birth;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'starting_goal'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN starting_goal TO step_goal;
  END IF;
END $$;

-- 1.2 Convert USER-DEFINED types (citext / custom enums) to text and set defaults
ALTER TABLE public.profiles ALTER COLUMN username TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN onboarding_status TYPE TEXT;
ALTER TABLE public.profiles ALTER COLUMN onboarding_status SET DEFAULT 'not_started';
ALTER TABLE public.profiles ALTER COLUMN step_goal SET DEFAULT 8000;

-- 1.3 Drop legacy check constraints that conflict with V2 values
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.profiles'::regclass 
      AND (conname LIKE '%gender%' OR conname LIKE '%onboarding_status%')
  ) LOOP
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- 1.4 Normalize legacy gender values to V2 standard options
UPDATE public.profiles
SET gender = 'Female'
WHERE gender = 'Woman' OR LOWER(gender) = 'female';

UPDATE public.profiles
SET gender = 'Male'
WHERE gender = 'Man' OR LOWER(gender) = 'male';

UPDATE public.profiles
SET gender = 'Prefer not to say'
WHERE gender = 'Others' OR LOWER(gender) = 'others' OR LOWER(gender) = 'prefer not to say';

UPDATE public.profiles
SET gender = 'Non-binary'
WHERE LOWER(gender) IN ('non-binary', 'nonbinary', 'non_binary');

-- 1.5 Add V2 check constraints for gender and onboarding_status
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (
    gender IS NULL OR
    gender IN ('Female', 'Male', 'Non-binary', 'Prefer not to say', 'Woman', 'Man', 'Others')
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_status_check
  CHECK (
    onboarding_status IS NULL OR
    onboarding_status IN ('not_started', 'in_progress', 'completed')
  );

-- 1.6 Add all missing V2 profile columns with defaults and constraints
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS movement_relationship TEXT CHECK (movement_relationship IS NULL OR movement_relationship IN ('NONE', 'POOR', 'OCCASIONAL', 'CONSISTENT')),
  ADD COLUMN IF NOT EXISTS avatar_id TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS race TEXT,
  ADD COLUMN IF NOT EXISTS specific_subgroup TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS has_password BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS steps_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS life_happens_passes INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_free_pass_month TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- 1.7 Backfill email and has_password from auth.users
UPDATE public.profiles p
SET
  email = u.email,
  has_password = (p.has_password IS NOT FALSE AND u.encrypted_password IS NOT NULL AND u.encrypted_password <> '')
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 1.8 Profile indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);

-- 1.9 Auto-generate referral code function
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- 1.10 Replace signup trigger function with V2 definition
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, referral_code, has_password, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    generate_referral_code(),
    (NEW.raw_app_meta_data->>'provider' = 'email'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 1.11 Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Service role full access" ON public.profiles;
END $$;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;


-- ==============================================================================
-- 2. CREATE public.daily_steps & BACKFILL FROM step_daily
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.daily_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    steps INTEGER NOT NULL DEFAULT 0,
    distance_km NUMERIC(10, 4) DEFAULT 0,
    active_calories NUMERIC(10, 2) DEFAULT 0,
    source TEXT,
    time_zone TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_date UNIQUE(user_id, date)
);

ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own daily steps" ON public.daily_steps;
  DROP POLICY IF EXISTS "Users can insert their own daily steps" ON public.daily_steps;
  DROP POLICY IF EXISTS "Users can update their own daily steps" ON public.daily_steps;
  DROP POLICY IF EXISTS "Service role full access daily_steps" ON public.daily_steps;
END $$;

CREATE POLICY "Users can view their own daily steps"
    ON public.daily_steps FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily steps"
    ON public.daily_steps FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily steps"
    ON public.daily_steps FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access daily_steps"
    ON public.daily_steps FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_steps_user_date ON public.daily_steps(user_id, date);
GRANT ALL ON TABLE public.daily_steps TO anon, authenticated, service_role;

-- 2.1 Backfill historical step data from step_daily (converting distance_m to distance_km)
INSERT INTO public.daily_steps (user_id, date, steps, distance_km, synced_at, updated_at)
SELECT
  sd.user_id,
  sd.day,
  COALESCE(sd.steps, 0),
  ROUND(COALESCE(sd.distance_m, 0) / 1000.0, 4),
  COALESCE(sd.updated_at, NOW()),
  COALESCE(sd.updated_at, NOW())
FROM public.step_daily sd
INNER JOIN public.profiles p ON p.id = sd.user_id
ON CONFLICT (user_id, date) DO UPDATE SET
  steps = EXCLUDED.steps,
  distance_km = EXCLUDED.distance_km;

-- 2.2 Backfill profiles.steps_count aggregate
UPDATE public.profiles p
SET steps_count = COALESCE(sub.total_steps, 0)
FROM (
  SELECT user_id, SUM(steps)::INTEGER as total_steps
  FROM public.daily_steps
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;


-- ==============================================================================
-- 3. CUSTOM ENUMS FOR V2
-- ==============================================================================

DO $$ BEGIN
  CREATE TYPE public.club_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.club_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.join_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- ==============================================================================
-- 4. UPGRADE OVERLAPPING FEATURE TABLES
-- ==============================================================================

-- 4.1 Clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS status public.club_status DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_scope TEXT DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS regions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS countries JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clubs_location_scope'
  ) THEN
    ALTER TABLE public.clubs
      ADD CONSTRAINT chk_clubs_location_scope CHECK (location_scope IN ('single', 'multiple', 'global'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clubs_status ON public.clubs(status);
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.clubs TO anon, authenticated, service_role;

-- 4.2 Club Members
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS role public.club_role DEFAULT 'member';

CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_club_user ON public.club_members(club_id, user_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user_id ON public.club_members(user_id);
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.club_members TO anon, authenticated, service_role;

-- 4.3 Club Events
ALTER TABLE public.club_events
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Copy image_url to cover_image_url if present
UPDATE public.club_events
SET cover_image_url = image_url
WHERE cover_image_url IS NULL AND image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON public.club_events(club_id);
ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.club_events TO anon, authenticated, service_role;

-- 4.4 Challenges
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS challenge_image TEXT,
  ADD COLUMN IF NOT EXISTS rules TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS max_participants INTEGER,
  ADD COLUMN IF NOT EXISTS host_name TEXT,
  ADD COLUMN IF NOT EXISTS host_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS host_club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS who_can_join TEXT DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS leaderboard_visibility TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS reward_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_who_can_join') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_who_can_join CHECK (who_can_join IN ('everyone', 'club_members'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leaderboard_visibility') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_leaderboard_visibility CHECK (leaderboard_visibility IN ('public', 'private'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_challenges_dates ON public.challenges(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_challenges_country_region ON public.challenges(country, region);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.challenges TO anon, authenticated, service_role;

-- 4.5 Challenge Participants
ALTER TABLE public.challenge_participants
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS unique_challenge_user ON public.challenge_participants(challenge_id, user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_active ON public.challenge_participants(challenge_id, user_id) WHERE left_at IS NULL;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.challenge_participants TO anon, authenticated, service_role;

-- 4.6 News
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'article';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_news_kind') THEN
    ALTER TABLE public.news
      ADD CONSTRAINT chk_news_kind CHECK (kind IN ('article', 'poll'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_news_created_at ON public.news(created_at DESC);
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.news TO anon, authenticated, service_role;

-- 4.7 News Comments & Likes
ALTER TABLE public.news_comments
  DROP CONSTRAINT IF EXISTS news_comments_user_id_fkey;

ALTER TABLE public.news_comments
  ADD CONSTRAINT news_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_news_likes_news_user ON public.news_likes(news_id, user_id);
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_likes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.news_comments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.news_likes TO anon, authenticated, service_role;

-- 4.8 User Devices (Upgrade push_token -> expo_push_token)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_devices' AND column_name = 'push_token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_devices' AND column_name = 'expo_push_token'
  ) THEN
    ALTER TABLE public.user_devices RENAME COLUMN push_token TO expo_push_token;
  END IF;
END $$;

ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS expo_project_id TEXT,
  ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invalidation_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_device_token_idx
  ON public.user_devices (user_id, expo_push_token);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_active ON public.user_devices(user_id, is_active);
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.user_devices TO anon, authenticated, service_role;


-- ==============================================================================
-- 5. CREATE BRAND-NEW V2 TABLES
-- ==============================================================================

-- 5.1 Community Posts, Likes, and Comments
CREATE TABLE IF NOT EXISTS public.community_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT 'General',
  images_url  TEXT[] NOT NULL DEFAULT '{}',
  author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author_id ON public.community_posts(author_id);

CREATE TABLE IF NOT EXISTS public.community_likes (
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_likes_post_id ON public.community_likes(post_id);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post_id ON public.community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_parent_id ON public.community_comments(parent_id);

-- Storage bucket for community images
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- 5.2 Community Polls
CREATE TABLE IF NOT EXISTS public.community_poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_poll_options_post_id ON public.community_poll_options(post_id);

CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  option_id  UUID NOT NULL REFERENCES public.community_poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (option_id, user_id)
);

-- 5.3 Club Announcements & Reads
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

-- 5.4 Club Event RSVPs
CREATE TABLE IF NOT EXISTS public.club_event_rsvps (
  event_id   UUID NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- 5.5 Club Join Requests
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

-- 5.6 Club Reports
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

-- 5.7 News Poll Options and Votes
CREATE TABLE IF NOT EXISTS public.news_poll_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id    UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_poll_options_news_id ON public.news_poll_options(news_id);

CREATE TABLE IF NOT EXISTS public.news_poll_votes (
  option_id  UUID NOT NULL REFERENCES public.news_poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (option_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_news_poll_votes_option_id ON public.news_poll_votes(option_id);

-- 5.8 Life Happens Redemptions
CREATE TABLE IF NOT EXISTS public.life_happens_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  missed_date DATE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'free' CHECK (source IN ('free', 'points')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, missed_date)
);

CREATE INDEX IF NOT EXISTS idx_life_happens_redemptions_user ON public.life_happens_redemptions(user_id, missed_date);

-- 5.9 App Versions
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

-- Backfill from V1 app_version_config if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_version_config') THEN
    INSERT INTO public.app_versions (platform, latest_version, minimum_version, force_update, updated_at)
    SELECT platform, latest_version, minimum_version, force_update, updated_at
    FROM public.app_version_config
    ON CONFLICT (platform) DO UPDATE SET
      latest_version = EXCLUDED.latest_version,
      minimum_version = EXCLUDED.minimum_version,
      force_update = EXCLUDED.force_update,
      updated_at = EXCLUDED.updated_at;
  ELSE
    INSERT INTO public.app_versions (platform, latest_version, minimum_version, force_update)
    VALUES ('all', '1.0.11', '1.0.0', false)
    ON CONFLICT (platform) DO NOTHING;
  END IF;
END $$;

-- 5.10 User Achievements
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  badge_key VARCHAR(100) NOT NULL,
  earned_at TIMESTAMPTZ,
  progress_value BIGINT DEFAULT 0,
  target_value BIGINT NOT NULL,
  month_period VARCHAR(7),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_achievement_idx
  ON public.user_achievements (user_id, category, badge_key, COALESCE(month_period, ''));
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id, category);

-- 5.11 Notification Preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_categories JSONB NOT NULL DEFAULT '{
    "DAILY_STEP_REMINDER": true,
    "STREAK_ALERT": true,
    "CHALLENGE_UPDATE": true,
    "REWARD_EARNED": true,
    "proximity_reward": true,
    "streak_saver": true,
    "streak_milestone": true,
    "life_happens_pass": true,
    "challenge_reminder": true,
    "challenge_completion": true,
    "club_leaderboard": true,
    "new_reward": true,
    "referral_reward": true,
    "event_reminder": true,
    "welcome_onboarding": true
  }'::jsonb,
  email_categories JSONB NOT NULL DEFAULT '{
    "WEEKLY_ACTIVITY_SUMMARY": true,
    "COINS_REWARD_UPDATE": true
  }'::jsonb,
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start VARCHAR(5) DEFAULT '22:00',
  quiet_hours_end VARCHAR(5) DEFAULT '07:00',
  daily_cap INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill preferences from V1 email_prefs / push_prefs if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_prefs') THEN
    INSERT INTO public.notification_preferences (user_id, email_categories, quiet_hours_start, quiet_hours_end, daily_cap)
    SELECT
      p.id,
      jsonb_build_object(
        'WEEKLY_ACTIVITY_SUMMARY', COALESCE(ep.weekly_activity_summary, true),
        'COINS_REWARD_UPDATE', COALESCE(ep.coins_rewards_updates, true)
      ),
      COALESCE(pp.quiet_start, '22:00'),
      COALESCE(pp.quiet_end, '07:00'),
      COALESCE(pp.daily_cap, 10)
    FROM public.profiles p
    LEFT JOIN public.email_prefs ep ON ep.user_id = p.id
    LEFT JOIN public.push_prefs pp ON pp.user_id = p.id
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- 5.12 Notifications (In-App Feed)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

-- Backfill from V1 in_app_notifications if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'in_app_notifications') THEN
    INSERT INTO public.notifications (id, user_id, type, title, body, description, data, read_at, created_at)
    SELECT
      id,
      user_id,
      type,
      title,
      COALESCE(description, title),
      description,
      COALESCE(meta, '{}'::jsonb),
      read_at,
      created_at
    FROM public.in_app_notifications
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 5.13 Notification Delivery Attempts
CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.user_devices(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('push', 'email', 'in_app')),
  provider VARCHAR(50) NOT NULL,
  provider_ticket_id TEXT,
  provider_receipt_id TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'submitted', 'ticket_accepted', 'receipt_ok', 'failed', 'retry_scheduled', 'expired')),
  attempt_count INTEGER DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  payload_summary JSONB DEFAULT '{}'::jsonb,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_notification ON public.notification_delivery_attempts(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_user ON public.notification_delivery_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_ticket ON public.notification_delivery_attempts(provider_ticket_id) WHERE provider_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_status ON public.notification_delivery_attempts(status);

-- 5.14 Notification Schedules
CREATE TABLE IF NOT EXISTS public.notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email', 'both')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired', 'cancelled')),
  idempotency_key TEXT,
  expires_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_pending ON public.notification_schedules(status, scheduled_for) WHERE status = 'pending';


-- ==============================================================================
-- 6. RPC FUNCTIONS FOR NOTIFICATION & BADGE CALCULATIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO v_count
    FROM public.notifications
    WHERE user_id = p_user_id
      AND read_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW());
    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_notification_read_state(
    p_user_id UUID,
    p_notification_id UUID,
    p_mark_read BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
    v_updated_id UUID;
    v_unread_count INTEGER;
BEGIN
    UPDATE public.notifications
    SET read_at = CASE WHEN p_mark_read THEN COALESCE(read_at, NOW()) ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_notification_id AND user_id = p_user_id
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Notification not found or access denied');
    END IF;

    v_unread_count := public.get_unread_notification_count(p_user_id);

    RETURN jsonb_build_object(
        'success', true,
        'notificationId', v_updated_id,
        'read', p_mark_read,
        'unreadCount', v_unread_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_affected_rows INTEGER;
BEGIN
    UPDATE public.notifications
    SET read_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id AND read_at IS NULL;
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'affectedCount', v_affected_rows,
        'unreadCount', 0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- 7. ENABLE RLS AND APPLY GLOBAL GRANTS
-- ==============================================================================

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.life_happens_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;

-- Grants for Supabase service role and authenticated app users
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
