import {
  applyGameAction,
  createInitialGameState,
  getBoardMap,
  resolveAuctionTimeout,
  resolveTurnTimeout,
  sanitizeGameState,
  type ClientToServerEvents,
  type GameAction,
  type ServerToClientEvents,
} from '@capitalloop/shared';
import type { Server } from 'socket.io';
import { BotRunner, type BotActionExecutor } from '../bots/botRunner';
import type { RoomManager, RoomOperationResult } from '../rooms/roomManager';
import type { ServerRoomRecord } from '../rooms/roomTypes';
import { createCryptoRng } from '../security/codeGenerator';
import type { DiscordService } from '../services/discordService';
import type { Logger } from '../services/logger';
import { GameTimerManager } from './timerManager';

export class GameController {
  private readonly rng = createCryptoRng();
  private readonly timerManager = new GameTimerManager();
  private readonly botRunner: BotRunner;
  private readonly activeRoomLocks = new Set<string>();
  private readonly botExecutor: BotActionExecutor;

  constructor(
    private readonly io: Server<ClientToServerEvents, ServerToClientEvents>,
    private readonly roomManager: RoomManager,
    private readonly logger: Logger,
    private readonly discordService?: DiscordService,
  ) {
    this.botRunner = new BotRunner(logger);
    this.botExecutor = {
      getGameState: (code) => {
        const rec = this.roomManager.getRoomRecord(code);
        return rec && rec.status === 'IN_GAME' ? rec.gameState : null;
      },
      executeBotAction: (code, botId, action) => this.handleBotAction(code, botId, action),
    };
  }

  restoreActiveTimers(): void {
    // Timers and bots for restored rooms are re-armed when any human seat reconnects
  }

  syncTimersForRoom(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const record = this.roomManager.getRoomRecord(code);
    const state = record?.gameState ?? null;

    this.timerManager.syncRoomTimers(code, state, {
      onTurnTimeout: (rc) => this.handleTurnTimeout(rc),
      onAuctionTimeout: (rc) => this.handleAuctionTimeout(rc),
    });

    if (record?.status === 'IN_GAME' && state && state.phase !== 'GAME_OVER') {
      this.botRunner.scheduleForRoom(code, this.botExecutor);
    } else {
      this.botRunner.clearRoom(code);
    }
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

    return this.initializeAndBroadcastMatch(check.data);
  }

