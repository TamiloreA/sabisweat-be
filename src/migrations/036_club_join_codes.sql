-- =============================================================================
-- Migration 036: Club Join Codes (Fast Single-Round-Trip Approval Bypass)
-- Allows private clubs to configure an optional join code so invited users can
-- bypass admin approval while keeping admin approval when no code is provided.
-- =============================================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS join_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS join_code_updated_at TIMESTAMPTZ NULL;

-- Unique case-insensitive partial index for O(1) join-by-code lookup and collision prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_join_code_upper
  ON public.clubs (UPPER(join_code))
  WHERE join_code IS NOT NULL;

-- Atomic single-round-trip join RPC: handles public join, private join request,
-- per-club join with code, and global join-by-code in one database round-trip.
CREATE OR REPLACE FUNCTION public.join_club_atomic(
  p_club_id UUID,
  p_user_id UUID,
  p_join_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_code TEXT;
  v_existing_member UUID;
  v_existing_req_status TEXT;
  v_count INTEGER;
BEGIN
  v_code := NULLIF(UPPER(TRIM(COALESCE(p_join_code, ''))), '');

  -- 1. Resolve target club by ID or by unique join_code
  IF p_club_id IS NOT NULL THEN
    SELECT id, name, is_private, status, join_code, theme
    INTO v_club
    FROM public.clubs
    WHERE id = p_club_id;
  ELSIF v_code IS NOT NULL THEN
    SELECT id, name, is_private, status, join_code, theme
    INTO v_club
    FROM public.clubs
    WHERE UPPER(join_code) = v_code
    LIMIT 1;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error_code', 'CLUB_NOT_FOUND', 'message', 'Club not found');
  END IF;

  IF NOT FOUND THEN
    IF p_club_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE', 'message', 'Invalid club code');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error_code', 'CLUB_NOT_FOUND', 'message', 'Club not found');
  END IF;

  IF v_club.status IS NOT NULL AND v_club.status::TEXT <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'CLUB_NOT_APPROVED', 'message', 'This club is not open for joining yet');
  END IF;

  -- 2. Check existing membership
  SELECT user_id INTO v_existing_member
  FROM public.club_members
  WHERE club_id = v_club.id AND user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ALREADY_MEMBER', 'message', 'User is already a member');
  END IF;

  -- 3. Join with code (bypasses admin approval on match; rejects without creating pending request on mismatch)
  IF v_code IS NOT NULL THEN
    IF v_club.join_code IS NULL OR UPPER(v_club.join_code) <> v_code THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE', 'message', 'Invalid club code');
    END IF;

    INSERT INTO public.club_members (club_id, user_id, role)
    VALUES (v_club.id, p_user_id, 'member')
    ON CONFLICT DO NOTHING;

    -- Resolve any existing pending join request for this user
    UPDATE public.club_join_requests
    SET status = 'approved', updated_at = NOW()
    WHERE club_id = v_club.id AND user_id = p_user_id AND status = 'pending';

    SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.club_members
    WHERE club_id = v_club.id;

    UPDATE public.clubs
    SET members_count = v_count
    WHERE id = v_club.id;

    RETURN jsonb_build_object(
      'ok', true,
      'joined', true,
      'bypassed_approval', true,
      'club_id', v_club.id,
      'club_name', v_club.name,
      'club_theme', COALESCE(v_club.theme, 'green'),
      'members_count', v_count
    );
  END IF;

  -- 4. Public club without code -> join immediately
  IF v_club.is_private = false THEN
    INSERT INTO public.club_members (club_id, user_id, role)
    VALUES (v_club.id, p_user_id, 'member')
    ON CONFLICT DO NOTHING;

    SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.club_members
    WHERE club_id = v_club.id;

    UPDATE public.clubs
    SET members_count = v_count
    WHERE id = v_club.id;

    RETURN jsonb_build_object(
      'ok', true,
      'joined', true,
      'bypassed_approval', false,
      'club_id', v_club.id,
      'club_name', v_club.name,
      'club_theme', COALESCE(v_club.theme, 'green'),
      'members_count', v_count
    );
  END IF;

  -- 5. Private club without code -> admin approval request flow
  SELECT status::TEXT INTO v_existing_req_status
  FROM public.club_join_requests
  WHERE club_id = v_club.id AND user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_req_status = 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'REQUEST_PENDING', 'message', 'Join request is already pending');
    ELSIF v_existing_req_status = 'approved' THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'REQUEST_APPROVED', 'message', 'Join request is already approved');
    ELSE
      UPDATE public.club_join_requests
      SET status = 'pending', updated_at = NOW()
      WHERE club_id = v_club.id AND user_id = p_user_id;
    END IF;
  ELSE
    INSERT INTO public.club_join_requests (club_id, user_id, status)
    VALUES (v_club.id, p_user_id, 'pending');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.club_members
  WHERE club_id = v_club.id;

  RETURN jsonb_build_object(
    'ok', true,
    'joined', false,
    'bypassed_approval', false,
    'club_id', v_club.id,
    'club_name', v_club.name,
    'club_theme', COALESCE(v_club.theme, 'green'),
    'members_count', v_count
  );
END;
$$;
