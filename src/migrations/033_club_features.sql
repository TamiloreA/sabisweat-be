-- Migration: Add club features columns (is_private, members_can_post, show_leaderboard, is_invite_only, requires_approval)

-- Add is_private column (default true — existing clubs treated as private)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT true;

-- Add members_can_post column (default false — only admins/owners can post by default)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS members_can_post BOOLEAN DEFAULT false;

-- Add show_leaderboard column (default true — leaderboard visible to all members)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS show_leaderboard BOOLEAN DEFAULT true;

-- Add is_invite_only column (default false)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN DEFAULT false;

-- Add requires_approval column (default true — join requests need admin approval)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT true;

-- Backfill: all existing clubs default to private with approval required
-- (No UPDATE needed since DEFAULT handles new inserts and existing rows get the default on ALTER)

