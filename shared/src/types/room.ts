import type { TokenShapeId } from '../constants/tokens';
import type { ClientGameState } from './game';
import type { GameSettings } from './settings';

export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';

export interface LobbyPlayer {
  id: string;
  nickname: string;
  color: string;
  tokenShape: TokenShapeId;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
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