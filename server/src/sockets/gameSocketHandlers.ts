import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import type { Socket } from 'socket.io';
import type { GameController } from '../game/gameController';
import type { SlidingWindowRateLimiter } from '../security/rateLimiter';
import { gameActionEnvelopeSchema } from '../security/validators';

export function registerGameSocketHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  gameController: GameController,
  eventRateLimiter: SlidingWindowRateLimiter,
): void {
  socket.on('game:action', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;

    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many game actions. Please slow down.' });
      return;
    }

    const parsed = gameActionEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({
        ok: false,
        code: 'VALIDATION_ERROR',
        error: parsed.error.issues[0]?.message ?? 'Invalid game action payload.',
      });
      return;
    }

    const result = gameController.handleAction(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      parsed.data.action,
    );
    ack(result);
  });
}