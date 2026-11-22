import { createCapitalLoopServer } from './app';
import { loadServerConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const instance = createCapitalLoopServer(config);
  let shuttingDown = false;

  await instance.init();

  instance.httpServer.listen(config.port, config.host, () => {
    instance.logger.info('CAPITALLOOP multiplayer server listening', {
      host: config.host,
      port: config.port,
      env: config.nodeEnv,
      clientOrigin: config.clientOrigin,
      matchmakingEnabled: config.matchmakingEnabled,
      discordOAuthEnabled: instance.discordService.isOAuthConfigured(),
    });
  });

  const gracefulShutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    instance.logger.info('Shutting down server...', { signal });
    try {
      await instance.close();
      process.exit(exitCode);
    } catch (err) {
      instance.logger.error('Error during shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT', 0));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM', 0));

  process.on('unhandledRejection', (reason) => {
    instance.logger.error('Unhandled Promise Rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on('uncaughtException', (err) => {
    instance.logger.error('Uncaught Exception — initiating graceful shutdown', {
      error: err.message,
    });
    void gracefulShutdown('uncaughtException', 1);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
