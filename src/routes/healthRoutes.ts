import { Router } from 'express';
import * as healthController from '../controllers/healthController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.post('/sync', healthController.syncStepData);
router.post('/sync/batch', healthController.syncStepDataBatch);
router.get('/history', healthController.getHealthHistory);
router.get('/history/all', healthController.getHealthHistoryAll);
router.patch('/step-goal', healthController.updateStepGoal);
router.get('/today', healthController.getTodaySteps);

export default router;
