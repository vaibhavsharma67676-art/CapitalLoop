import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import type { Server } from 'socket.io';
import type { ServerConfig } from '../config';
import type { GameController } from '../game/gameController';
import type { MatchmakingManager } from '../rooms/matchmakingManager';
import type { RoomManager } from '../rooms/roomManager';
import { SlidingWindowRateLimiter } from '../security/rateLimiter';
import type { DiscordService } from '../services/discordService';
import type { Logger } from '../services/logger';
import { registerChatSocketHandlers } from './chatSocketHandlers';
import { registerGameSocketHandlers } from './gameSocketHandlers';
import { registerMatchmakingSocketHandlers } from './matchmakingSocketHandlers';
import { registerRoomSocketHandlers } from './roomSocketHandlers';

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  matchmakingManager: MatchmakingManager,
  gameController: GameController,
  config: ServerConfig,
  logger: Logger,
  discordService?: DiscordService,
): () => void {
  const joinRateLimiter = new SlidingWindowRateLimiter(20, 60_000);
  const eventRateLimiter = new SlidingWindowRateLimiter(
    config.socketMaxEventsPerWindow,
    config.socketWindowMs,
  );
  const chatRateLimiter = new SlidingWindowRateLimiter(10, 10_000);

  const pruneInterval = setInterval(() => {
    joinRateLimiter.prune();
    eventRateLimiter.prune();
    chatRateLimiter.prune();
  }, 60_000);
  pruneInterval.unref();

  roomManager.setHooks({
    onRoomUpdated: (roomCode, snapshot) => {
      io.to(roomCode).emit('room:state', snapshot);
    },
  });

  io.on('connection', (socket) => {
    logger.debug('Socket connected', { socketId: socket.id });

    registerRoomSocketHandlers(
      io,
      socket,
      roomManager,
      gameController,
      joinRateLimiter,
      eventRateLimiter,
      config.trustProxy,
      matchmakingManager,
      discordService,
    );
    registerMatchmakingSocketHandlers(
      io,
      socket,
      roomManager,
      matchmakingManager,
      gameController,
      joinRateLimiter,
      config.trustProxy,
      discordService,
    );
    registerGameSocketHandlers(socket, gameController, eventRateLimiter);
    registerChatSocketHandlers(io, socket, roomManager, chatRateLimiter);

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { socketId: socket.id, reason });

      const cancelled = matchmakingManager.cancel(socket.id);
      if (cancelled.updatedStatus) {
        for (const sid of cancelled.affectedSocketIds) {
          io.sockets.sockets.get(sid)?.emit('matchmaking:status', cancelled.updatedStatus);
        }
      }

      const result = roomManager.handleSocketDisconnect(socket.id);
      if (result) {
        io.to(result.roomCode).emit('room:state', result.snapshot);
      }
    });
  });

  return () => {
    clearInterval(pruneInterval);
  };
}
