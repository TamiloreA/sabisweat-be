import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { setupSwagger } from './config/swagger';
import exampleRoutes from './routes/exampleRoutes';
import authRoutes from './routes/authRoutes';
import onboardingRoutes from './routes/onboardingRoutes';
import healthRoutes from './routes/healthRoutes';
import homeRoutes from './routes/homeRoutes';
import pointsRoutes from './routes/pointsRoutes';
import pushRoutes from './routes/pushRoutes';
import communityRoutes from './routes/communityRoutes';
import newsRoutes from './routes/newsRoutes';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';

dotenv.config();

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for base64 avatar uploads
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use('/api/v1', apiRateLimiter);

setupSwagger(app);

// Routes
app.use('/api/v1/examples', exampleRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/home', homeRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/push', pushRoutes);

// Community — also at root to match the mobile app's existing paths
app.use('/community', communityRoutes);
app.use('/api/v1/community', communityRoutes);

// News — also at root to match the mobile app's existing paths
app.use('/news', newsRoutes);
app.use('/api/v1/news', newsRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SabiSweat API is running' });
});

app.use(errorHandler);

export default app;
