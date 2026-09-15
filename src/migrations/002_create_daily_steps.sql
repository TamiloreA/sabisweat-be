-- Migration: Create daily_steps table

CREATE TABLE IF NOT EXISTS public.daily_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    steps INTEGER NOT NULL DEFAULT 0,
    distance_km NUMERIC(10, 4) DEFAULT 0,
    source TEXT,
    time_zone TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure a user only has one record per date
    CONSTRAINT unique_user_date UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own steps
CREATE POLICY "Users can view their own daily steps"
    ON public.daily_steps FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert/update their own steps
CREATE POLICY "Users can insert their own daily steps"
    ON public.daily_steps FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily steps"
    ON public.daily_steps FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Add an index for quick lookups by user and date range
CREATE INDEX IF NOT EXISTS idx_daily_steps_user_date ON public.daily_steps(user_id, date);
