import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', requireAuth, (req: Request, res: Response) => {
  // Acknowledge the push token registration
  // We can add actual DB saving logic here later
  res.status(200).json({ success: true, message: 'Push token registered successfully' });
});

export default router;
