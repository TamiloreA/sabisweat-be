-- ============================================================
-- SabiSweat: Rewards, Partners, Points Ledger & Redemption
-- Migration: 031_rewards_partners_points_ledger.sql
-- ============================================================

-- 1. Partners Table
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category VARCHAR(50),
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Nigeria',
  country_code VARCHAR(10) DEFAULT 'NG',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  cover_image_url TEXT,
  logo_image_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  authorization_code VARCHAR(50),
  code_used BOOLEAN DEFAULT FALSE,
  points_balance INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Partner Gallery Images
CREATE TABLE IF NOT EXISTS public.partner_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Partner Staff
CREATE TABLE IF NOT EXISTS public.partner_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('staff', 'admin', 'owner')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_partner_staff UNIQUE (partner_id, user_id)
);

-- 4. Rewards Table
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL CHECK (points_cost >= 0),
  image_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Points Transactions Ledger
CREATE TABLE IF NOT EXISTS public.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  source VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  reference_id TEXT UNIQUE,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Reward Redemptions
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  points_spent INTEGER NOT NULL CHECK (points_spent >= 0),
  unique_identifier VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  redeemed_by_staff_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for high-performance lookups
CREATE INDEX IF NOT EXISTS idx_partners_category ON public.partners(category);
CREATE INDEX IF NOT EXISTS idx_partners_city ON public.partners(city);
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);

CREATE INDEX IF NOT EXISTS idx_partner_images_partner ON public.partner_images(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_staff_user ON public.partner_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_staff_partner ON public.partner_staff(partner_id);

CREATE INDEX IF NOT EXISTS idx_rewards_partner_status ON public.rewards(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_rewards_status ON public.rewards(status);

CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON public.points_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_transactions_ref ON public.points_transactions(reference_id);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_partner ON public.reward_redemptions(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON public.reward_redemptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_nonce ON public.reward_redemptions(unique_identifier);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_images TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_staff TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rewards TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.points_transactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_redemptions TO authenticated, service_role;

GRANT SELECT ON public.partners TO anon;
GRANT SELECT ON public.partner_images TO anon;
GRANT SELECT ON public.rewards TO anon;
