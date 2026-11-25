import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as triviaController from '../controllers/triviaController';

const router = Router();

router.use(requireAuth);

// Member endpoints (News tab Weekly Trivia)
router.get('/overview', triviaController.getOverview);
router.get('/leaderboard', triviaController.getLeaderboard);
router.get('/rounds/:id', triviaController.getRoundDetail);
router.put('/rounds/:id/draft', triviaController.saveDraft);
router.post('/rounds/:id/submit', triviaController.submitAnswers);
router.patch('/rounds/:id/notify', triviaController.toggleNotify);
router.get('/rounds/:id/results', triviaController.getResults);

// Admin portal endpoints (upload & manage weekly trivia rounds)
router.post('/admin/rounds', triviaController.createAdminRound);
router.get('/admin/rounds', triviaController.listAdminRounds);
router.patch('/admin/rounds/:id', triviaController.updateAdminRound);
router.delete('/admin/rounds/:id', triviaController.deleteAdminRound);

export default router;
