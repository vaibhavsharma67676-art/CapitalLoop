import {
  applyGameAction,
  createInitialGameState,
  resolveAuctionTimeout,
  resolveTurnTimeout,
  sanitizeGameState,
  type ClientToServerEvents,
  type GameAction,
  type ServerToClientEvents,
} from '@capitalloop/shared';
import type { Server } from 'socket.io';
import type { RoomManager, RoomOperationResult } from '../rooms/roomManager';
import { createCryptoRng } from '../security/codeGenerator';
import type { Logger } from '../services/logger';
import { GameTimerManager } from './timerManager';

export class GameController {
  private readonly rng = createCryptoRng();
  private readonly timerManager = new GameTimerManager();

  constructor(
    private readonly io: Server<ClientToServerEvents, ServerToClientEvents>,
    private readonly roomManager: RoomManager,
    private readonly logger: Logger,
  ) {}

  restoreActiveTimers(): void {
    // Timers for restored rooms are re-armed when any seat reconnects or explicitly synced
  }

  syncTimersForRoom(roomCode: string): void {
    const record = this.roomManager.getRoomRecord(roomCode);
    this.timerManager.syncRoomTimers(roomCode, record?.gameState ?? null, {
      onTurnTimeout: (code) => this.handleTurnTimeout(code),
      onAuctionTimeout: (code) => this.handleAuctionTimeout(code),
    });
  }

  startGame(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<{ started: true }> {
    const check = this.roomManager.canStartGame(roomCode, playerId, sessionToken);
    if (!check.ok) {
      return check;
    }

    const record = check.data;
    const initialState = createInitialGameState({
      roomCode: record.roomCode,
      settings: record.settings,
      players: record.players.map((seat) => ({
        id: seat.id,
        nickname: seat.nickname,
        color: seat.color,
        tokenShape: seat.tokenShape,
        isConnected: seat.isConnected,
      })),
      rng: this.rng,
    });

    const snapshot = this.roomManager.setRoomGameState(record.roomCode, initialState, {
      immediateSave: true,
    });
    if (!snapshot) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Room disappeared while starting game.' };
    }

    this.io.to(record.roomCode).emit('room:state', snapshot);
    this.syncTimersForRoom(record.roomCode);
    this.logger.info('Private game started', {
      roomCode: record.roomCode,
      players: record.players.length,
      mapId: record.settings.mapId,
    });

    return { ok: true, data: { started: true } };
  }

  handleAction(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    action: GameAction,
  ): RoomOperationResult<{ version: number }> {
    const auth = this.roomManager.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) {
      return auth;
    }

    const { record } = auth.data;
    if (record.status !== 'IN_GAME' || !record.gameState) {
      return { ok: false, code: 'INVALID_PHASE', error: 'No active game in this private room.' };
    }

    const result = applyGameAction(record.gameState, playerId, action, this.rng);
    if (!result.ok) {
      return { ok: false, code: result.code, error: result.error };
    }

    const immediateSave =
      result.state.phase === 'GAME_OVER' ||
      action.type === 'END_TURN' ||
      action.type === 'ACCEPT_TRADE' ||
      action.type === 'DECLARE_BANKRUPTCY';

    const snapshot = this.roomManager.setRoomGameState(record.roomCode, result.state, {
      immediateSave,
    });
    if (!snapshot) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Room no longer exists.' };
    }

    this.io.to(record.roomCode).emit('game:state', {
      roomCode: record.roomCode,
      gameState: sanitizeGameState(result.state),
      events: result.events,
    });

    if (result.state.phase === 'GAME_OVER') {
      this.io.to(record.roomCode).emit('room:state', snapshot);
    }

    this.syncTimersForRoom(record.roomCode);
    return { ok: true, data: { version: result.state.version } };
  }

  handleReturnToLobby(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<{ returned: true }> {
    const res = this.roomManager.returnToLobby(roomCode, playerId, sessionToken);
    if (!res.ok) return res;

    this.timerManager.clearRoomTimers(roomCode.toUpperCase());
    this.io.to(roomCode.toUpperCase()).emit('room:state', res.data);
    return { ok: true, data: { returned: true } };
  }

  shutdown(): void {
    this.timerManager.clearAll();
  }

  private handleTurnTimeout(roomCode: string): void {
    const record = this.roomManager.getRoomRecord(roomCode);
    if (!record || record.status !== 'IN_GAME' || !record.gameState) return;

    const result = resolveTurnTimeout(record.gameState, this.rng);
    if (!result.ok) return;

    const snapshot = this.roomManager.setRoomGameState(roomCode, result.state, {
      immediateSave: true,
    });
    if (!snapshot) return;

    this.io.to(roomCode).emit('game:state', {
      roomCode,
      gameState: sanitizeGameState(result.state),
      events: result.events,
    });

    if (result.state.phase === 'GAME_OVER') {
      this.io.to(roomCode).emit('room:state', snapshot);
    }

    this.syncTimersForRoom(roomCode);
  }

  private handleAuctionTimeout(roomCode: string): void {
    const record = this.roomManager.getRoomRecord(roomCode);
    if (!record || record.status !== 'IN_GAME' || !record.gameState) return;

    const result = resolveAuctionTimeout(record.gameState, this.rng);
    if (!result.ok) return;

    const snapshot = this.roomManager.setRoomGameState(roomCode, result.state, {
      immediateSave: true,
    });
    if (!snapshot) return;

    this.io.to(roomCode).emit('game:state', {
      roomCode,
      gameState: sanitizeGameState(result.state),
      events: result.events,
    });

    this.syncTimersForRoom(roomCode);
  }
}