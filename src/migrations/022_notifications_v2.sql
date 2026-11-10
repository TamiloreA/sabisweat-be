-- ============================================================
-- SabiSweat Migration 022: Push Notification Infrastructure V2
-- Devices, Preferences, In-App Notifications, Delivery Tracking & Schedules
-- ============================================================

-- 1. Device Registry Table
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    device_id TEXT,
    device_name TEXT,
    app_id TEXT,
    app_version TEXT,
    expo_project_id TEXT,
    environment VARCHAR(20) DEFAULT 'production' CHECK (environment IN ('development', 'uat', 'production', 'staging')),
    timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
    locale VARCHAR(20) DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    invalidated_at TIMESTAMPTZ,
    invalidation_reason TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure unique active token per user and platform
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_device_token_idx
ON public.user_devices (user_id, expo_push_token);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_active ON public.user_devices(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON public.user_devices(expo_push_token);

-- 2. Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
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
        "welcome_onboarding": true,
        "COMMUNITY_UPDATE": true
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

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON public.notification_preferences(user_id);

-- 3. In-App Notifications (Inbox) Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency ON public.notifications(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expiry ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;

-- 4. Notification Delivery Attempts Table
CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_delivery_retry ON public.notification_delivery_attempts(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- 5. Notification Schedules Table
CREATE TABLE IF NOT EXISTS public.notification_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_schedules_idempotency ON public.notification_schedules(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 6. Helper Database Functions for Atomic Operations

-- Compute unread count for user
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

-- Mark single notification read or unread
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

-- Mark all notifications as read for user
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

-- 7. Row Level Security Policies

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;

-- User Devices RLS
CREATE POLICY "Users can manage own devices"
    ON public.user_devices
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access user_devices"
    ON public.user_devices
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Notification Preferences RLS
CREATE POLICY "Users can view own preferences"
    ON public.notification_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON public.notification_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
    ON public.notification_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access preferences"
    ON public.notification_preferences
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Notifications RLS
CREATE POLICY "Users can view own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification read state"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access notifications"
    ON public.notifications
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Delivery Attempts RLS (Users can only view own delivery attempts, write is backend only)
CREATE POLICY "Users can view own delivery attempts"
    ON public.notification_delivery_attempts
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access delivery attempts"
    ON public.notification_delivery_attempts
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Schedules RLS
CREATE POLICY "Users can view own schedules"
    ON public.notification_schedules
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access schedules"
    ON public.notification_schedules
    FOR ALL
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.user_devices TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notification_preferences TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notification_delivery_attempts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notification_schedules TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
