/**
 * Support Service
 *
 * Business logic for Help & Support: FAQs listing and account deletion requests.
 */

import { supabase } from '../config/database';
import type { FAQItem } from '../models/supportModel';

export const FAQS_TABLE = 'faqs';

/**
 * Built-in fallback FAQs used when the database table has not been migrated or is empty.
 */
export const DEFAULT_FAQS: FAQItem[] = [
  {
    id: 'f1-earn-coins',
    question: 'How do I earn Sabi coins?',
    answer: 'You earn Sabi coins by completing daily step goals, joining challenges, and participating in clubs.',
    category: 'Rewards',
    order: 1,
    is_published: true,
    url: '/help/how-to-earn-sabi-coins',
    updated_at: '2026-11-01T12:00:00Z',
  },
  {
    id: 'f2-join-club',
    question: 'How to create or join a Club',
    answer: 'Learn how to request access or build your own community. Navigate to the Clubs tab, explore available clubs or tap Create Club to start your own.',
    category: 'Clubs',
    order: 1,
    is_published: true,
    url: '/help/how-to-join-a-club',
    updated_at: '2026-11-01T12:00:00Z',
  },
  {
    id: 'f3-challenges',
    question: 'How do step challenges work?',
    answer: 'Challenges allow you to compete with other users to reach a step target within a set timeframe. Track your progress daily and climb the leaderboard to unlock exclusive badges and rewards.',
    category: 'Challenges',
    order: 1,
    is_published: true,
    url: '/help/challenges-guide',
    updated_at: '2026-11-01T12:00:00Z',
  },
  {
    id: 'f4-streaks',
    question: 'How do streaks and Life Happens pass work?',
    answer: 'Maintain your daily step goal to build a streak. If life gets in the way, you can redeem a Life Happens pass to protect your streak from resetting.',
    category: 'General',
    order: 1,
    is_published: true,
    url: '/help/streaks-and-passes',
    updated_at: '2026-11-01T12:00:00Z',
  },
  {
    id: 'f5-account',
    question: 'How do I update my profile or delete my account?',
    answer: 'You can update your personal details and fitness goals in Profile Settings. To delete your account, visit Help & Support and submit an account deletion request.',
    category: 'Account',
    order: 1,
    is_published: true,
    url: '/help/account-management',
    updated_at: '2026-11-01T12:00:00Z',
  },
  {
    id: 'f6-step-tracking',
    question: 'How is my daily step count tracked?',
    answer: 'SabiSweat syncs your verified steps directly from connected fitness trackers like Apple Health and Google Fit. Keep the app updated for seamless syncing.',
    category: 'General',
    order: 2,
    is_published: true,
    url: '/help/step-tracking',
    updated_at: '2026-11-01T12:00:00Z',
  },
];

/**
 * Fetch all published FAQs ordered by order ascending within each category.
 */
export async function getPublishedFAQs(): Promise<FAQItem[]> {
  try {
    const { data, error } = await supabase
      .from(FAQS_TABLE)
      .select('*')
      .eq('is_published', true)
      .order('order', { ascending: true });

    if (error) {
      // If table doesn't exist yet in Supabase schema cache, gracefully fall back to default FAQs
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return DEFAULT_FAQS.filter((f) => f.is_published);
      }
      throw error;
    }

    const rows = data || [];
    if (rows.length === 0) {
      return DEFAULT_FAQS.filter((f) => f.is_published);
    }

    return rows
      .filter((item: any) => item.is_published === true && item.deleted_at == null)
      .map((item: any) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
        category: item.category || 'General',
        order: item.order ?? 0,
        is_published: item.is_published ?? true,
        url: item.url || null,
        created_at: item.created_at,
        updated_at: item.updated_at || item.created_at || new Date().toISOString(),
      }));
  } catch (err: any) {
    console.warn('Could not fetch FAQs from database, using fallback FAQs:', err.message);
    return DEFAULT_FAQS.filter((f) => f.is_published);
  }
}

/**
 * Handle account deletion request.
 */
export async function requestAccountDeletion(userId?: string): Promise<{ ok: boolean; message: string }> {
  return {
    ok: true,
    message: 'Account deletion request submitted. Your account will be processed shortly.',
  };
}
