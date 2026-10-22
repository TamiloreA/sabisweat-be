-- ============================================================
-- SabiSweat: Add hero_image_base64 to challenges table
-- ============================================================

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS hero_image_base64 TEXT;
