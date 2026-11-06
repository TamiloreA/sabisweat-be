const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedChallenges() {
  console.log('Finding club "The MOvers"...');
  
  // 1. Find The MOvers club
  const { data: clubs, error: clubError } = await supabase
    .from('clubs')
    .select('id, name, created_by, profile_image_url')
    .ilike('name', '%The MOvers%')
    .order('created_at', { ascending: true })
    .limit(1);

  if (clubError || !clubs || clubs.length === 0) {
    console.error('Club "The MOvers" not found:', clubError);
    // Fallback to known id
    const { data: fallbackClub } = await supabase
      .from('clubs')
      .select('id, name, created_by, profile_image_url')
      .eq('id', '611c89b9-5b6e-44fe-94b8-ac70dd31c2b0')
      .maybeSingle();

    if (!fallbackClub) {
      throw new Error('Club "The MOvers" not found in database.');
    }
    clubs.push(fallbackClub);
  }

  const moversClub = clubs[0];
  console.log(`Found club: ${moversClub.name} (${moversClub.id})`);

  const now = new Date();
  const subDays = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
  const addDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

  const challengesToSeed = [
    {
      title: 'The MOvers 30-Day Step Streak',
      subtitle: 'Hit 10,000 daily steps for 30 days and claim your Emerald reward!',
      description: 'Step up your daily movement with The MOvers! Build an unbreakable walking habit, climb the club leaderboard, and earn Sabi Coins plus the prestigious Emerald Badge. Every step brings you closer to your fitness goals.',
      reward_text: '5,000 Sabi Coins + Emerald Badge',
      reward_id: 'emerald',
      hero_image_url: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules: [
        'Open to all active Sabi Sweat users with a verified account',
        'Steps must be synced from a connected device or in-app tracking',
        'All activities must be recorded within the challenge period',
        'Incomplete milestones will not qualify for challenge rewards',
      ],
      goals: [
        'Hit 10,000 steps every day during the 30-day challenge period',
        'Log your steps consistently before 11:59 PM each day',
        'Unlock the Emerald Reward Badge and 5,000 Sabi Coins upon completion',
      ],
      country: 'Nigeria',
      region: 'Lagos',
      city_tag: 'Lagos',
      goal_type: 'steps',
      goal_value: 10000,
      max_participants: 1000,
      host_name: 'The MOvers',
      host_club_id: moversClub.id,
      created_by: moversClub.created_by,
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      start_at: subDays(3),
      end_at: addDays(27),
    },
    {
      title: 'The MOvers 50K Endurance Sprint',
      subtitle: 'Rack up 50,000 total steps this week with The MOvers community',
      description: 'A dynamic weekly sprint designed to push your endurance. Whether you run, jog, or power-walk, clock 50,000 steps across 7 days to prove your consistency and earn the Silver Badge.',
      reward_text: '2,500 Sabi Coins + Silver Badge',
      reward_id: 'silver',
      hero_image_url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules: [
        'Open to all active Sabi Sweat users',
        'Steps must be synced from Apple Health, Google Fit, or in-app pedometer',
        'All activities must be recorded within the 7-day challenge window',
        'Cheating or simulated GPS manipulation will result in disqualification',
      ],
      goals: [
        'Reach at least 7,143 steps per day or 50,000 total steps across the week',
        'Compete with fellow Movers on the live leaderboard',
        'Claim your Silver Badge and Sabi Coins when the finish line is reached',
      ],
      country: 'Nigeria',
      region: 'Lagos',
      city_tag: 'Lagos',
      goal_type: 'steps',
      goal_value: 7143,
      max_participants: 500,
      host_name: 'The MOvers',
      host_club_id: moversClub.id,
      created_by: moversClub.created_by,
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      start_at: subDays(1),
      end_at: addDays(6),
    },
    {
      title: 'The MOvers 100K Century Walk',
      subtitle: 'Exclusive to The MOvers club members — achieve 100,000 steps!',
      description: 'An exclusive challenge reserved strictly for members of The MOvers club. Walk 100,000 total steps over 14 days, demonstrate club pride, and unlock the coveted Gold Badge.',
      reward_text: '10,000 Sabi Coins + Gold Badge',
      reward_id: 'gold',
      hero_image_url: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules: [
        'Strictly exclusive to active members of The MOvers club',
        'Must maintain active membership throughout the challenge duration',
        'Steps must be synced via connected smartwatch or phone sensor',
        'All recorded steps are verified automatically by the SabiSweat anti-cheat system',
      ],
      goals: [
        'Accumulate 100,000 verified steps within 14 days',
        'Maintain an average of at least 7,143 steps per day',
        'Unlock the elite Gold Badge and 10,000 Sabi Coins',
      ],
      country: 'Nigeria',
      region: 'Abuja (FCT)',
      city_tag: 'Abuja',
      goal_type: 'steps',
      goal_value: 7143,
      max_participants: 250,
      host_name: 'The MOvers',
      host_club_id: moversClub.id,
      created_by: moversClub.created_by,
      who_can_join: 'club_members',
      leaderboard_visibility: 'public',
      start_at: subDays(2),
      end_at: addDays(12),
    },
    {
      title: 'The MOvers Weekend Blitz',
      subtitle: 'Crush 20,000 steps over the weekend and jumpstart your fitness',
      description: 'Don’t let the weekend slow your momentum! Join The MOvers for a fast-paced 48-hour step blitz. Smash 10,000 steps on Saturday and 10,000 on Sunday to earn instant Sabi Coins.',
      reward_text: '1,500 Sabi Coins + Emerald Badge',
      reward_id: 'emerald',
      hero_image_url: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules: [
        'Open to all Sabi Sweat registered users',
        'Only steps logged during the designated weekend window count',
        'Steps must be synced before midnight on Sunday',
        'Must achieve the daily step target on both days',
      ],
      goals: [
        'Hit 10,000 steps on Saturday and Sunday',
        'Keep your step streak alive over the weekend',
        'Earn 1,500 Sabi Coins + Emerald Badge',
      ],
      country: 'Nigeria',
      region: 'Lagos',
      city_tag: 'Lagos',
      goal_type: 'steps',
      goal_value: 10000,
      max_participants: 1000,
      host_name: 'The MOvers',
      host_club_id: moversClub.id,
      created_by: moversClub.created_by,
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      start_at: addDays(1),
      end_at: addDays(3),
    },
    {
      title: 'The MOvers 250K Ultra Mover Marathon',
      subtitle: 'The ultimate endurance test: 250,000 steps in 30 days!',
      description: 'For dedicated walkers and runners ready to take their fitness to the highest level. Log 250,000 steps over 30 days with The MOvers and earn the rare Sapphire Reward Badge plus a massive Sabi Coin bounty.',
      reward_text: '25,000 Sabi Coins + Sapphire Badge',
      reward_id: 'sapphire',
      hero_image_url: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      challenge_image: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      rules: [
        'Open to all active Sabi Sweat users with verified account',
        'Steps must be verified from health kit, Google Fit, or in-app tracker',
        'Must hit weekly step milestones to remain eligible for top rewards',
        'Leaderboard positions are updated in real-time as steps sync',
      ],
      goals: [
        'Accumulate 250,000 total verified steps across 30 days',
        'Average ~8,333 steps daily',
        'Claim the prestigious Sapphire Badge and 25,000 Sabi Coins',
      ],
      country: 'Nigeria',
      region: 'Lagos',
      city_tag: 'Lagos',
      goal_type: 'steps',
      goal_value: 8334,
      max_participants: 500,
      host_name: 'The MOvers',
      host_club_id: moversClub.id,
      created_by: moversClub.created_by,
      who_can_join: 'everyone',
      leaderboard_visibility: 'public',
      start_at: subDays(5),
      end_at: addDays(25),
    },
  ];

  for (const c of challengesToSeed) {
    // Check if challenge exists by title and host_club_id
    const { data: existing } = await supabase
      .from('challenges')
      .select('id, title')
      .eq('title', c.title)
      .eq('host_club_id', moversClub.id)
      .maybeSingle();

    if (existing) {
      console.log(`Updating existing challenge: "${c.title}" (${existing.id})`);
      const { error: updateError } = await supabase
        .from('challenges')
        .update(c)
        .eq('id', existing.id);

      if (updateError) {
        console.error(`Error updating challenge "${c.title}":`, updateError);
      } else {
        console.log(`Successfully updated: "${c.title}"`);
      }
    } else {
      console.log(`Inserting new challenge: "${c.title}"`);
      const { data: inserted, error: insertError } = await supabase
        .from('challenges')
        .insert(c)
        .select('id, title')
        .single();

      if (insertError) {
        console.error(`Error inserting challenge "${c.title}":`, insertError);
      } else {
        console.log(`Successfully created: "${inserted.title}" (${inserted.id})`);
      }
    }
  }

  // Also refresh the legacy MOvers 7-Day Step Challenge so it's currently active with an Emerald badge
  const { data: legacy7Day } = await supabase
    .from('challenges')
    .select('id')
    .eq('title', 'MOvers 7-Day Step Challenge')
    .eq('host_club_id', moversClub.id)
    .maybeSingle();

  if (legacy7Day) {
    console.log(`Refreshing legacy MOvers 7-Day Step Challenge (${legacy7Day.id})...`);
    await supabase
      .from('challenges')
      .update({
        start_at: subDays(2),
        end_at: addDays(5),
        reward_id: 'emerald',
        reward_text: '5,000 Sabi Coins + Emerald Badge',
        host_name: 'The MOvers',
      })
      .eq('id', legacy7Day.id);
    console.log('Legacy challenge refreshed!');
  }

  console.log('\nSeeding completed successfully!');
}

seedChallenges().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
