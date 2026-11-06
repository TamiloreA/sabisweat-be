-- ============================================================
-- SabiSweat: Seed Challenges Mapped to "The MOvers" Club
-- ============================================================
-- This migration inserts and activates curated challenges mapped
-- directly to The MOvers club (host_club_id & host_name).
-- It is idempotent and safe to run multiple times.

DO $$
DECLARE
  v_club_id UUID;
  v_creator_id UUID;
BEGIN
  -- 1. Resolve "The MOvers" club dynamically
  SELECT id, created_by INTO v_club_id, v_creator_id
  FROM public.clubs
  WHERE name ILIKE '%The MOvers%' OR name ILIKE '%The Movers%'
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback to known UUID if name lookup yields no result
  IF v_club_id IS NULL THEN
    SELECT id, created_by INTO v_club_id, v_creator_id
    FROM public.clubs
    WHERE id = '611c89b9-5b6e-44fe-94b8-ac70dd31c2b0'
    LIMIT 1;
  END IF;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Target club "The MOvers" not found in public.clubs!';
  END IF;

  RAISE NOTICE 'Mapping challenges to The MOvers club (id: %, creator: %)', v_club_id, v_creator_id;

  -- 2. Challenge 1: The MOvers 30-Day Step Streak (Active / Flagship)
  IF EXISTS (SELECT 1 FROM public.challenges WHERE title = 'The MOvers 30-Day Step Streak' AND host_club_id = v_club_id) THEN
    UPDATE public.challenges SET
      subtitle = 'Hit 10,000 daily steps for 30 days and claim your Emerald reward!',
      description = 'Step up your daily movement with The MOvers! Build an unbreakable walking habit, climb the club leaderboard, and earn Sabi Coins plus the prestigious Emerald Badge. Every step brings you closer to your fitness goals.',
      reward_text = '5,000 Sabi Coins + Emerald Badge',
      reward_id = 'emerald',
      hero_image_url = 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image = 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules = ARRAY['Open to all active Sabi Sweat users with a verified account', 'Steps must be synced from a connected device or in-app tracking', 'All activities must be recorded within the challenge period', 'Incomplete milestones will not qualify for challenge rewards'],
      goals = ARRAY['Hit 10,000 steps every day during the 30-day challenge period', 'Log your steps consistently before 11:59 PM each day', 'Unlock the Emerald Reward Badge and 5,000 Sabi Coins upon completion'],
      country = 'Nigeria',
      region = 'Lagos',
      city_tag = 'Lagos',
      goal_type = 'steps',
      goal_value = 10000,
      max_participants = 1000,
      host_name = 'The MOvers',
      host_club_id = v_club_id,
      created_by = v_creator_id,
      who_can_join = 'everyone',
      leaderboard_visibility = 'public',
      start_at = NOW() - INTERVAL '3 days',
      end_at = NOW() + INTERVAL '27 days',
      updated_at = NOW()
    WHERE title = 'The MOvers 30-Day Step Streak' AND host_club_id = v_club_id;
  ELSE
    INSERT INTO public.challenges (
      title, subtitle, description, reward_text, reward_id, hero_image_url, challenge_image,
      rules, goals, country, region, city_tag, goal_type, goal_value, max_participants,
      host_name, host_club_id, created_by, who_can_join, leaderboard_visibility, start_at, end_at
    ) VALUES (
      'The MOvers 30-Day Step Streak',
      'Hit 10,000 daily steps for 30 days and claim your Emerald reward!',
      'Step up your daily movement with The MOvers! Build an unbreakable walking habit, climb the club leaderboard, and earn Sabi Coins plus the prestigious Emerald Badge. Every step brings you closer to your fitness goals.',
      '5,000 Sabi Coins + Emerald Badge',
      'emerald',
      'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY['Open to all active Sabi Sweat users with a verified account', 'Steps must be synced from a connected device or in-app tracking', 'All activities must be recorded within the challenge period', 'Incomplete milestones will not qualify for challenge rewards'],
      ARRAY['Hit 10,000 steps every day during the 30-day challenge period', 'Log your steps consistently before 11:59 PM each day', 'Unlock the Emerald Reward Badge and 5,000 Sabi Coins upon completion'],
      'Nigeria', 'Lagos', 'Lagos', 'steps', 10000, 1000,
      'The MOvers', v_club_id, v_creator_id, 'everyone', 'public',
      NOW() - INTERVAL '3 days', NOW() + INTERVAL '27 days'
    );
  END IF;

  -- 3. Challenge 2: The MOvers 50K Endurance Sprint (Weekly Sprint)
  IF EXISTS (SELECT 1 FROM public.challenges WHERE title = 'The MOvers 50K Endurance Sprint' AND host_club_id = v_club_id) THEN
    UPDATE public.challenges SET
      subtitle = 'Rack up 50,000 total steps this week with The MOvers community',
      description = 'A dynamic weekly sprint designed to push your endurance. Whether you run, jog, or power-walk, clock 50,000 steps across 7 days to prove your consistency and earn the Silver Badge.',
      reward_text = '2,500 Sabi Coins + Silver Badge',
      reward_id = 'silver',
      hero_image_url = 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image = 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules = ARRAY['Open to all active Sabi Sweat users', 'Steps must be synced from Apple Health, Google Fit, or in-app pedometer', 'All activities must be recorded within the 7-day challenge window', 'Cheating or simulated GPS manipulation will result in disqualification'],
      goals = ARRAY['Reach at least 7,143 steps per day or 50,000 total steps across the week', 'Compete with fellow Movers on the live leaderboard', 'Claim your Silver Badge and Sabi Coins when the finish line is reached'],
      country = 'Nigeria',
      region = 'Lagos',
      city_tag = 'Lagos',
      goal_type = 'steps',
      goal_value = 7143,
      max_participants = 500,
      host_name = 'The MOvers',
      host_club_id = v_club_id,
      created_by = v_creator_id,
      who_can_join = 'everyone',
      leaderboard_visibility = 'public',
      start_at = NOW() - INTERVAL '1 day',
      end_at = NOW() + INTERVAL '6 days',
      updated_at = NOW()
    WHERE title = 'The MOvers 50K Endurance Sprint' AND host_club_id = v_club_id;
  ELSE
    INSERT INTO public.challenges (
      title, subtitle, description, reward_text, reward_id, hero_image_url, challenge_image,
      rules, goals, country, region, city_tag, goal_type, goal_value, max_participants,
      host_name, host_club_id, created_by, who_can_join, leaderboard_visibility, start_at, end_at
    ) VALUES (
      'The MOvers 50K Endurance Sprint',
      'Rack up 50,000 total steps this week with The MOvers community',
      'A dynamic weekly sprint designed to push your endurance. Whether you run, jog, or power-walk, clock 50,000 steps across 7 days to prove your consistency and earn the Silver Badge.',
      '2,500 Sabi Coins + Silver Badge',
      'silver',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY['Open to all active Sabi Sweat users', 'Steps must be synced from Apple Health, Google Fit, or in-app pedometer', 'All activities must be recorded within the 7-day challenge window', 'Cheating or simulated GPS manipulation will result in disqualification'],
      ARRAY['Reach at least 7,143 steps per day or 50,000 total steps across the week', 'Compete with fellow Movers on the live leaderboard', 'Claim your Silver Badge and Sabi Coins when the finish line is reached'],
      'Nigeria', 'Lagos', 'Lagos', 'steps', 7143, 500,
      'The MOvers', v_club_id, v_creator_id, 'everyone', 'public',
      NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days'
    );
  END IF;

  -- 4. Challenge 3: The MOvers 100K Century Walk (Exclusive to Club Members)
  IF EXISTS (SELECT 1 FROM public.challenges WHERE title = 'The MOvers 100K Century Walk' AND host_club_id = v_club_id) THEN
    UPDATE public.challenges SET
      subtitle = 'Exclusive to The MOvers club members — achieve 100,000 steps!',
      description = 'An exclusive challenge reserved strictly for members of The MOvers club. Walk 100,000 total steps over 14 days, demonstrate club pride, and unlock the coveted Gold Badge.',
      reward_text = '10,000 Sabi Coins + Gold Badge',
      reward_id = 'gold',
      hero_image_url = 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image = 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules = ARRAY['Strictly exclusive to active members of The MOvers club', 'Must maintain active membership throughout the challenge duration', 'Steps must be synced via connected smartwatch or phone sensor', 'All recorded steps are verified automatically by the SabiSweat anti-cheat system'],
      goals = ARRAY['Accumulate 100,000 verified steps within 14 days', 'Maintain an average of at least 7,143 steps per day', 'Unlock the elite Gold Badge and 10,000 Sabi Coins'],
      country = 'Nigeria',
      region = 'Abuja (FCT)',
      city_tag = 'Abuja',
      goal_type = 'steps',
      goal_value = 7143,
      max_participants = 250,
      host_name = 'The MOvers',
      host_club_id = v_club_id,
      created_by = v_creator_id,
      who_can_join = 'club_members',
      leaderboard_visibility = 'public',
      start_at = NOW() - INTERVAL '2 days',
      end_at = NOW() + INTERVAL '12 days',
      updated_at = NOW()
    WHERE title = 'The MOvers 100K Century Walk' AND host_club_id = v_club_id;
  ELSE
    INSERT INTO public.challenges (
      title, subtitle, description, reward_text, reward_id, hero_image_url, challenge_image,
      rules, goals, country, region, city_tag, goal_type, goal_value, max_participants,
      host_name, host_club_id, created_by, who_can_join, leaderboard_visibility, start_at, end_at
    ) VALUES (
      'The MOvers 100K Century Walk',
      'Exclusive to The MOvers club members — achieve 100,000 steps!',
      'An exclusive challenge reserved strictly for members of The MOvers club. Walk 100,000 total steps over 14 days, demonstrate club pride, and unlock the coveted Gold Badge.',
      '10,000 Sabi Coins + Gold Badge',
      'gold',
      'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY['Strictly exclusive to active members of The MOvers club', 'Must maintain active membership throughout the challenge duration', 'Steps must be synced via connected smartwatch or phone sensor', 'All recorded steps are verified automatically by the SabiSweat anti-cheat system'],
      ARRAY['Accumulate 100,000 verified steps within 14 days', 'Maintain an average of at least 7,143 steps per day', 'Unlock the elite Gold Badge and 10,000 Sabi Coins'],
      'Nigeria', 'Abuja (FCT)', 'Abuja', 'steps', 7143, 250,
      'The MOvers', v_club_id, v_creator_id, 'club_members', 'public',
      NOW() - INTERVAL '2 days', NOW() + INTERVAL '12 days'
    );
  END IF;

  -- 5. Challenge 4: The MOvers Weekend Blitz (Upcoming / Weekend Sprint)
  IF EXISTS (SELECT 1 FROM public.challenges WHERE title = 'The MOvers Weekend Blitz' AND host_club_id = v_club_id) THEN
    UPDATE public.challenges SET
      subtitle = 'Crush 20,000 steps over the weekend and jumpstart your fitness',
      description = 'Don’t let the weekend slow your momentum! Join The MOvers for a fast-paced 48-hour step blitz. Smash 10,000 steps on Saturday and 10,000 on Sunday to earn instant Sabi Coins.',
      reward_text = '1,500 Sabi Coins + Emerald Badge',
      reward_id = 'emerald',
      hero_image_url = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules = ARRAY['Open to all Sabi Sweat registered users', 'Only steps logged during the designated weekend window count', 'Steps must be synced before midnight on Sunday', 'Must achieve the daily step target on both days'],
      goals = ARRAY['Hit 10,000 steps on Saturday and Sunday', 'Keep your step streak alive over the weekend', 'Earn 1,500 Sabi Coins + Emerald Badge'],
      country = 'Nigeria',
      region = 'Lagos',
      city_tag = 'Lagos',
      goal_type = 'steps',
      goal_value = 10000,
      max_participants = 1000,
      host_name = 'The MOvers',
      host_club_id = v_club_id,
      created_by = v_creator_id,
      who_can_join = 'everyone',
      leaderboard_visibility = 'public',
      start_at = NOW() + INTERVAL '1 day',
      end_at = NOW() + INTERVAL '3 days',
      updated_at = NOW()
    WHERE title = 'The MOvers Weekend Blitz' AND host_club_id = v_club_id;
  ELSE
    INSERT INTO public.challenges (
      title, subtitle, description, reward_text, reward_id, hero_image_url, challenge_image,
      rules, goals, country, region, city_tag, goal_type, goal_value, max_participants,
      host_name, host_club_id, created_by, who_can_join, leaderboard_visibility, start_at, end_at
    ) VALUES (
      'The MOvers Weekend Blitz',
      'Crush 20,000 steps over the weekend and jumpstart your fitness',
      'Don’t let the weekend slow your momentum! Join The MOvers for a fast-paced 48-hour step blitz. Smash 10,000 steps on Saturday and 10,000 on Sunday to earn instant Sabi Coins.',
      '1,500 Sabi Coins + Emerald Badge',
      'emerald',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY['Open to all Sabi Sweat registered users', 'Only steps logged during the designated weekend window count', 'Steps must be synced before midnight on Sunday', 'Must achieve the daily step target on both days'],
      ARRAY['Hit 10,000 steps on Saturday and Sunday', 'Keep your step streak alive over the weekend', 'Earn 1,500 Sabi Coins + Emerald Badge'],
      'Nigeria', 'Lagos', 'Lagos', 'steps', 10000, 1000,
      'The MOvers', v_club_id, v_creator_id, 'everyone', 'public',
      NOW() + INTERVAL '1 day', NOW() + INTERVAL '3 days'
    );
  END IF;

  -- 6. Challenge 5: The MOvers 250K Ultra Mover Marathon (Sapphire Tier)
  IF EXISTS (SELECT 1 FROM public.challenges WHERE title = 'The MOvers 250K Ultra Mover Marathon' AND host_club_id = v_club_id) THEN
    UPDATE public.challenges SET
      subtitle = 'The ultimate endurance test: 250,000 steps in 30 days!',
      description = 'For dedicated walkers and runners ready to take their fitness to the highest level. Log 250,000 steps over 30 days with The MOvers and earn the rare Sapphire Reward Badge plus a massive Sabi Coin bounty.',
      reward_text = '25,000 Sabi Coins + Sapphire Badge',
      reward_id = 'sapphire',
      hero_image_url = 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image = 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules = ARRAY['Open to all active Sabi Sweat users with verified account', 'Steps must be verified from health kit, Google Fit, or in-app tracker', 'Must hit weekly step milestones to remain eligible for top rewards', 'Leaderboard positions are updated in real-time as steps sync'],
      goals = ARRAY['Accumulate 250,000 total verified steps across 30 days', 'Average ~8,333 steps daily', 'Claim the prestigious Sapphire Badge and 25,000 Sabi Coins'],
      country = 'Nigeria',
      region = 'Lagos',
      city_tag = 'Lagos',
      goal_type = 'steps',
      goal_value = 8334,
      max_participants = 500,
      host_name = 'The MOvers',
      host_club_id = v_club_id,
      created_by = v_creator_id,
      who_can_join = 'everyone',
      leaderboard_visibility = 'public',
      start_at = NOW() - INTERVAL '5 days',
      end_at = NOW() + INTERVAL '25 days',
      updated_at = NOW()
    WHERE title = 'The MOvers 250K Ultra Mover Marathon' AND host_club_id = v_club_id;
  ELSE
    INSERT INTO public.challenges (
      title, subtitle, description, reward_text, reward_id, hero_image_url, challenge_image,
      rules, goals, country, region, city_tag, goal_type, goal_value, max_participants,
      host_name, host_club_id, created_by, who_can_join, leaderboard_visibility, start_at, end_at
    ) VALUES (
      'The MOvers 250K Ultra Mover Marathon',
      'The ultimate endurance test: 250,000 steps in 30 days!',
      'For dedicated walkers and runners ready to take their fitness to the highest level. Log 250,000 steps over 30 days with The MOvers and earn the rare Sapphire Reward Badge plus a massive Sabi Coin bounty.',
      '25,000 Sabi Coins + Sapphire Badge',
      'sapphire',
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      ARRAY['Open to all active Sabi Sweat users with verified account', 'Steps must be verified from health kit, Google Fit, or in-app tracker', 'Must hit weekly step milestones to remain eligible for top rewards', 'Leaderboard positions are updated in real-time as steps sync'],
      ARRAY['Accumulate 250,000 total verified steps across 30 days', 'Average ~8,333 steps daily', 'Claim the prestigious Sapphire Badge and 25,000 Sabi Coins'],
      'Nigeria', 'Lagos', 'Lagos', 'steps', 8334, 500,
      'The MOvers', v_club_id, v_creator_id, 'everyone', 'public',
      NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days'
    );
  END IF;

  -- 7. Refresh legacy MOvers 7-Day Step Challenge so it is active
  UPDATE public.challenges SET
    start_at = NOW() - INTERVAL '2 days',
    end_at = NOW() + INTERVAL '5 days',
    reward_id = 'emerald',
    reward_text = '5,000 Sabi Coins + Emerald Badge',
    host_name = 'The MOvers',
    host_club_id = v_club_id,
    updated_at = NOW()
  WHERE title = 'MOvers 7-Day Step Challenge' AND host_club_id = v_club_id;

  RAISE NOTICE 'Challenges successfully seeded and mapped to The MOvers club!';
END $$;
