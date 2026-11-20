import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ServerConfig {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  clientOrigin: string;
  trustProxy: number;
  dataDir: string;
  enablePersistence: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxHttpRequests: number;
  socketMaxEventsPerWindow: number;
  socketWindowMs: number;
  lobbyDisconnectTtlMs: number;
  hostMigrationTtlMs: number;
  idleLobbyTtlMs: number;
  idleGameTtlMs: number;
  finishedRoomTtlMs: number;
  logLevel: LogLevel;
  clientDistPath: string;
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

export function loadServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const envRaw = process.env.NODE_ENV;
  const nodeEnv: ServerConfig['nodeEnv'] =
    envRaw === 'production' || envRaw === 'test' ? envRaw : 'development';

  const base: ServerConfig = {
    nodeEnv,
    host: process.env.HOST ?? '0.0.0.0',
    port: parseIntEnv('PORT', 4000),
    clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    trustProxy: parseIntEnv('TRUST_PROXY', 0),
    dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? './data'),
    enablePersistence: nodeEnv !== 'test',
    rateLimitWindowMs: parseIntEnv('RATE_LIMIT_WINDOW_MS', 60_000),
    rateLimitMaxHttpRequests: parseIntEnv('RATE_LIMIT_MAX_HTTP_REQUESTS', 120),
    socketMaxEventsPerWindow: parseIntEnv('SOCKET_MAX_EVENTS_PER_WINDOW', 60),
    socketWindowMs: parseIntEnv('SOCKET_WINDOW_MS', 10_000),
    lobbyDisconnectTtlMs: parseIntEnv('LOBBY_DISCONNECT_TTL_MS', 120_000),
    hostMigrationTtlMs: parseIntEnv('HOST_MIGRATION_TTL_MS', 90_000),
    idleLobbyTtlMs: parseIntEnv('IDLE_LOBBY_TTL_MS', 7_200_000),
    idleGameTtlMs: parseIntEnv('IDLE_GAME_TTL_MS', 43_200_000),
    finishedRoomTtlMs: parseIntEnv('FINISHED_ROOM_TTL_MS', 1_800_000),
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    clientDistPath: path.resolve(__dirname, '../../client/dist'),
  };

  return { ...base, ...overrides };
}