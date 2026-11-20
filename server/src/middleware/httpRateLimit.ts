import type { NextFunction, Request, Response } from 'express';
import { SlidingWindowRateLimiter } from '../security/rateLimiter';

export function createHttpRateLimitMiddleware(maxRequests: number, windowMs: number) {
  const limiter = new SlidingWindowRateLimiter(maxRequests, windowMs);

  const pruneTimer = setInterval(() => limiter.prune(), windowMs);
  pruneTimer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const verdict = limiter.consume(ip);

    res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    if (!verdict.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)));
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }

    next();
  };
}