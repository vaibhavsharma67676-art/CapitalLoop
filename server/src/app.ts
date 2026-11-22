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
import { MatchmakingManager } from './rooms/matchmakingManager';
import { RoomManager } from './rooms/roomManager';
import { roomCodeSchema } from './security/validators';
import { DiscordService } from './services/discordService';
import { createLogger, type Logger } from './services/logger';
import { FilePersistenceService } from './services/persistenceService';
import { registerSocketHandlers } from './sockets/registerHandlers';

const DISCORD_COOKIE_NAME = 'cl_discord';

function parseCookies(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) return {};
  const result: Record<string, string> = {};
  for (const part of headerValue.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export interface CapitalLoopServerInstance {
  app: Express;
  httpServer: http.Server;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  roomManager: RoomManager;
  matchmakingManager: MatchmakingManager;
  gameController: GameController;
  discordService: DiscordService;
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

  const allowedOrigins = config.clientOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const primaryClientOrigin =
    allowedOrigins.find((o) => o !== '*') ?? '/';

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'],
          connectSrc: ["'self'", 'ws:', 'wss:', ...allowedOrigins.filter((o) => o !== '*')],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

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
  const matchmakingManager = new MatchmakingManager(roomManager, config.matchmakingEnabled);
  const discordService = new DiscordService(config, logger);

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

  const gameController = new GameController(io, roomManager, logger, discordService);
  const stopSocketIntervals = registerSocketHandlers(
    io,
    roomManager,
    matchmakingManager,
    gameController,
    config,
    logger,
    discordService,
  );

  // Health probe for Railway / reverse proxy / Docker
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'capitalloop-server',
      mode: 'private-rooms-only',
      features: {
        privateRooms: true,
        bots: true,
        quickMatch: config.matchmakingEnabled,
        discordOAuth: discordService.isOAuthConfigured(),
        discordCommunity: Boolean(discordService.getSafeInviteUrl()),
      },
      timestamp: Date.now(),
    });
  });

  // Safe public client configuration (never leaks secrets, webhooks, or private rooms)
  app.get('/api/public-config', (_req, res) => {
    res.json({
      ok: true,
      matchmakingEnabled: config.matchmakingEnabled,
      discord: discordService.getPublicConfig(),
    });
  });

  // Optional Discord OAuth2 Authentication Routes (strictly server-side secret handling)
  app.get('/api/auth/discord/login', (_req, res) => {
    const authUrl = discordService.createAuthorizationUrl();
    if (!authUrl) {
      res.status(503).json({
        ok: false,
        code: 'DISCORD_NOT_CONFIGURED',
        error: 'Discord login is not configured on this server.',
      });
      return;
    }
    res.redirect(authUrl);
  });

  app.get('/api/auth/discord/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code || !state || !discordService.consumeOAuthState(state)) {
      res.redirect(`${primaryClientOrigin}${primaryClientOrigin.includes('?') ? '&' : '?'}discord=error`);
      return;
    }

    const profile = await discordService.exchangeCodeForProfile(code);
    if (!profile) {
      res.redirect(`${primaryClientOrigin}${primaryClientOrigin.includes('?') ? '&' : '?'}discord=error`);
      return;
    }

    const token = discordService.signSessionToken(profile);
    const cookieParts = [
      `${DISCORD_COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=604800',
    ];
    if (config.nodeEnv === 'production') {
      cookieParts.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    res.redirect(`${primaryClientOrigin}${primaryClientOrigin.includes('?') ? '&' : '?'}discord=connected`);
  });

  app.get('/api/auth/discord/me', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = discordService.verifySessionToken(cookies[DISCORD_COOKIE_NAME]);
    res.json({ ok: true, user });
  });

  app.post('/api/auth/discord/logout', (_req, res) => {
    const cookieParts = [
      `${DISCORD_COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
    ];
    if (config.nodeEnv === 'production') {
      cookieParts.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    res.json({ ok: true });
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

  // Explicit 404 for any other /api route (guarantees /api/rooms & /api/matchmaking stay blocked)
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
    matchmakingManager,
    gameController,
    discordService,
    logger,
    init: async () => {
      await roomManager.init();
    },
    close: async () => {
      stopSocketIntervals();
      matchmakingManager.clearAll();
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
