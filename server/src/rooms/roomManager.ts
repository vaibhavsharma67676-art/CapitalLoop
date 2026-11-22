import {
  DEFAULT_GAME_SETTINGS,
  MAX_CHAT_HISTORY,
  MIN_PLAYERS,
  PLAYER_COLOR_PRESETS,
  TOKEN_SHAPES,
  sanitizeGameState,
  type BotDifficulty,
  type ChatMessage,
  type GameState,
  type LobbyPlayer,
  type MapId,
  type PartialGameSettings,
  type PrivateRoomSnapshot,
  type RoomSessionCredentials,
  type TokenShapeId,
} from '@capitalloop/shared';
import type { ServerConfig } from '../config';
import { generatePrivateRoomCode, generateSecureId } from '../security/codeGenerator';
import { generateSessionToken, hashSessionToken, verifySessionToken } from '../security/tokenAuth';
import type { Logger } from '../services/logger';
import type { PersistenceAdapter } from '../services/persistenceService';
import type { ServerPlayerSeat, ServerRoomRecord } from './roomTypes';

export type RoomOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

export interface RoomManagerHooks {
  onRoomUpdated?: (roomCode: string, snapshot: PrivateRoomSnapshot) => void;
  onPlayerKicked?: (socketId: string, roomCode: string, reason: string) => void;
}

export interface PublicMatchSeatInput {
  nickname: string;
  clientIp: string;
  socketId: string;
  preferredColor?: string;
  preferredToken?: TokenShapeId;
}

const DEFAULT_BOT_NAMES: readonly string[] = [
  'Atlas AI',
  'Nova AI',
  'Orion AI',
  'Vega AI',
  'Midas AI',
  'Apex AI',
  'Titan AI',
];

export class RoomManager {
  private readonly rooms = new Map<string, ServerRoomRecord>();
  private readonly socketToSeat = new Map<string, { roomCode: string; playerId: string }>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly hostMigrationTimers = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private hooks: RoomManagerHooks = {};

  constructor(
    private readonly config: ServerConfig,
    private readonly persistence: PersistenceAdapter,
    private readonly logger: Logger,
  ) {}

  setHooks(hooks: RoomManagerHooks): void {
    this.hooks = hooks;
  }

  async init(): Promise<void> {
    await this.persistence.init();
    const persisted = await this.persistence.loadAll();
    const now = Date.now();

    for (const record of persisted) {
      if (this.isRecordExpired(record, now)) {
        await this.persistence.deleteRoom(record.roomCode);
        continue;
      }
      // After a server restart, mark human seats disconnected so clients reconnect with their tokens
      for (const seat of record.players) {
        if (seat.isBot) {
          seat.isConnected = true;
          seat.socketId = null;
        } else {
          seat.isConnected = false;
          seat.socketId = null;
        }
      }
      if (record.gameState) {
        for (const p of Object.values(record.gameState.players)) {
          p.isConnected = Boolean(p.isBot);
        }
      }
      this.rooms.set(record.roomCode, record);
    }

    this.logger.info('RoomManager initialized', { restoredRooms: this.rooms.size });
    this.sweepTimer = setInterval(() => {
      void this.sweepExpiredRooms();
    }, 60_000);
    this.sweepTimer.unref();
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
    for (const t of this.hostMigrationTimers.values()) clearTimeout(t);
    this.hostMigrationTimers.clear();
    await this.persistence.flushAll();
  }

  /**
   * Intentionally exposes NO room listing method. Only single-code lookup exists.
   * Private rooms are never discoverable or exposed to public matchmaking.
   */
  getRoomRecord(roomCode: string): ServerRoomRecord | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  isSocketInRoom(socketId: string): boolean {
    return this.socketToSeat.has(socketId);
  }

