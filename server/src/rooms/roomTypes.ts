import type {
  BotDifficulty,
  ChatMessage,
  GameSettings,
  GameState,
  RoomStatus,
  RoomVisibility,
  TokenShapeId,
} from '@capitalloop/shared';

export interface ServerPlayerSeat {
  id: string;
  nickname: string;
  color: string;
  tokenShape: TokenShapeId;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  /** SHA-256 hash of the player's secret session token (empty for bots) */
  tokenHash: string;
  /** Current live Socket.IO connection ID (null while disconnected or for bots) */
  socketId: string | null;
  /** Client IP captured on create/join for kick enforcement */
  clientIp: string;
  /** True for AI-controlled seats */
  isBot?: boolean;
  /** AI difficulty level when isBot is true */
  botDifficulty?: BotDifficulty | null;
  /** Optional linked Discord user ID */
  discordId?: string | null;
}

export interface ServerRoomRecord {
  roomCode: string;
  status: RoomStatus;
  /** Private rooms are strictly invite-only and never exposed to matchmaking */
  visibility?: RoomVisibility;
  isLocked: boolean;
  hostId: string;
  settings: GameSettings;
  players: ServerPlayerSeat[];
  kickedIps: string[];
  chat: ChatMessage[];
  gameState: GameState | null;
  createdAt: number;
  updatedAt: number;
}

export type PersistedRoomRecord = ServerRoomRecord;
