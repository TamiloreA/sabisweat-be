import { getUserSupabase } from '../config/database';

export const getPointsBalance = async (userId: string, token: string) => {
  const { data, error } = await getUserSupabase(token)
    .from('profiles')
    .select('points_balance')
    .eq('id', userId)
    .single();

  if (error) {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve points balance' };
  }

  return { pointsBalance: data?.points_balance || 0 };
};
