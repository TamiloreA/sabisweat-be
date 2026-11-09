-- ============================================================
-- SabiSweat: Update Challenge Goal Types and Goal Values
-- ============================================================
-- Aligns existing challenges with the three supported types:
-- 'daily_step', 'steps_goal', 'most_steps'.

-- 1. Specific Daily Step Challenges
UPDATE public.challenges SET
  goal_type = 'daily_step',
  goal_value = 10000,
  updated_at = NOW()
WHERE title IN (
  'The MOvers 30-Day Step Streak',
  'The MOvers Weekend Blitz',
  'MOvers 7-Day Step Challenge'
);

-- 2. Specific Total Steps Goal Challenges
UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 50000,
  updated_at = NOW()
WHERE title = 'The MOvers 50K Endurance Sprint';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 100000,
  updated_at = NOW()
WHERE title = 'The MOvers 100K Century Walk';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 250000,
  updated_at = NOW()
WHERE title = 'The MOvers 250K Ultra Mover Marathon';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 300000,
  updated_at = NOW()
WHERE title = 'Lagos Marathon Prep';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 50000,
  updated_at = NOW()
WHERE title = 'Global Steps Challenge';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 100000,
  updated_at = NOW()
WHERE title = 'Abuja City Walk';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 15000,
  updated_at = NOW()
WHERE title = 'MOvers Weekend Sprint';

UPDATE public.challenges SET
  goal_type = 'steps_goal',
  goal_value = 420000,
  updated_at = NOW()
WHERE title IN ('30 Days Step Challenge', 'October Sabi Boyz');

-- 3. Default fallback for any remaining legacy 'steps'
UPDATE public.challenges SET
  goal_type = 'steps_goal',
  updated_at = NOW()
WHERE goal_type = 'steps' OR goal_type IS NULL;
