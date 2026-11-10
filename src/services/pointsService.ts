import { supabase, getUserSupabase } from '../config/database';
import { SabiLevel } from '../models/authModel';
import { LedgerTransaction } from '../models/rewardModel';

export const LEVEL_RANK: Record<SabiLevel, number> = {
  Starter: 1,
  Mover: 2,
  Strider: 3,
  Champion: 4,
  Legend: 5,
};

export const STEPS_PER_LEVEL = 1_000_000;

/**
 * Resolves Sabi Level from lifetime steps based on established tiers:
 * Starter: 0 - 999,999
 * Mover: 1,000,000 - 1,999,999
 * Strider: 2,000,000 - 2,999,999
 * Champion: 3,000,000 - 3,999,999
 * Legend: 4,000,000+
 */
export function resolveLevelFromSteps(steps: number): SabiLevel {
  const safeSteps = Math.max(0, steps || 0);
  if (safeSteps >= 4 * STEPS_PER_LEVEL) return 'Legend';
  if (safeSteps >= 3 * STEPS_PER_LEVEL) return 'Champion';
  if (safeSteps >= 2 * STEPS_PER_LEVEL) return 'Strider';
  if (safeSteps >= 1 * STEPS_PER_LEVEL) return 'Mover';
  return 'Starter';
}

/**
 * Normalizes raw level string to canonical SabiLevel.
 */
export function normalizeSabiLevel(raw?: string | null): SabiLevel {
  if (!raw) return 'Starter';
  const val = raw.trim();
  if (val === 'Mover') return 'Mover';
  if (val === 'Strider') return 'Strider';
  if (val === 'Champion' || val === 'Champ') return 'Champion';
  if (val === 'Legend' || val === 'Apex') return 'Legend';
  return 'Starter';
}

/**
 * Determines authoritative SabiLevel for a user, taking the higher of
 * stored profile level and calculated level from lifetime steps.
 */
export function determineUserSabiLevel(storedLevel?: string | null, steps?: number): SabiLevel {
  const normalizedStored = normalizeSabiLevel(storedLevel);
  const calculated = resolveLevelFromSteps(steps || 0);
  return LEVEL_RANK[calculated] > LEVEL_RANK[normalizedStored] ? calculated : normalizedStored;
}

/**
 * Retrieve user points balance and Sabi Level.
 */
export const getPointsBalance = async (userId: string, token?: string) => {
  const client = token ? getUserSupabase(token) : supabase;

  const { data: profile, error } = await client
    .from('profiles')
    .select('points_balance, sabi_level, steps_count')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw { status: 500, error: 'server_error', message: 'Failed to retrieve points balance' };
  }

  const balance = Number(profile?.points_balance || 0);
  const sabiLevel = determineUserSabiLevel(profile?.sabi_level, profile?.steps_count);

  return {
    balance,
    pointsBalance: balance, // for backward compatibility
    sabiLevel,
  };
};

/**
 * Retrieve paginated points transaction history.
 */
export const getPointsHistory = async (userId: string, page = 0, size = 20, token?: string) => {
  const client = token ? getUserSupabase(token) : supabase;
  const safePage = Math.max(0, page);
  const safeSize = Math.min(100, Math.max(1, size));
  const offset = safePage * safeSize;

  const { data, error } = await client
    .from('points_transactions')
    .select('id, amount, source, description, created_at, reference_id, meta')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + safeSize - 1);

  if (error) {
    // If table doesn't exist yet in the database, return empty list gracefully
    console.warn('[pointsService] Failed to query points_transactions:', error.message);
    return {
      page: safePage,
      size: safeSize,
      data: [] as LedgerTransaction[],
    };
  }

  const mapped: LedgerTransaction[] = (data || []).map((row: any) => ({
    id: String(row.id),
    amount: Number(row.amount || 0),
    source: String(row.source || 'points_adjustment'),
    description: String(row.description || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    reference_id: row.reference_id ? String(row.reference_id) : null,
    meta: row.meta || null,
  }));

  return {
    page: safePage,
    size: safeSize,
    data: mapped,
  };
};

/**
 * Atomically record a points transaction and update profiles.points_balance.
 * amount > 0: Coins earned
 * amount < 0: Coins spent (validates sufficient balance)
 */
export const recordPointsTransaction = async (
  userId: string,
  amount: number,
  source: string,
  description: string,
  referenceId?: string | null,
  meta?: Record<string, unknown> | null
) => {
  const integerAmount = Math.round(amount);
  if (integerAmount === 0) {
    return { ok: true, balance: 0 };
  }

  // 1. Fetch current balance
  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('points_balance')
    .eq('id', userId)
    .maybeSingle();

  if (readErr || !profile) {
    throw new Error('user_not_found');
  }

  const currentBalance = Number(profile.points_balance || 0);

  // If deducting points, verify sufficient balance
  if (integerAmount < 0 && currentBalance < Math.abs(integerAmount)) {
    throw new Error('insufficient_balance');
  }

  const nextBalance = currentBalance + integerAmount;

  // 2. Insert into points_transactions
  const { data: tx, error: txErr } = await supabase
    .from('points_transactions')
    .insert({
      user_id: userId,
      amount: integerAmount,
      source,
      description,
      reference_id: referenceId || null,
      meta: meta || null,
    })
    .select('id, amount, source, description, created_at')
    .maybeSingle();

  if (txErr) {
    if (txErr.code === '23505') {
      // Unique violation on reference_id (duplicate request)
      return { ok: false, reason: 'already_processed', balance: currentBalance };
    }
    throw txErr;
  }

  // 3. Update profiles.points_balance
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ points_balance: nextBalance })
    .eq('id', userId);

  if (updateErr) {
    // Attempt rollback of transaction record
    if (tx?.id) {
      await supabase.from('points_transactions').delete().eq('id', tx.id);
    }
    throw updateErr;
  }

  return {
    ok: true,
    transaction: tx,
    balance: nextBalance,
  };
};
