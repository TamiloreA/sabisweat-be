import { Router } from 'express';
import * as homeController from '../controllers/homeController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/summary', homeController.getHomeSummary);

export default router;
