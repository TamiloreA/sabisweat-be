import { supabase } from '../config/database';

export const getHomeSummary = async (userId: string, token: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Fetch profile for step_goal and sabi_level and points
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('step_goal, sabi_level, points_balance')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw { status: 500, error: 'server_error', message: 'Failed to fetch profile' };
  }

  // 2. Fetch today's steps
  const { data: dailySteps, error: stepsError } = await supabase
    .from('daily_steps')
    .select('steps, distance_km')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const stepsToday = dailySteps?.steps || 0;
  const distanceTodayKm = dailySteps?.distance_km || 0;
  const stepGoal = profile.step_goal || 10000;
  
  // 3. Fetch 7-day average steps (optional, simplified to just today for now to save query time, or we can query last 7 days)
  const { data: recentSteps } = await supabase
    .from('daily_steps')
    .select('steps')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(7);
    
  let dailyAvgSteps = stepsToday;
  if (recentSteps && recentSteps.length > 0) {
    const total = recentSteps.reduce((acc, curr) => acc + curr.steps, 0);
    dailyAvgSteps = Math.round(total / recentSteps.length);
  }

  const progressPercent = Math.min(Math.round((stepsToday / stepGoal) * 100), 100);

  // 4. Mock feed previews
  const todayFeedPreview = [
    {
      id: 'mock-challenge-1',
      title: 'Weekly 50k Steps',
      category: 'challenges',
      start_at: new Date().toISOString()
    }
  ];

  return {
    stepsToday,
    distanceTodayKm,
    stepGoal,
    progressPercent,
    dailyAvgSteps,
    sabiLevel: profile.sabi_level || 'Beginner',
    pointsBalance: profile.points_balance || 0,
    todayFeedPreview
  };
};
