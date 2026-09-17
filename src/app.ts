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

// Streaks — also at root to match the mobile app's existing paths
app.use('/streaks', streaksRoutes);
app.use('/api/v1/streaks', streaksRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SabiSweat API is running' });
});

// TEMP DEBUG: runs the exact feed queries and returns raw results.
// Remove after the Render author issue is resolved.
app.get('/debug/feed-raw', async (req, res) => {
  try {
    const { supabase } = await import('./config/database');

    const { data: posts, error: postsError } = await supabase
      .from('community_posts')
      .select('id, author_id, title')
      .order('created_at', { ascending: false })
      .range(0, 2);

    const authorIds = [...new Set((posts ?? []).map((p) => p.author_id).filter(Boolean))];

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, first_name, avatar_id')
      .in('id', authorIds);

    res.status(200).json({
      postsError: postsError?.message ?? null,
      profilesError: profilesError?.message ?? null,
      authorIds,
      profilesReturned: (profiles ?? []).map((p) => p.id),
      profiles,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.use(errorHandler);

export default app;
