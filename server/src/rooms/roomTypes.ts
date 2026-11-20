import type {
  ChatMessage,
  GameSettings,
  GameState,
  RoomStatus,
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
  /** SHA-256 hash of the player's secret session token */
  tokenHash: string;
  /** Current live Socket.IO connection ID (null while disconnected) */
  socketId: string | null;
  /** Client IP captured on create/join for kick enforcement */
  clientIp: string;
}

export interface ServerRoomRecord {
  roomCode: string;
  status: RoomStatus;
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