  validateInviteCode(roomCode: string): {
    exists: boolean;
    joinable: boolean;
    reason?: string;
  } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      return { exists: false, joinable: false, reason: 'Room not found.' };
    }
    if (room.visibility === 'PUBLIC_MATCH') {
      return { exists: true, joinable: false, reason: 'This is a closed Quick Match table.' };
    }
    if (room.status !== 'LOBBY') {
      return { exists: true, joinable: false, reason: 'Game is already in progress.' };
    }
    if (room.isLocked) {
      return { exists: true, joinable: false, reason: 'Room is currently locked by the host.' };
    }
    if (room.players.length >= room.settings.maxPlayers) {
      return { exists: true, joinable: false, reason: 'Room is full.' };
    }
    return { exists: true, joinable: true };
  }

  createPrivateRoom(input: {
    nickname: string;
    clientIp: string;
    socketId: string;
    preferredColor?: string;
    preferredToken?: TokenShapeId;
    bots?: Array<{ difficulty: BotDifficulty; nickname?: string }>;
  }): RoomOperationResult<{ credentials: RoomSessionCredentials; snapshot: PrivateRoomSnapshot }> {
    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generatePrivateRoomCode(existingCodes);
    const playerId = generateSecureId('plr');
    const sessionToken = generateSessionToken();
    const now = Date.now();

    const color = input.preferredColor ?? PLAYER_COLOR_PRESETS[0]!.hex;
    const tokenShape = input.preferredToken ?? TOKEN_SHAPES[0];

    const hostSeat: ServerPlayerSeat = {
      id: playerId,
      nickname: input.nickname.trim(),
      color,
      tokenShape,
      isHost: true,
      isReady: true,
      isConnected: true,
      isBot: false,
      botDifficulty: null,
      joinedAt: now,
      lastSeenAt: now,
      tokenHash: hashSessionToken(sessionToken),
      socketId: input.socketId,
      clientIp: input.clientIp,
    };

    const record: ServerRoomRecord = {
      roomCode,
      status: 'LOBBY',
      visibility: 'PRIVATE',
      isLocked: false,
      hostId: playerId,
      settings: { ...DEFAULT_GAME_SETTINGS },
      players: [hostSeat],
      kickedIps: [],
      chat: [
        {
          id: generateSecureId('msg'),
          roomCode,
          senderId: 'system',
          senderName: 'System',
          senderColor: '#a78bfa',
          text: `${hostSeat.nickname} created private room ${roomCode}. Share the invite link or add AI bots to begin!`,
          timestamp: now,
          isSystem: true,
        },
      ],
      gameState: null,
      createdAt: now,
      updatedAt: now,
    };

    if (input.bots && input.bots.length > 0) {
      const requestedMax = Math.min(8, Math.max(record.settings.maxPlayers, 1 + input.bots.length));
      record.settings.maxPlayers = requestedMax;
      for (const botSpec of input.bots) {
        if (record.players.length >= record.settings.maxPlayers) break;
        const botSeat = this.buildBotSeat(record, botSpec.difficulty, botSpec.nickname, now);
        record.players.push(botSeat);
      }
    }

    this.rooms.set(roomCode, record);
    this.socketToSeat.set(input.socketId, { roomCode, playerId });
    this.persistence.saveRoom(record, true);

    return {
      ok: true,
      data: {
        credentials: {
          roomCode,
          playerId,
          sessionToken,
          invitePath: `/join/${roomCode}`,
        },
        snapshot: this.toSnapshot(record),
      },
    };
  }

  /**
   * Creates an isolated public matchmaking table for matched Quick Match players.
   * Never touches or exposes any PRIVATE room.
   */
  createPublicMatchRoom(input: {
    seats: PublicMatchSeatInput[];
    mapId: MapId;
    gameSpeed: 'NORMAL' | 'FAST';
  }): RoomOperationResult<{
    roomCode: string;
    record: ServerRoomRecord;
    assignments: Array<{ socketId: string; credentials: RoomSessionCredentials }>;
  }> {
    if (input.seats.length < MIN_PLAYERS) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        error: `Need at least ${MIN_PLAYERS} players to form a Quick Match.`,
      };
    }

    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generatePrivateRoomCode(existingCodes);
    const now = Date.now();

    const players: ServerPlayerSeat[] = [];
    const assignments: Array<{ socketId: string; credentials: RoomSessionCredentials }> = [];
    const usedNames = new Set<string>();
    const usedColors = new Set<string>();
    const usedTokens = new Set<TokenShapeId>();

    input.seats.forEach((seatInput, idx) => {
      const playerId = generateSecureId('plr');
      const sessionToken = generateSessionToken();

      let displayName = seatInput.nickname.trim();
      if (usedNames.has(displayName.toLowerCase())) {
        const suffix = ` #${idx + 1}`;
        displayName = `${displayName.slice(0, 18 - suffix.length)}${suffix}`;
      }
      usedNames.add(displayName.toLowerCase());

      const color =
        seatInput.preferredColor && !usedColors.has(seatInput.preferredColor.toLowerCase())
          ? seatInput.preferredColor
          : (PLAYER_COLOR_PRESETS.find((c) => !usedColors.has(c.hex.toLowerCase()))?.hex ??
            PLAYER_COLOR_PRESETS[idx % PLAYER_COLOR_PRESETS.length]!.hex);
      usedColors.add(color.toLowerCase());

      const tokenShape =
        seatInput.preferredToken && !usedTokens.has(seatInput.preferredToken)
          ? seatInput.preferredToken
          : (TOKEN_SHAPES.find((t) => !usedTokens.has(t)) ??
            TOKEN_SHAPES[idx % TOKEN_SHAPES.length]!);
      usedTokens.add(tokenShape);

      const seat: ServerPlayerSeat = {
        id: playerId,
        nickname: displayName,
        color,
        tokenShape,
        isHost: idx === 0,
        isReady: true,
        isConnected: true,
        isBot: false,
        botDifficulty: null,
        joinedAt: now,
        lastSeenAt: now,
        tokenHash: hashSessionToken(sessionToken),
        socketId: seatInput.socketId,
        clientIp: seatInput.clientIp,
      };

      players.push(seat);
      assignments.push({
        socketId: seatInput.socketId,
        credentials: {
          roomCode,
          playerId,
          sessionToken,
          invitePath: `/room/${roomCode}`,
        },
      });
    });

    const hostId = players[0]!.id;
    const record: ServerRoomRecord = {
      roomCode,
      status: 'LOBBY',
      visibility: 'PUBLIC_MATCH',
      isLocked: true,
      hostId,
      settings: {
        ...DEFAULT_GAME_SETTINGS,
        mapId: input.mapId,
        gameSpeed: input.gameSpeed,
        maxPlayers: players.length,
        turnTimerSeconds: input.gameSpeed === 'FAST' ? 30 : 60,
      },
      players,
      kickedIps: [],
      chat: [
        {
          id: generateSecureId('msg'),
          roomCode,
          senderId: 'system',
          senderName: 'System',
          senderColor: '#a78bfa',
          text: `Quick Match formed with ${players.length} players! Starting match...`,
          timestamp: now,
          isSystem: true,
        },
      ],
      gameState: null,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(roomCode, record);
    for (const assignment of assignments) {
      this.socketToSeat.set(assignment.socketId, {
        roomCode,
        playerId: assignment.credentials.playerId,
      });
    }
    this.persistence.saveRoom(record, true);

    return { ok: true, data: { roomCode, record, assignments } };
  }

  joinPrivateRoom(input: {
    roomCode: string;
    nickname: string;
    clientIp: string;
    socketId: string;
    preferredColor?: string;
    preferredToken?: TokenShapeId;
  }): RoomOperationResult<{ credentials: RoomSessionCredentials; snapshot: PrivateRoomSnapshot }> {
    const code = input.roomCode.toUpperCase();
    const record = this.rooms.get(code);
    if (!record) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Private room not found. Check your 5-character code.' };
    }
    if (record.visibility === 'PUBLIC_MATCH') {
      return {
        ok: false,
        code: 'ROOM_LOCKED',
        error: 'This Quick Match table is closed to external joins.',
      };
    }
    if (record.status !== 'LOBBY') {
      return {
        ok: false,
        code: 'ROOM_IN_GAME',
        error: 'This private room is already in progress. Unauthorized joining is blocked.',
      };
    }
    if (record.isLocked) {
      return {
        ok: false,
        code: 'ROOM_LOCKED',
        error: 'This private room is locked by the host.',
      };
    }
    if (record.kickedIps.includes(input.clientIp)) {
      return {
        ok: false,
        code: 'PLAYER_KICKED',
        error: 'You were removed from this private room by the host.',
      };
    }
    if (record.players.length >= record.settings.maxPlayers) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        error: `Room is full (${record.settings.maxPlayers}/${record.settings.maxPlayers} players).`,
      };
    }

    const trimmedName = input.nickname.trim();
    const duplicateName = record.players.some(
      (p) => p.nickname.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicateName) {
      return {
        ok: false,
        code: 'NICKNAME_TAKEN',
        error: 'Someone in this room is already using that nickname.',
      };
    }

    const usedColors = new Set(record.players.map((p) => p.color.toLowerCase()));
    const color =
      input.preferredColor && !usedColors.has(input.preferredColor.toLowerCase())
        ? input.preferredColor
        : (PLAYER_COLOR_PRESETS.find((c) => !usedColors.has(c.hex.toLowerCase()))?.hex ??
          PLAYER_COLOR_PRESETS[record.players.length % PLAYER_COLOR_PRESETS.length]!.hex);

    const usedTokens = new Set(record.players.map((p) => p.tokenShape));
    const tokenShape =
      input.preferredToken && !usedTokens.has(input.preferredToken)
        ? input.preferredToken
        : (TOKEN_SHAPES.find((t) => !usedTokens.has(t)) ??
          TOKEN_SHAPES[record.players.length % TOKEN_SHAPES.length]!);

    const playerId = generateSecureId('plr');
    const sessionToken = generateSessionToken();
    const now = Date.now();

    const seat: ServerPlayerSeat = {
      id: playerId,
      nickname: trimmedName,
      color,
      tokenShape,
      isHost: false,
      isReady: false,
      isConnected: true,
      isBot: false,
      botDifficulty: null,
      joinedAt: now,
      lastSeenAt: now,
      tokenHash: hashSessionToken(sessionToken),
      socketId: input.socketId,
      clientIp: input.clientIp,
    };

    record.players.push(seat);
    record.updatedAt = now;
    this.appendSystemChat(record, `${seat.nickname} joined the private room.`);
    this.socketToSeat.set(input.socketId, { roomCode: code, playerId });
    this.persistence.saveRoom(record);

    return {
      ok: true,
      data: {
        credentials: {
          roomCode: code,
          playerId,
          sessionToken,
          invitePath: `/join/${code}`,
        },
        snapshot: this.toSnapshot(record),
      },
    };
  }

  addBotToRoom(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    difficulty: BotDifficulty,
    customNickname?: string,
  ): RoomOperationResult<{ botId: string; snapshot: PrivateRoomSnapshot }> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can add AI bots.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Bots can only be added in the lobby.' };
    }
    if (record.players.length >= record.settings.maxPlayers) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        error: `Room is full (${record.settings.maxPlayers}/${record.settings.maxPlayers}). Increase Max Players to add more bots.`,
      };
    }

    const now = Date.now();
    const botSeat = this.buildBotSeat(record, difficulty, customNickname, now);
    record.players.push(botSeat);
    record.updatedAt = now;
    this.appendSystemChat(record, `${botSeat.nickname} (${difficulty} Bot) joined the table.`);
    this.persistence.saveRoom(record);

    return {
      ok: true,
      data: {
        botId: botSeat.id,
        snapshot: this.toSnapshot(record),
      },
    };
  }

  removeBotFromRoom(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    botId: string,
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can remove AI bots.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Bots can only be removed in the lobby.' };
    }

    const idx = record.players.findIndex((p) => p.id === botId && p.isBot);
    if (idx === -1) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', error: 'Bot not found in lobby.' };
    }

    const [removed] = record.players.splice(idx, 1);
    record.updatedAt = Date.now();
    if (removed) {
      this.appendSystemChat(record, `${removed.nickname} was removed from the table.`);
    }
    this.persistence.saveRoom(record);
    return { ok: true, data: this.toSnapshot(record) };
  }

  updateBotDifficulty(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    botId: string,
    difficulty: BotDifficulty,
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can change bot difficulty.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Bot difficulty can only be edited in the lobby.' };
    }

    const bot = record.players.find((p) => p.id === botId && p.isBot);
    if (!bot) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', error: 'Bot not found in lobby.' };
    }

    bot.botDifficulty = difficulty;
    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);
    return { ok: true, data: this.toSnapshot(record) };
  }

  reconnectSeat(input: {
    roomCode: string;
    playerId: string;
    sessionToken: string;
    socketId: string;
  }): RoomOperationResult<{ snapshot: PrivateRoomSnapshot; previousSocketId: string | null }> {
    const auth = this.authenticateSeat(input.roomCode, input.playerId, input.sessionToken);
    if (!auth.ok) {
      return auth;
    }

    const { record, seat } = auth.data;
    const previousSocketId = seat.socketId;
    if (previousSocketId && previousSocketId !== input.socketId) {
      this.socketToSeat.delete(previousSocketId);
    }

    this.clearSeatDisconnectTimer(record.roomCode, seat.id);
    if (seat.isHost) {
      this.clearHostMigrationTimer(record.roomCode);
    }

    seat.isConnected = true;
    seat.socketId = input.socketId;
    seat.lastSeenAt = Date.now();
    if (record.gameState && record.gameState.players[seat.id]) {
      record.gameState.players[seat.id]!.isConnected = true;
    }
    record.updatedAt = Date.now();

    this.socketToSeat.set(input.socketId, { roomCode: record.roomCode, playerId: seat.id });
    this.persistence.saveRoom(record);

    return {
      ok: true,
      data: {
        snapshot: this.toSnapshot(record),
        previousSocketId,
      },
    };
  }

  authenticateSeat(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<{ record: ServerRoomRecord; seat: ServerPlayerSeat }> {
    const record = this.rooms.get(roomCode.toUpperCase());
    if (!record) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Private room no longer exists.' };
    }
    const seat = record.players.find((p) => p.id === playerId);
    if (!seat || seat.isBot) {
      return { ok: false, code: 'UNAUTHORIZED', error: 'You are not a member of this room.' };
    }
    if (!verifySessionToken(sessionToken, seat.tokenHash)) {
      return { ok: false, code: 'UNAUTHORIZED', error: 'Invalid session credentials.' };
    }
    return { ok: true, data: { record, seat } };
  }

  setPlayerReady(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    isReady: boolean,
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Cannot change ready state during a match.' };
    }

    seat.isReady = seat.isHost ? true : isReady;
    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);
    return { ok: true, data: this.toSnapshot(record) };
  }

  updatePlayerProfile(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    updates: { color?: string; tokenShape?: TokenShapeId },
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Customize token & color in the lobby before starting.' };
    }

    if (updates.color) {
      const taken = record.players.some(
        (p) => p.id !== seat.id && p.color.toLowerCase() === updates.color!.toLowerCase(),
      );
      if (taken) {
        return { ok: false, code: 'COLOR_TAKEN', error: 'Another player already picked that color.' };
      }
      seat.color = updates.color;
    }

    if (updates.tokenShape) {
      const taken = record.players.some(
        (p) => p.id !== seat.id && p.tokenShape === updates.tokenShape,
      );
      if (taken) {
        return { ok: false, code: 'TOKEN_TAKEN', error: 'Another player already picked that token.' };
      }
      seat.tokenShape = updates.tokenShape;
    }

    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);
    return { ok: true, data: this.toSnapshot(record) };
  }

  updateRoomSettings(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    patch: PartialGameSettings,
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can change room settings.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Settings can only be edited in the lobby.' };
    }

    if (patch.maxPlayers !== undefined && patch.maxPlayers < record.players.length) {
      return {
        ok: false,
        code: 'INVALID_SETTINGS',
        error: `Cannot lower max players below current player count (${record.players.length}).`,
      };
    }

    record.settings = {
      ...record.settings,
      ...patch,
    };
    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);
    return { ok: true, data: this.toSnapshot(record) };
  }

  toggleRoomLock(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    isLocked: boolean,
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can lock or unlock the room.' };
    }

    record.isLocked = isLocked;
    record.updatedAt = Date.now();
    this.appendSystemChat(
      record,
      isLocked ? 'Host locked the private room.' : 'Host unlocked the private room.',
    );
    this.persistence.saveRoom(record);
    return { ok: true, data: this.toSnapshot(record) };
  }

  kickPlayer(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    targetPlayerId: string,
  ): RoomOperationResult<{ snapshot: PrivateRoomSnapshot; kickedSocketId: string | null }> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can remove players.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Players can only be removed before the game starts.' };
    }
    if (targetPlayerId === seat.id) {
      return { ok: false, code: 'INVALID_TARGET', error: 'Host cannot kick themselves.' };
    }

    const idx = record.players.findIndex((p) => p.id === targetPlayerId);
    if (idx === -1) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', error: 'Player not found in lobby.' };
    }

    const [removed] = record.players.splice(idx, 1);
    if (!removed) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' };
    }

    this.clearSeatDisconnectTimer(record.roomCode, removed.id);
    if (removed.socketId) {
      this.socketToSeat.delete(removed.socketId);
    }
    if (
      !removed.isBot &&
      removed.clientIp &&
      removed.clientIp !== 'unknown' &&
      !record.kickedIps.includes(removed.clientIp)
    ) {
      record.kickedIps.push(removed.clientIp);
    }

    record.updatedAt = Date.now();
    this.appendSystemChat(record, `${removed.nickname} was removed by the host.`);
    this.persistence.saveRoom(record, true);

    return {
      ok: true,
      data: {
        snapshot: this.toSnapshot(record),
        kickedSocketId: removed.socketId,
      },
    };
  }

  leaveRoom(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<{ roomDeleted: boolean; snapshot: PrivateRoomSnapshot | null }> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (seat.socketId) {
      this.socketToSeat.delete(seat.socketId);
    }
    this.clearSeatDisconnectTimer(record.roomCode, seat.id);

    if (record.status === 'LOBBY') {
      record.players = record.players.filter((p) => p.id !== seat.id);
      const remainingHumans = record.players.filter((p) => !p.isBot);
      if (remainingHumans.length === 0) {
        this.deleteRoomInternal(record.roomCode);
        return { ok: true, data: { roomDeleted: true, snapshot: null } };
      }

      if (seat.isHost) {
        this.promoteNextHost(record);
      }

      record.updatedAt = Date.now();
      this.appendSystemChat(record, `${seat.nickname} left the lobby.`);
      this.persistence.saveRoom(record, true);
      return { ok: true, data: { roomDeleted: false, snapshot: this.toSnapshot(record) } };
    }

    // In-game or finished: preserve seat for secure reconnection
    seat.isConnected = false;
    seat.socketId = null;
    if (record.gameState && record.gameState.players[seat.id]) {
      record.gameState.players[seat.id]!.isConnected = false;
    }

    if (seat.isHost) {
      this.promoteNextHost(record);
    }

    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);
    return { ok: true, data: { roomDeleted: false, snapshot: this.toSnapshot(record) } };
  }

  returnToLobby(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<PrivateRoomSnapshot> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can return the room to lobby.' };
    }
    if (record.status !== 'FINISHED') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Game has not finished yet.' };
    }

    record.status = 'LOBBY';
    record.gameState = null;
    if (record.visibility !== 'PUBLIC_MATCH') {
      record.isLocked = false;
    }
    for (const p of record.players) {
      p.isReady = p.isHost || Boolean(p.isBot);
    }
    record.updatedAt = Date.now();
    this.appendSystemChat(record, 'Host returned the room to the lobby for a rematch.');
    this.persistence.saveRoom(record, true);

    return { ok: true, data: this.toSnapshot(record) };
  }

  addChatMessage(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    text: string,
  ): RoomOperationResult<ChatMessage> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    const message: ChatMessage = {
      id: generateSecureId('msg'),
      roomCode: record.roomCode,
      senderId: seat.id,
      senderName: seat.nickname,
      senderColor: seat.color,
      text: text.trim(),
      timestamp: Date.now(),
    };

    record.chat.push(message);
    if (record.chat.length > MAX_CHAT_HISTORY) {
      record.chat.splice(0, record.chat.length - MAX_CHAT_HISTORY);
    }
    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);

    return { ok: true, data: message };
  }

  setRoomGameState(
    roomCode: string,
    gameState: GameState,
    options: { immediateSave?: boolean } = {},
  ): PrivateRoomSnapshot | null {
    const record = this.rooms.get(roomCode.toUpperCase());
    if (!record) return null;

    record.gameState = gameState;
    record.status = gameState.phase === 'GAME_OVER' ? 'FINISHED' : 'IN_GAME';
    record.updatedAt = Date.now();
    this.persistence.saveRoom(record, options.immediateSave ?? false);
    return this.toSnapshot(record);
  }

  canStartGame(
    roomCode: string,
    playerId: string,
    sessionToken: string,
  ): RoomOperationResult<ServerRoomRecord> {
    const auth = this.authenticateSeat(roomCode, playerId, sessionToken);
    if (!auth.ok) return auth;

    const { record, seat } = auth.data;
    if (!seat.isHost) {
      return { ok: false, code: 'FORBIDDEN', error: 'Only the host can start the game.' };
    }
    if (record.status !== 'LOBBY') {
      return { ok: false, code: 'INVALID_PHASE', error: 'Game already started.' };
    }
    if (record.players.length < MIN_PLAYERS) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        error: `At least ${MIN_PLAYERS} players (friends or AI bots) are required to start.`,
      };
    }
    const notReady = record.players.filter((p) => !p.isHost && !p.isBot && !p.isReady);
    if (notReady.length > 0) {
      return {
        ok: false,
        code: 'PLAYERS_NOT_READY',
        error: `Waiting for ${notReady.map((p) => p.nickname).join(', ')} to click Ready.`,
      };
    }

    return { ok: true, data: record };
  }

  handleSocketDisconnect(socketId: string): { roomCode: string; snapshot: PrivateRoomSnapshot } | null {
    const binding = this.socketToSeat.get(socketId);
    if (!binding) return null;
    this.socketToSeat.delete(socketId);

    const record = this.rooms.get(binding.roomCode);
    if (!record) return null;

    const seat = record.players.find((p) => p.id === binding.playerId);
    if (!seat || seat.isBot || seat.socketId !== socketId) return null;

    seat.isConnected = false;
    seat.socketId = null;
    seat.lastSeenAt = Date.now();

    if (record.gameState && record.gameState.players[seat.id]) {
      record.gameState.players[seat.id]!.isConnected = false;
    }

    if (record.status === 'LOBBY') {
      const key = `${record.roomCode}:${seat.id}`;
      this.clearSeatDisconnectTimer(record.roomCode, seat.id);
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(key);
        this.evictDisconnectedLobbySeat(record.roomCode, seat.id);
      }, this.config.lobbyDisconnectTtlMs);
      timer.unref();
      this.disconnectTimers.set(key, timer);
    }

    if (seat.isHost) {
      this.scheduleHostMigration(record.roomCode);
    }

    record.updatedAt = Date.now();
    this.persistence.saveRoom(record);
    return { roomCode: record.roomCode, snapshot: this.toSnapshot(record) };
  }

  toSnapshot(record: ServerRoomRecord): PrivateRoomSnapshot {
    const players: LobbyPlayer[] = record.players.map((seat) => ({
      id: seat.id,
      nickname: seat.nickname,
      color: seat.color,
      tokenShape: seat.tokenShape,
      isHost: seat.isHost,
      isReady: seat.isReady,
      isConnected: seat.isConnected,
      isBot: Boolean(seat.isBot),
      botDifficulty: seat.isBot ? (seat.botDifficulty ?? 'MEDIUM') : null,
      discordId: seat.discordId ?? null,
      joinedAt: seat.joinedAt,
    }));

    return {
      roomCode: record.roomCode,
      status: record.status,
      visibility: record.visibility ?? 'PRIVATE',
      isLocked: record.isLocked,
      hostId: record.hostId,
      settings: { ...record.settings },
      players,
      chat: [...record.chat],
      gameState: record.gameState ? sanitizeGameState(record.gameState) : null,
      createdAt: record.createdAt,
    };
  }

  private buildBotSeat(
    record: ServerRoomRecord,
    difficulty: BotDifficulty,
    customNickname: string | undefined,
    now: number,
  ): ServerPlayerSeat {
    const usedNames = new Set(record.players.map((p) => p.nickname.toLowerCase()));
    let nickname = customNickname?.trim() || '';
    if (!nickname || usedNames.has(nickname.toLowerCase())) {
      nickname =
        DEFAULT_BOT_NAMES.find((candidate) => !usedNames.has(candidate.toLowerCase())) ??
        `Bot ${record.players.filter((p) => p.isBot).length + 1}`;
    }

    const usedColors = new Set(record.players.map((p) => p.color.toLowerCase()));
    const color =
      PLAYER_COLOR_PRESETS.find((c) => !usedColors.has(c.hex.toLowerCase()))?.hex ??
      PLAYER_COLOR_PRESETS[record.players.length % PLAYER_COLOR_PRESETS.length]!.hex;

    const usedTokens = new Set(record.players.map((p) => p.tokenShape));
    const tokenShape =
      TOKEN_SHAPES.find((t) => !usedTokens.has(t)) ??
      TOKEN_SHAPES[record.players.length % TOKEN_SHAPES.length]!;

    return {
      id: generateSecureId('bot'),
      nickname,
      color,
      tokenShape,
      isHost: false,
      isReady: true,
      isConnected: true,
      isBot: true,
      botDifficulty: difficulty,
      joinedAt: now,
      lastSeenAt: now,
      tokenHash: '',
      socketId: null,
      clientIp: 'bot',
    };
  }

  private evictDisconnectedLobbySeat(roomCode: string, playerId: string): void {
    const record = this.rooms.get(roomCode);
    if (!record || record.status !== 'LOBBY') return;

    const seat = record.players.find((p) => p.id === playerId);
    if (!seat || seat.isBot || seat.isConnected) return;

    record.players = record.players.filter((p) => p.id !== playerId);
    const remainingHumans = record.players.filter((p) => !p.isBot);
    if (remainingHumans.length === 0) {
      this.deleteRoomInternal(roomCode);
      return;
    }

    if (seat.isHost) {
      this.promoteNextHost(record);
    }

    record.updatedAt = Date.now();
    this.appendSystemChat(record, `${seat.nickname} timed out while disconnected.`);
    this.persistence.saveRoom(record, true);
    this.hooks.onRoomUpdated?.(roomCode, this.toSnapshot(record));
  }

  private scheduleHostMigration(roomCode: string): void {
    this.clearHostMigrationTimer(roomCode);
    const timer = setTimeout(() => {
      this.hostMigrationTimers.delete(roomCode);
      const record = this.rooms.get(roomCode);
      if (!record) return;
      const currentHost = record.players.find((p) => p.id === record.hostId);
      if (currentHost && currentHost.isConnected) return;
      if (this.promoteNextHost(record)) {
        this.persistence.saveRoom(record, true);
        this.hooks.onRoomUpdated?.(roomCode, this.toSnapshot(record));
      }
    }, this.config.hostMigrationTtlMs);
    timer.unref();
    this.hostMigrationTimers.set(roomCode, timer);
  }

  private promoteNextHost(record: ServerRoomRecord): boolean {
    const connectedHuman = record.players.find(
      (p) => !p.isBot && p.isConnected && p.id !== record.hostId,
    );
    const fallbackHuman = record.players.find((p) => !p.isBot && p.id !== record.hostId);
    const nextHost = connectedHuman ?? fallbackHuman;
    if (!nextHost) return false;

    for (const p of record.players) {
      p.isHost = p.id === nextHost.id;
    }
    nextHost.isReady = true;
    record.hostId = nextHost.id;
    this.appendSystemChat(record, `Host privileges transferred to ${nextHost.nickname}.`);
    return true;
  }

  private clearSeatDisconnectTimer(roomCode: string, playerId: string): void {
    const key = `${roomCode}:${playerId}`;
    const timer = this.disconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(key);
    }
  }

  private clearHostMigrationTimer(roomCode: string): void {
    const timer = this.hostMigrationTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.hostMigrationTimers.delete(roomCode);
    }
  }

  private appendSystemChat(record: ServerRoomRecord, text: string): void {
    record.chat.push({
      id: generateSecureId('msg'),
      roomCode: record.roomCode,
      senderId: 'system',
      senderName: 'System',
      senderColor: '#a78bfa',
      text,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (record.chat.length > MAX_CHAT_HISTORY) {
      record.chat.splice(0, record.chat.length - MAX_CHAT_HISTORY);
    }
  }

  private deleteRoomInternal(roomCode: string): void {
    this.clearHostMigrationTimer(roomCode);
    this.rooms.delete(roomCode);
    void this.persistence.deleteRoom(roomCode);
  }

  private isRecordExpired(record: ServerRoomRecord, now: number): boolean {
    const age = now - record.updatedAt;
    if (record.status === 'FINISHED') return age > this.config.finishedRoomTtlMs;
    if (record.status === 'LOBBY') return age > this.config.idleLobbyTtlMs;
    return age > this.config.idleGameTtlMs;
  }

  private async sweepExpiredRooms(): Promise<void> {
    const now = Date.now();
    for (const [roomCode, record] of this.rooms.entries()) {
      const hasConnectedHuman = record.players.some((p) => !p.isBot && p.isConnected);
      if (!hasConnectedHuman && this.isRecordExpired(record, now)) {
        this.deleteRoomInternal(roomCode);
        this.logger.info('Swept expired room', { roomCode });
      }
    }
  }
}
