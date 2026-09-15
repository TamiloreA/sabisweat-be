import { Router } from 'express';
import * as pointsController from '../controllers/pointsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/balance', pointsController.getPointsBalance);

export default router;
