-- ============================================================
-- SabiSweat V1 (dmrpnarmvqxlxqhkowhj): Seed 5 Fresh Club Challenges (3 Co-Hosted)
-- ============================================================
-- Dynamically selects 3 distinct clubs from public.clubs
-- (preferring approved clubs first), then inserts/updates:
--   - 5 fresh-titled active challenges distributed across all 3 clubs
--   - 3 of the 5 challenges co-hosted via co_host_club_id
-- Idempotent: safe to run multiple times without creating duplicates.

DO $$
DECLARE
  v_club1_id UUID;
  v_club1_name TEXT;
  v_club1_creator UUID;

  v_club2_id UUID;
  v_club2_name TEXT;
  v_club2_creator UUID;

  v_club3_id UUID;
  v_club3_name TEXT;
  v_club3_creator UUID;

  v_fallback_creator UUID;
  v_club_count INTEGER;
BEGIN
  -- 1. Select 3 distinct clubs (prefer approved clubs, then newest/oldest fallback)
  SELECT COUNT(*) INTO v_club_count FROM public.clubs;
  IF v_club_count < 3 THEN
    RAISE EXCEPTION 'Expected at least 3 clubs in public.clubs, found %', v_club_count;
  END IF;

  SELECT id INTO v_fallback_creator
  FROM public.profiles
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT id, name, COALESCE(created_by, v_fallback_creator)
  INTO v_club1_id, v_club1_name, v_club1_creator
  FROM public.clubs
  ORDER BY (status = 'approved') DESC, created_at ASC
  OFFSET 0 LIMIT 1;

  SELECT id, name, COALESCE(created_by, v_fallback_creator)
  INTO v_club2_id, v_club2_name, v_club2_creator
  FROM public.clubs
  WHERE id <> v_club1_id
  ORDER BY (status = 'approved') DESC, created_at ASC
  OFFSET 0 LIMIT 1;

  SELECT id, name, COALESCE(created_by, v_fallback_creator)
  INTO v_club3_id, v_club3_name, v_club3_creator
  FROM public.clubs
  WHERE id NOT IN (v_club1_id, v_club2_id)
  ORDER BY (status = 'approved') DESC, created_at ASC
  OFFSET 0 LIMIT 1;

  RAISE NOTICE 'Using clubs: 1=% (%), 2=% (%), 3=% (%)',
    v_club1_name, v_club1_id,
    v_club2_name, v_club2_id,
    v_club3_name, v_club3_id;

  -- Clean up previous runs of these 5 fresh titles to stay idempotent
  DELETE FROM public.challenges
  WHERE title IN (
    'Sunrise Striders 21-Day Streak',
    'Cross-Club 120K City Rally',
    'Apex Pace 30-Day Step Showdown',
    'Midday Momentum 8K Daily Push',
    'Twilight Mile 75K Endurance Cup'
  );

  -- 2. Insert 5 fresh active challenges across the 3 clubs (3 co-hosted, 2 solo)
  INSERT INTO public.challenges (
    title,
    subtitle,
    description,
    reward_text,
    reward_id,
    hero_image_url,
    challenge_image,
    rules,
    goals,
    country,
    region,
    city_tag,
    goal_type,
    goal_value,
    max_participants,
    host_name,
    host_club_id,
    co_host_club_id,
    is_official,
    creator_type,
    who_can_join,
    leaderboard_visibility,
    created_by,
    start_at,
    end_at
  )
  VALUES
    -- Challenge 1 (Club 1 + Co-Host Club 2) — daily_step
    (
      'Sunrise Striders 21-Day Streak',
      'Co-hosted by ' || v_club1_name || ' & ' || v_club2_name || ' — hit 10,000 steps daily for 21 days',
      'Start every morning with purpose! ' || v_club1_name || ' and ' || v_club2_name || ' have teamed up for a 21-day daily consistency challenge. Hit 10,000 verified steps each day to climb the joint leaderboard and unlock the Emerald Badge.',
      '5,000 Sabi Coins + Emerald Badge',
      'emerald',
      'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY[
        'Open to all active Sabi Sweat users with a verified account',
        'Steps must be synced from Apple Health, Health Connect, or connected trackers',
        'All daily targets must be synced before midnight in your local timezone',
        'Manipulated or artificially injected step data will result in disqualification'
      ],
      ARRAY[
        'Reach at least 10,000 steps every day for 21 days',
        'Represent ' || v_club1_name || ' and ' || v_club2_name || ' on the live leaderboard',
        'Claim 5,000 Sabi Coins and the Emerald Reward Badge upon completion'
      ],
      'Nigeria',
      'Lagos',
      'Lagos',
      'daily_step',
      10000,
      1000,
      v_club1_name,
      v_club1_id,
      v_club2_id,
      false,
      'club',
      'everyone',
      'public',
      v_club1_creator,
      NOW() - INTERVAL '2 days',
      NOW() + INTERVAL '19 days'
    ),

    -- Challenge 2 (Club 2 + Co-Host Club 3) — steps_goal
    (
      'Cross-Club 120K City Rally',
      'Joint 120,000 total step sprint hosted by ' || v_club2_name || ' & ' || v_club3_name,
      'Two powerhouse clubs unite for a high-energy 14-day city rally. Accumulate 120,000 verified steps at your own pace over two weeks and earn the coveted Gold Badge.',
      '8,000 Sabi Coins + Gold Badge',
      'gold',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY[
        'Open to all Sabi Sweat walkers and runners',
        'Cumulative steps count throughout the 14-day rally window',
        'Sync your health data regularly so leaderboard standings stay accurate',
        'Cheating or simulated GPS/pedometer activity is strictly prohibited'
      ],
      ARRAY[
        'Accumulate 120,000 verified steps within 14 days',
        'Average roughly 8,600 steps per day to stay ahead of pace',
        'Unlock 8,000 Sabi Coins and the Gold Badge'
      ],
      'Nigeria',
      'Lagos',
      'Lagos',
      'steps_goal',
      120000,
      800,
      v_club2_name,
      v_club2_id,
      v_club3_id,
      false,
      'club',
      'everyone',
      'public',
      v_club2_creator,
      NOW() - INTERVAL '1 day',
      NOW() + INTERVAL '13 days'
    ),

    -- Challenge 3 (Club 3 + Co-Host Club 1) — most_steps
    (
      'Apex Pace 30-Day Step Showdown',
      v_club3_name || ' x ' || v_club1_name || ' — log the highest total steps in 30 days',
      'Who puts down the biggest monthly mileage? ' || v_club3_name || ' and ' || v_club1_name || ' present an all-out 30-day step showdown where every single step pushes you higher up the rankings.',
      '15,000 Sabi Coins + Sapphire Badge',
      'sapphire',
      'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY[
        'Open to all verified Sabi Sweat members',
        'Total verified steps determine final leaderboard placement',
        'Only steps synced during the official 30-day challenge dates count',
        'Anti-cheat verification applies to all top leaderboard finishers'
      ],
      ARRAY[
        'Log as many verified steps as possible across 30 days',
        'Battle members from ' || v_club3_name || ' and ' || v_club1_name || ' for the #1 spot',
        'Earn Sabi Coins and the Sapphire Badge'
      ],
      'Nigeria',
      'Abuja (FCT)',
      'Abuja',
      'most_steps',
      0,
      1500,
      v_club3_name,
      v_club3_id,
      v_club1_id,
      false,
      'club',
      'everyone',
      'public',
      v_club3_creator,
      NOW() - INTERVAL '3 days',
      NOW() + INTERVAL '27 days'
    ),

    -- Challenge 4 (Club 1 Solo) — daily_step
    (
      'Midday Momentum 8K Daily Push',
      'Hosted by ' || v_club1_name || ' — stay active with 8,000 steps a day for 10 days',
      'No excuses during busy weekdays! ' || v_club1_name || ' invites you to lock in an achievable 8,000 daily step habit over 10 days to keep your streak and energy high.',
      '3,000 Sabi Coins + Ruby Badge',
      'ruby',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY[
        'Open to all registered Sabi Sweat users',
        'Must sync steps via Apple Health, Health Connect, or phone pedometer',
        'Steps logged outside the 10-day window do not count',
        'Incomplete daily targets reset daily milestone credit'
      ],
      ARRAY[
        'Complete 8,000 steps each day for 10 consecutive days',
        'Build a sustainable weekday movement routine',
        'Unlock 3,000 Sabi Coins and the Ruby Badge'
      ],
      'Nigeria',
      'Lagos',
      'Lagos',
      'daily_step',
      8000,
      600,
      v_club1_name,
      v_club1_id,
      NULL,
      false,
      'club',
      'everyone',
      'public',
      v_club1_creator,
      NOW() - INTERVAL '1 day',
      NOW() + INTERVAL '9 days'
    ),

    -- Challenge 5 (Club 2 Solo) — steps_goal
    (
      'Twilight Mile 75K Endurance Cup',
      'Hosted by ' || v_club2_name || ' — hit 75,000 verified steps in 14 days',
      'Lace up for evening walks and weekend miles with ' || v_club2_name || '. Cross the 75,000-step finish line inside 14 days to claim your Silver Badge.',
      '4,000 Sabi Coins + Silver Badge',
      'silver',
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY[
        'Open to all active Sabi Sweat accounts',
        'All steps must come from verified health data sources',
        'Challenge progress updates automatically whenever your device syncs',
        'Maintain fair play — suspicious spikes are automatically flagged'
      ],
      ARRAY[
        'Reach 75,000 total verified steps within 14 days',
        'Stay steady with ~5,400+ steps per day',
        'Claim 4,000 Sabi Coins and the Silver Badge'
      ],
      'Nigeria',
      'Lagos',
      'Lagos',
      'steps_goal',
      75000,
      500,
      v_club2_name,
      v_club2_id,
      NULL,
      false,
      'club',
      'everyone',
      'public',
      v_club2_creator,
      NOW() - INTERVAL '2 days',
      NOW() + INTERVAL '12 days'
    );

  RAISE NOTICE 'Successfully seeded 5 fresh challenges across 3 clubs (3 co-hosted, 2 solo).';
END $$;

SELECT
  c.id,
  c.title,
  c.goal_type,
  c.goal_value,
  hc.name AS host_club,
  chc.name AS co_host_club,
  c.start_at,
  c.end_at
FROM public.challenges c
LEFT JOIN public.clubs hc ON hc.id = c.host_club_id
LEFT JOIN public.clubs chc ON chc.id = c.co_host_club_id
WHERE c.title IN (
  'Sunrise Striders 21-Day Streak',
  'Cross-Club 120K City Rally',
  'Apex Pace 30-Day Step Showdown',
  'Midday Momentum 8K Daily Push',
  'Twilight Mile 75K Endurance Cup'
)
ORDER BY c.created_at DESC;
