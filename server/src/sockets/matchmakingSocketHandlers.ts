import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import type { Server, Socket } from 'socket.io';
import type { GameController } from '../game/gameController';
import type { MatchmakingManager } from '../rooms/matchmakingManager';
import type { RoomManager } from '../rooms/roomManager';
import type { SlidingWindowRateLimiter } from '../security/rateLimiter';
import { matchmakingJoinSchema } from '../security/validators';
import type { DiscordService } from '../services/discordService';
import { getSocketClientIp } from './roomSocketHandlers';

export function registerMatchmakingSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  matchmakingManager: MatchmakingManager,
  gameController: GameController,
  joinRateLimiter: SlidingWindowRateLimiter,
  trustProxy = 0,
  discordService?: DiscordService,
): void {
  const clientIp = getSocketClientIp(socket, trustProxy);

  socket.on('matchmaking:join', (rawPayload, ack) => {
    if (typeof ack !== 'function') return;
    if (!joinRateLimiter.consume(`mm:${clientIp}`).allowed) {
      ack({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many matchmaking requests. Please wait a moment.',
      });
      return;
    }

    const parsed = matchmakingJoinSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({
        ok: false,
        code: 'VALIDATION_ERROR',
        error: parsed.error.issues[0]?.message ?? 'Invalid matchmaking preferences.',
      });
      return;
    }

    const outcome = matchmakingManager.enqueue({
      socketId: socket.id,
      clientIp,
      prefs: parsed.data,
    });

    if (!outcome.ok) {
      ack(outcome);
      return;
    }

    if (!outcome.matched) {
      for (const sid of outcome.bucketSocketIds) {
        const peerSocket = io.sockets.sockets.get(sid);
        if (peerSocket) {
          peerSocket.emit('matchmaking:status', outcome.status);
        }
      }
      ack({ ok: true, data: outcome.status });
      return;
    }

    // Match formed: join all matched sockets into the isolated Quick Match room and auto-start
    const { roomCode, assignments } = outcome.match;
    for (const assignment of assignments) {
      const peerSocket = io.sockets.sockets.get(assignment.socketId);
      if (peerSocket) {
        void peerSocket.join(roomCode);
      }
    }

    const started = gameController.startMatchedGame(roomCode);
    const record = roomManager.getRoomRecord(roomCode);
    if (!started.ok || !record) {
      ack({
        ok: false,
        code: 'MATCH_START_FAILED',
        error: 'Failed to launch Quick Match. Please try again.',
      });
      return;
    }

    const snapshot = roomManager.toSnapshot(record);
    const hostName = record.players[0]?.nickname ?? 'Player';
    discordService?.notifyRoomCreated(hostName, 'PUBLIC_MATCH');

    for (const assignment of assignments) {
      const peerSocket = io.sockets.sockets.get(assignment.socketId);
      if (peerSocket) {
        peerSocket.emit('matchmaking:matched', {
          credentials: assignment.credentials,
          room: snapshot,
        });
      }
    }

    ack({
      ok: true,
      data: {
        status: 'MATCHED',
        queueSize: assignments.length,
        targetPlayers: parsed.data.targetPlayers,
        waitedSeconds: 0,
        mapId: parsed.data.mapId,
        gameSpeed: parsed.data.gameSpeed,
      },
    });
  });

  socket.on('matchmaking:cancel', (ack) => {
    const cancelled = matchmakingManager.cancel(socket.id);
    if (cancelled.updatedStatus) {
      for (const sid of cancelled.affectedSocketIds) {
        const peerSocket = io.sockets.sockets.get(sid);
        if (peerSocket) {
          peerSocket.emit('matchmaking:status', cancelled.updatedStatus);
        }
      }
    }
    if (typeof ack === 'function') {
      ack({ ok: true, data: { cancelled: true } });
    }
  });
}