  /**
   * Starts a freshly formed Quick Match room directly on the server.
   */
  startMatchedGame(roomCode: string): RoomOperationResult<{ started: true }> {
    const record = this.roomManager.getRoomRecord(roomCode);
    if (!record) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Match room not found.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Match already started.' };
    }
    return this.initializeAndBroadcastMatch(record);
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
    return this.runAuthoritativeAction(record.roomCode, playerId, action);
  }

  handleBotAction(roomCode: string, botId: string, action: GameAction): boolean {
    const record = this.roomManager.getRoomRecord(roomCode);
    if (!record || record.status !== 'IN_GAME' || !record.gameState) {
      return false;
    }
    const seat = record.players.find((p) => p.id === botId && p.isBot);
    if (!seat) {
      return false;
    }

    const res = this.runAuthoritativeAction(record.roomCode, botId, action);
    return res.ok;
  }

  handleReturnToLobby(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<{ returned: true }> {
    const res = this.roomManager.returnToLobby(roomCode, playerId, sessionToken);
    if (!res.ok) return res;

    const code = roomCode.toUpperCase();
    this.timerManager.clearRoomTimers(code);
    this.botRunner.clearRoom(code);
    this.io.to(code).emit('room:state', res.data);
    return { ok: true, data: { returned: true } };
  }

  shutdown(): void {
    this.timerManager.clearAll();
    this.botRunner.clearAll();
    this.activeRoomLocks.clear();
  }

  private initializeAndBroadcastMatch(
    record: ServerRoomRecord,
  ): RoomOperationResult<{ started: true }> {
    const initialState = createInitialGameState({
      roomCode: record.roomCode,
      settings: record.settings,
      players: record.players.map((seat) => ({
        id: seat.id,
        nickname: seat.nickname,
        color: seat.color,
        tokenShape: seat.tokenShape,
        isConnected: seat.isConnected,
        isBot: Boolean(seat.isBot),
        botDifficulty: seat.isBot ? (seat.botDifficulty ?? 'MEDIUM') : null,
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

    const botCount = record.players.filter((p) => p.isBot).length;
    const map = getBoardMap(record.settings.mapId);
    this.discordService?.notifyGameStarted(map.name, record.players.length, botCount);

    this.logger.info('Game started', {
      roomCode: record.roomCode,
      visibility: record.visibility ?? 'PRIVATE',
      players: record.players.length,
      bots: botCount,
      mapId: record.settings.mapId,
    });

    return { ok: true, data: { started: true } };
  }

  private runAuthoritativeAction(
    roomCode: string,
    actorId: string,
    action: GameAction,
  ): RoomOperationResult<{ version: number }> {
    const code = roomCode.toUpperCase();
    if (this.activeRoomLocks.has(code)) {
      return {
        ok: false,
        code: 'CONCURRENT_ACTION',
        error: 'Another action is currently processing. Please retry.',
      };
    }

    this.activeRoomLocks.add(code);
    try {
      const record = this.roomManager.getRoomRecord(code);
      if (!record || record.status !== 'IN_GAME' || !record.gameState) {
        return { ok: false, code: 'INVALID_PHASE', error: 'No active game in this room.' };
      }

      const result = applyGameAction(record.gameState, actorId, action, this.rng);
      if (!result.ok) {
        return { ok: false, code: result.code, error: result.error };
      }

      const immediateSave =
        result.state.phase === 'GAME_OVER' ||
        action.type === 'END_TURN' ||
        action.type === 'ACCEPT_TRADE' ||
        action.type === 'DECLARE_BANKRUPTCY';

      const snapshot = this.roomManager.setRoomGameState(code, result.state, {
        immediateSave,
      });
      if (!snapshot) {
        return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Room no longer exists.' };
      }

      this.io.to(code).emit('game:state', {
        roomCode: code,
        gameState: sanitizeGameState(result.state),
        events: result.events,
      });

      if (result.state.phase === 'GAME_OVER') {
        this.io.to(code).emit('room:state', snapshot);
        const winner = result.state.winnerId ? result.state.players[result.state.winnerId] : undefined;
        if (winner) {
          this.discordService?.notifyGameCompleted(
            winner.nickname,
            result.state.turnNumber,
            Boolean(winner.isBot),
          );
        }
      }

      this.syncTimersForRoom(code);
      return { ok: true, data: { version: result.state.version } };
    } finally {
      this.activeRoomLocks.delete(code);
    }
  }

  private handleTurnTimeout(roomCode: string): void {
    const code = roomCode.toUpperCase();
    if (this.activeRoomLocks.has(code)) return;

    this.activeRoomLocks.add(code);
    try {
      const record = this.roomManager.getRoomRecord(code);
      if (!record || record.status !== 'IN_GAME' || !record.gameState) return;

      const result = resolveTurnTimeout(record.gameState, this.rng);
      if (!result.ok) return;

      const snapshot = this.roomManager.setRoomGameState(code, result.state, {
        immediateSave: true,
      });
      if (!snapshot) return;

      this.io.to(code).emit('game:state', {
        roomCode: code,
        gameState: sanitizeGameState(result.state),
        events: result.events,
      });

      if (result.state.phase === 'GAME_OVER') {
        this.io.to(code).emit('room:state', snapshot);
        const winner = result.state.winnerId ? result.state.players[result.state.winnerId] : undefined;
        if (winner) {
          this.discordService?.notifyGameCompleted(
            winner.nickname,
            result.state.turnNumber,
            Boolean(winner.isBot),
          );
        }
      }

      this.syncTimersForRoom(code);
    } finally {
      this.activeRoomLocks.delete(code);
    }
  }

  private handleAuctionTimeout(roomCode: string): void {
    const code = roomCode.toUpperCase();
    if (this.activeRoomLocks.has(code)) return;

    this.activeRoomLocks.add(code);
    try {
      const record = this.roomManager.getRoomRecord(code);
      if (!record || record.status !== 'IN_GAME' || !record.gameState) return;

      const result = resolveAuctionTimeout(record.gameState, this.rng);
      if (!result.ok) return;

      const snapshot = this.roomManager.setRoomGameState(code, result.state, {
        immediateSave: true,
      });
      if (!snapshot) return;

      this.io.to(code).emit('game:state', {
        roomCode: code,
        gameState: sanitizeGameState(result.state),
        events: result.events,
      });

      this.syncTimersForRoom(code);
    } finally {
      this.activeRoomLocks.delete(code);
    }
  }
}
