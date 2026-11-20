import { createCapitalLoopServer } from './app';
import { loadServerConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const instance = createCapitalLoopServer(config);

  await instance.init();

  instance.httpServer.listen(config.port, config.host, () => {
    instance.logger.info('CapitalLoop private multiplayer server listening', {
      host: config.host,
      port: config.port,
      env: config.nodeEnv,
      clientOrigin: config.clientOrigin,
    });
  });

  const gracefulShutdown = async (signal: string) => {
    instance.logger.info('Shutting down server...', { signal });
    try {
      await instance.close();
      process.exit(0);
    } catch (err) {
      instance.logger.error('Error during shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});