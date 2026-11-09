import app from './app';
import { runAllCronTasks } from './services/notificationCronService';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);

  // Background worker for scheduled notifications and local-time business events
  if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_NOTIFICATION_CRON !== 'true') {
    setInterval(async () => {
      try {
        await runAllCronTasks();
      } catch (err) {
        console.warn('[cronRunner] Background notification cycle error:', err);
      }
    }, 60 * 1000);
  }
});
