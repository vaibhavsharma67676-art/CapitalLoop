import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import type { Server, Socket } from 'socket.io';
import type { GameController } from '../game/gameController';
import type { RoomManager } from '../rooms/roomManager';
import type { SlidingWindowRateLimiter } from '../security/rateLimiter';
import {
  authEnvelopeSchema,
  createRoomSchema,
  joinRoomSchema,
  kickPlayerSchema,
  setReadySchema,
  toggleLockSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '../security/validators';

export function getSocketClientIp(socket: Socket, trustProxy = 0): string {
  if (trustProxy > 0) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    if (typeof raw === 'string' && raw.length > 0) {
      const hops = raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (hops.length > 0) {
        const index = Math.max(0, hops.length - trustProxy);
        return hops[index] || socket.handshake.address || 'unknown';
      }
    }
  }
  return socket.handshake.address || 'unknown';
}

export function registerRoomSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  gameController: GameController,
  joinRateLimiter: SlidingWindowRateLimiter,
  eventRateLimiter: SlidingWindowRateLimiter,
  trustProxy = 0,
): void {
  const clientIp = getSocketClientIp(socket, trustProxy);

  socket.on('room:create', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!joinRateLimiter.consume(`create:${clientIp}`).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many room creation attempts. Wait a moment.' });
      return;
    }

    const parsed = createRoomSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
      return;
    }

    const result = roomManager.createPrivateRoom({
      nickname: parsed.data.nickname,
      clientIp,
      socketId: socket.id,
      preferredColor: parsed.data.preferredColor,
      preferredToken: parsed.data.preferredToken,
    });

    if (!result.ok) {
      ack(result);
      return;
    }

    void socket.join(result.data.credentials.roomCode);
    ack({
      ok: true,
      data: {
        credentials: result.data.credentials,
        room: result.data.snapshot,
      },
    });
  });

  socket.on('room:join', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!joinRateLimiter.consume(`join:${clientIp}`).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many join attempts. Please wait a moment.' });
      return;
    }

    const parsed = joinRoomSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: parsed.error.issues[0]?.message ?? 'Invalid room code or nickname.' });
      return;
    }

    const result = roomManager.joinPrivateRoom({
      roomCode: parsed.data.roomCode,
      nickname: parsed.data.nickname,
      clientIp,
      socketId: socket.id,
      preferredColor: parsed.data.preferredColor,
      preferredToken: parsed.data.preferredToken,
    });

    if (!result.ok) {
      ack(result);
      return;
    }

    const code = result.data.credentials.roomCode;
    void socket.join(code);
    io.to(code).emit('room:state', result.data.snapshot);
    ack({
      ok: true,
      data: {
        credentials: result.data.credentials,
        room: result.data.snapshot,
      },
    });
  });

  socket.on('room:reconnect', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!joinRateLimiter.consume(`reconnect:${clientIp}`).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Too many reconnect attempts.' });
      return;
    }

    const parsed = authEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid session credentials.' });
      return;
    }

    const result = roomManager.reconnectSeat({
      roomCode: parsed.data.roomCode,
      playerId: parsed.data.playerId,
      sessionToken: parsed.data.sessionToken,
      socketId: socket.id,
    });

    if (!result.ok) {
      ack(result);
      return;
    }

    if (result.data.previousSocketId && result.data.previousSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(result.data.previousSocketId);
      if (oldSocket) {
        void oldSocket.leave(parsed.data.roomCode);
      }
    }

    void socket.join(parsed.data.roomCode);
    io.to(parsed.data.roomCode).emit('room:state', result.data.snapshot);
    gameController.syncTimersForRoom(parsed.data.roomCode);
    ack({ ok: true, data: { room: result.data.snapshot } });
  });

  socket.on('room:leave', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    const parsed = authEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid leave payload.' });
      return;
    }

    const result = roomManager.leaveRoom(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
    );
    if (!result.ok) {
      ack(result);
      return;
    }

    void socket.leave(parsed.data.roomCode);
    if (result.data.snapshot) {
      io.to(parsed.data.roomCode).emit('room:state', result.data.snapshot);
    }
    ack({ ok: true, data: { left: true } });
  });

  socket.on('room:setReady', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Slow down.' });
      return;
    }

    const parsed = setReadySchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid ready payload.' });
      return;
    }

    const result = roomManager.setPlayerReady(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      parsed.data.isReady,
    );
    if (!result.ok) {
      ack(result);
      return;
    }

    io.to(parsed.data.roomCode).emit('room:state', result.data);
    ack({ ok: true, data: { isReady: parsed.data.isReady } });
  });

  socket.on('room:updateProfile', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Slow down.' });
      return;
    }

    const parsed = updateProfileSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: parsed.error.issues[0]?.message ?? 'Invalid profile update.' });
      return;
    }

    const result = roomManager.updatePlayerProfile(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      { color: parsed.data.color, tokenShape: parsed.data.tokenShape },
    );
    if (!result.ok) {
      ack(result);
      return;
    }

    io.to(parsed.data.roomCode).emit('room:state', result.data);
    ack({ ok: true, data: { updated: true } });
  });

  socket.on('room:updateSettings', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Slow down.' });
      return;
    }

    const parsed = updateSettingsSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: parsed.error.issues[0]?.message ?? 'Invalid settings.' });
      return;
    }

    const result = roomManager.updateRoomSettings(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      parsed.data.settings,
    );
    if (!result.ok) {
      ack(result);
      return;
    }

    io.to(parsed.data.roomCode).emit('room:state', result.data);
    ack({ ok: true, data: { updated: true } });
  });

  socket.on('room:toggleLock', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Slow down.' });
      return;
    }

    const parsed = toggleLockSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid lock request.' });
      return;
    }

    const result = roomManager.toggleRoomLock(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      parsed.data.isLocked,
    );
    if (!result.ok) {
      ack(result);
      return;
    }

    io.to(parsed.data.roomCode).emit('room:state', result.data);
    ack({ ok: true, data: { isLocked: parsed.data.isLocked } });
  });

  socket.on('room:kickPlayer', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Slow down.' });
      return;
    }

    const parsed = kickPlayerSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid kick request.' });
      return;
    }

    const result = roomManager.kickPlayer(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
      parsed.data.targetPlayerId,
    );
    if (!result.ok) {
      ack(result);
      return;
    }

    if (result.data.kickedSocketId) {
      const targetSocket = io.sockets.sockets.get(result.data.kickedSocketId);
      if (targetSocket) {
        targetSocket.emit('room:kicked', {
          roomCode: parsed.data.roomCode,
          reason: 'You were removed from the private room by the host.',
        });
        void targetSocket.leave(parsed.data.roomCode);
      }
    }

    io.to(parsed.data.roomCode).emit('room:state', result.data.snapshot);
    ack({ ok: true, data: { kicked: true } });
  });

  socket.on('room:startGame', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!eventRateLimiter.consume(socket.id).allowed) {
      ack({ ok: false, code: 'RATE_LIMITED', error: 'Slow down.' });
      return;
    }

    const parsed = authEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid start request.' });
      return;
    }

    const result = gameController.startGame(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
    );
    ack(result);
  });

  socket.on('room:returnToLobby', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    const parsed = authEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: 'VALIDATION_ERROR', error: 'Invalid rematch request.' });
      return;
    }

    const result = gameController.handleReturnToLobby(
      parsed.data.roomCode,
      parsed.data.playerId,
      parsed.data.sessionToken,
    );
    ack(result);
  });
}
