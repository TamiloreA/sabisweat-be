-- ============================================================
-- SabiSweat: Club Notification Preferences
-- ============================================================
-- Adds per-member notification preference column to public.club_members.
-- Supported values: 'all_posts', 'announcements', 'admin_posts', 'off'.

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS notification_preference VARCHAR(30) DEFAULT 'all_posts';

-- Update any existing NULL rows to default 'all_posts'
UPDATE public.club_members
SET notification_preference = 'all_posts'
WHERE notification_preference IS NULL;

-- Add check constraint for supported preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_club_members_notification_preference'
  ) THEN
    ALTER TABLE public.club_members
      ADD CONSTRAINT chk_club_members_notification_preference
      CHECK (notification_preference IN ('all_posts', 'announcements', 'admin_posts', 'off'));
  END IF;
END $$;

-- Backfill COMMUNITY_UPDATE into existing notification_preferences rows
-- so users who registered before this migration have the preference enabled by default.
UPDATE public.notification_preferences
SET push_categories = push_categories || '{"COMMUNITY_UPDATE": true}'::jsonb
WHERE NOT (push_categories ? 'COMMUNITY_UPDATE');

