import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import type { Server } from 'socket.io';
import type { ServerConfig } from '../config';
import type { GameController } from '../game/gameController';
import type { RoomManager } from '../rooms/roomManager';
import { SlidingWindowRateLimiter } from '../security/rateLimiter';
import type { Logger } from '../services/logger';
import { registerChatSocketHandlers } from './chatSocketHandlers';
import { registerGameSocketHandlers } from './gameSocketHandlers';
import { registerRoomSocketHandlers } from './roomSocketHandlers';

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  gameController: GameController,
  config: ServerConfig,
  logger: Logger,
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
    );
    registerGameSocketHandlers(socket, gameController, eventRateLimiter);
    registerChatSocketHandlers(io, socket, roomManager, chatRateLimiter);

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { socketId: socket.id, reason });
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