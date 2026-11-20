import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../rooms/roomManager';
import type { SlidingWindowRateLimiter } from '../security/rateLimiter';
import { chatSendSchema } from '../security/validators';

export function registerChatSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  chatRateLimiter: SlidingWindowRateLimiter,
): void {
  socket.on('chat:send', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;

    if (!chatRateLimiter.consume(`chat:${socket.id}`).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'You are sending chat messages too quickly.' });
      return;
    }

    const parsed = chatSendSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({
        ok: false,
        code: 'VALIDATION_ERROR',
        error: parsed.error.issues[0]?.message ?? 'Invalid chat message.',
      });
      return;
    }

    const result = roomManager.addChatMessage(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      parsed.data.text,
    );

    if (!result.ok) {
      ack(result);
      return;
    }

    io.to(parsed.data.roomCode).emit('chat:message', result.data);
    ack({ ok: true, data: { messageId: result.data.id } });
  });
}