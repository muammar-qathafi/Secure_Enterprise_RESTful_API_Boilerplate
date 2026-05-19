import { env } from './config/env';
import { logger } from './utils/logger.util';
import { connectDatabase, disconnectDatabase } from './config/database';
import { getRedisClient, disconnectRedis } from './config/redis';
import app from './app';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  getRedisClient(); // Eagerly establish Redis connection

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 ${env.APP_NAME} running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`📚 Swagger UI: http://localhost:${env.PORT}/api-docs`);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal} — starting graceful shutdown`);

    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('All connections closed — exiting');
      process.exit(0);
    });

    // Force shutdown if connections don't close within 10 s
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection:', { reason });
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error });
    gracefulShutdown('uncaughtException');
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
