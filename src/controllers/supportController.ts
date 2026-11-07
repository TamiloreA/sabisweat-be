/**
 * Support Controller
 *
 * Handles HTTP requests for Help & Support: FAQs and account deletion.
 */

import { Request, Response } from 'express';
import { getPublishedFAQs, requestAccountDeletion } from '../services/supportService';

/**
 * GET /support/faqs
 * Returns published FAQs ordered by order in ascending order.
 */
export async function getFaqs(_req: Request, res: Response): Promise<void> {
  try {
    const faqs = await getPublishedFAQs();
    res.status(200).json(faqs);
  } catch (err: any) {
    console.error('Error fetching FAQs:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch FAQs.',
    });
  }
}

/**
 * POST /support/account/delete-request
 * Submits an account deletion request for the authenticated user.
 */
export async function deleteAccountRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;
    const result = await requestAccountDeletion(userId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('Error requesting account deletion:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to submit account deletion request.',
    });
  }
}
