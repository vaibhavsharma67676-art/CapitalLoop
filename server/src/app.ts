import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import type { ServerConfig } from './config';
import { GameController } from './game/gameController';
import { createErrorHandler } from './middleware/errorHandler';
import { createHttpRateLimitMiddleware } from './middleware/httpRateLimit';
import { RoomManager } from './rooms/roomManager';
import { roomCodeSchema } from './security/validators';
import { createLogger, type Logger } from './services/logger';
import { FilePersistenceService } from './services/persistenceService';
import { registerSocketHandlers } from './sockets/registerHandlers';

export interface CapitalLoopServerInstance {
  app: Express;
  httpServer: http.Server;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  roomManager: RoomManager;
  gameController: GameController;
  logger: Logger;
  init: () => Promise<void>;
  close: () => Promise<void>;
}

export function createCapitalLoopServer(config: ServerConfig): CapitalLoopServerInstance {
  const logger = createLogger(config.logLevel, config.nodeEnv === 'test');
  const app = express();

  if (config.trustProxy > 0) {
    app.set('trust proxy', config.trustProxy);
  }

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const allowedOrigins = config.clientOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '64kb' }));
  app.use(
    '/api',
    createHttpRateLimitMiddleware(config.rateLimitMaxHttpRequests, config.rateLimitWindowMs),
  );

  const persistence = new FilePersistenceService(config.dataDir, config.enablePersistence, logger);
  const roomManager = new RoomManager(config, persistence, logger);

  const httpServer = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 128 * 1024,
  });

  const gameController = new GameController(io, roomManager, logger);
  const stopSocketIntervals = registerSocketHandlers(io, roomManager, gameController, config, logger);

  // Health probe for reverse proxy / Docker
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'capitalloop-server',
      mode: 'private-rooms-only',
      timestamp: Date.now(),
    });
  });

  // Strict single-code invite check (NO public room listing or player disclosure)
  app.get('/api/rooms/:roomCode/validate', (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.roomCode);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        exists: false,
        joinable: false,
        reason: 'Invalid 5-character private room code.',
      });
      return;
    }

    const status = roomManager.validateInviteCode(parsed.data);
    res.json({ ok: true, ...status });
  });

  // Explicit 404 for any other /api route (guarantees no discovery endpoints exist)
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Endpoint not found.' });
  });

  // Serve compiled Vite SPA in production
  if (fs.existsSync(config.clientDistPath)) {
    app.use(express.static(config.clientDistPath, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.clientDistPath, 'index.html'));
    });
  }

  app.use(createErrorHandler(logger, config.nodeEnv === 'production'));

  return {
    app,
    httpServer,
    io,
    roomManager,
    gameController,
    logger,
    init: async () => {
      await roomManager.init();
    },
    close: async () => {
      stopSocketIntervals();
      gameController.shutdown();
      await roomManager.shutdown();
      await new Promise<void>((resolve) => {
        io.close(() => {
          if (httpServer.listening) {
            httpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      });
    },
  };
}