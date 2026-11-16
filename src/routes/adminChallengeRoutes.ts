/**
 * Admin Challenge Routes
 *
 * Router for Admin Web Portal challenge endpoints:
 * - POST /admin/challenges
 * - GET /admin/challenges/overview
 * - GET /admin/challenges/:id
 * - PATCH /admin/challenges/:id
 * - DELETE /admin/challenges/:id
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createAdminChallenge,
  getAdminChallengeOverview,
  getAdminChallengeById,
  updateAdminChallenge,
  deleteAdminChallenge,
} from '../controllers/adminChallengeController';

const router = Router();

router.post('/', requireAuth, createAdminChallenge);
router.get('/overview', requireAuth, getAdminChallengeOverview);
router.get('/:id', requireAuth, getAdminChallengeById);
router.patch('/:id', requireAuth, updateAdminChallenge);
router.delete('/:id', requireAuth, deleteAdminChallenge);

export default router;

