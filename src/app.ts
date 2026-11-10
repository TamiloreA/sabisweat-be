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
import streaksRoutes from './routes/streaksRoutes';
import challengeRoutes from './routes/challengeRoutes';
import versionRoutes from './routes/versionRoutes';
import achievementRoutes from './routes/achievementRoutes';
import emailNotificationRoutes from './routes/emailNotificationRoutes';
import notificationRoutes from './routes/notificationRoutes';
import adminPushRoutes from './routes/adminPushRoutes';
import searchRoutes from './routes/searchRoutes';
import supportRoutes from './routes/supportRoutes';
import userRoutes from './routes/userRoutes';
import weeklyReportRoutes from './routes/weeklyReportRoutes';
import rewardRoutes from './routes/rewardRoutes';
import partnerRoutes from './routes/partnerRoutes';
import partnerPortalRoutes from './routes/partnerPortalRoutes';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';

dotenv.config();

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for base64 avatar uploads
app.use(express.urlencoded({ extended: true }));

// Trust proxy to fix express-rate-limit warnings on Render
app.set('trust proxy', 1);

// Global rate limiter
app.use('/api/v1', apiRateLimiter);

setupSwagger(app);

// Routes
app.use('/api/v1/examples', exampleRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/health', healthRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/home', homeRoutes);
app.use('/api/v1/home', homeRoutes);
app.use('/points', pointsRoutes);
app.use('/api/v1/points', pointsRoutes);

// Push — mounted both at root and /api/v1
app.use('/push', pushRoutes);
app.use('/api/v1/push', pushRoutes);

// In-App Notifications — mounted both at root and /api/v1
app.use('/notifications', notificationRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Email Notifications — mounted both at root and /api/v1
app.use('/email-notifications', emailNotificationRoutes);
app.use('/api/v1/email-notifications', emailNotificationRoutes);

// Admin Push / Testing / Cron
app.use('/admin/push', adminPushRoutes);
app.use('/api/v1/admin/push', adminPushRoutes);

// Community — also at root to match the mobile app's existing paths
app.use('/community', communityRoutes);
app.use('/api/v1/community', communityRoutes);

// News — also at root to match the mobile app's existing paths
app.use('/news', newsRoutes);
app.use('/api/v1/news', newsRoutes);

// Streaks — also at root to match the mobile app's existing paths
app.use('/streaks', streaksRoutes);
app.use('/api/v1/streaks', streaksRoutes);

// Challenges — also at root to match the mobile app's existing paths
app.use('/challenges', challengeRoutes);
app.use('/api/v1/challenges', challengeRoutes);

// App Version — public endpoint mounted both at root and /api/v1
app.use('/app-version', versionRoutes);
app.use('/api/v1/app-version', versionRoutes);

// Achievements — mounted both at root and /api/v1
app.use('/achievements', achievementRoutes);
app.use('/api/v1/achievements', achievementRoutes);

// Search — mounted at root, /v1, and /api/v1
app.use('/search', searchRoutes);
app.use('/v1/search', searchRoutes);
app.use('/api/v1/search', searchRoutes);

// Support — mounted at root, /v1, and /api/v1
app.use('/support', supportRoutes);
app.use('/v1/support', supportRoutes);
app.use('/api/v1/support', supportRoutes);

// Users — mounted at root, /v1, and /api/v1
app.use('/users', userRoutes);
app.use('/v1/users', userRoutes);
app.use('/api/v1/users', userRoutes);

// Weekly Report — mounted at root, /v1, and /api/v1
app.use('/weekly-report', weeklyReportRoutes);
app.use('/v1/weekly-report', weeklyReportRoutes);
app.use('/api/v1/weekly-report', weeklyReportRoutes);

// Rewards — mounted at root, /v1, and /api/v1
app.use('/rewards', rewardRoutes);
app.use('/v1/rewards', rewardRoutes);
app.use('/api/v1/rewards', rewardRoutes);

// Partners — mounted at root, /v1, and /api/v1
app.use('/partners', partnerRoutes);
app.use('/v1/partners', partnerRoutes);
app.use('/api/v1/partners', partnerRoutes);

// Partner Portal — mounted at root, /v1, and /api/v1
app.use('/partner-portal', partnerPortalRoutes);
app.use('/v1/partner-portal', partnerPortalRoutes);
app.use('/api/v1/partner-portal', partnerPortalRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SabiSweat API is running' });
});

app.use(errorHandler);

export default app;
