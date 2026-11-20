import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../services/logger';

export function createErrorHandler(logger: Logger, isProduction: boolean) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('Unhandled HTTP error', {
      method: req.method,
      path: req.path,
      error: message,
    });

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      error: isProduction ? 'Internal server error.' : message,
    });
  };
}