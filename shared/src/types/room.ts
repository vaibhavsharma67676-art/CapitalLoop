import type { TokenShapeId } from '../constants/tokens';
import type { MapId } from './board';
import type { ClientGameState } from './game';
import type { GameSettings, GameSpeed } from './settings';

export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';
export type RoomVisibility = 'PRIVATE' | 'PUBLIC_MATCH';

export const BOT_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

export interface DiscordUserProfile {
  id: string;
  username: string;
  globalName?: string | null;
  avatarUrl?: string | null;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  color: string;
  tokenShape: TokenShapeId;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
  isBot?: boolean;
  botDifficulty?: BotDifficulty | null;
  discordId?: string | null;
}

export interface ChatMessage {
  id: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface PrivateRoomSnapshot {
  roomCode: string;
  status: RoomStatus;
  visibility?: RoomVisibility;
  isLocked: boolean;
  hostId: string;
  settings: GameSettings;
  players: LobbyPlayer[];
  chat: ChatMessage[];
  gameState: ClientGameState | null;
  createdAt: number;
}

export interface RoomSessionCredentials {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  invitePath: string;
}

export interface MatchmakingPreferences {
  nickname: string;
  mapId: MapId;
  gameSpeed: GameSpeed;
  targetPlayers: number;
  preferredColor?: string;
  preferredToken?: TokenShapeId;
}

export interface MatchmakingStatusPayload {
  status: 'IDLE' | 'SEARCHING' | 'MATCHED' | 'CANCELLED';
  queueSize: number;
  targetPlayers: number;
  waitedSeconds: number;
  mapId: MapId;
  gameSpeed: GameSpeed;
}
