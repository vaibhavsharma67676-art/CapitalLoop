import type { LogLevel } from '../config';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel = 'info', silent = false): Logger {
  const minPriority = LEVEL_PRIORITY[minLevel];

  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (silent || LEVEL_PRIORITY[level] < minPriority) {
      return;
    }
    const payload = {
      time: new Date().toISOString(),
      level,
      msg: message,
      ...(meta ? { meta } : {}),
    };
    const serialized = JSON.stringify(payload);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  return {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
  };
}