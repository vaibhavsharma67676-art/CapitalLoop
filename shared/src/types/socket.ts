import type { TokenShapeId } from '../constants/tokens';
import type { GameAction } from './actions';
import type { GameDomainEvent } from './events';
import type { ClientGameState } from './game';
import type {
  BotDifficulty,
  ChatMessage,
  MatchmakingPreferences,
  MatchmakingStatusPayload,
  PrivateRoomSnapshot,
  RoomSessionCredentials,
} from './room';
import type { PartialGameSettings } from './settings';

export type SocketAck<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

export interface CreateRoomPayload {
  nickname: string;
  preferredColor?: string;
  preferredToken?: TokenShapeId;
  bots?: Array<{ difficulty: BotDifficulty; nickname?: string }>;
}

export interface JoinRoomPayload {
  roomCode: string;
  nickname: string;
  preferredColor?: string;
  preferredToken?: TokenShapeId;
}

export interface ReconnectRoomPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface UpdateProfilePayload {
  color?: string;
  tokenShape?: TokenShapeId;
}

export interface AuthEnvelope {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface RoomJoinedResponse {
  credentials: RoomSessionCredentials;
  room: PrivateRoomSnapshot;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: CreateRoomPayload,
    ack: (res: SocketAck<RoomJoinedResponse>) => void,
  ) => void;
  'room:join': (
    payload: JoinRoomPayload,
    ack: (res: SocketAck<RoomJoinedResponse>) => void,
  ) => void;
  'room:reconnect': (
    payload: ReconnectRoomPayload,
    ack: (res: SocketAck<{ room: PrivateRoomSnapshot }>) => void,
  ) => void;
  'room:leave': (
    payload: AuthEnvelope,
    ack: (res: SocketAck<{ left: true }>) => void,
  ) => void;
  'room:setReady': (
    payload: AuthEnvelope & { isReady: boolean },
    ack: (res: SocketAck<{ isReady: boolean }>) => void,
  ) => void;
  'room:updateProfile': (
    payload: AuthEnvelope & UpdateProfilePayload,
    ack: (res: SocketAck<{ updated: true }>) => void,
  ) => void;
  'room:updateSettings': (
    payload: AuthEnvelope & { settings: PartialGameSettings },
    ack: (res: SocketAck<{ updated: true }>) => void,
  ) => void;
  'room:toggleLock': (
    payload: AuthEnvelope & { isLocked: boolean },
    ack: (res: SocketAck<{ isLocked: boolean }>) => void,
  ) => void;
  'room:kickPlayer': (
    payload: AuthEnvelope & { targetPlayerId: string },
    ack: (res: SocketAck<{ kicked: true }>) => void,
  ) => void;
  'room:addBot': (
    payload: AuthEnvelope & { difficulty: BotDifficulty; nickname?: string },
    ack: (res: SocketAck<{ botId: string }>) => void,
  ) => void;
  'room:removeBot': (
    payload: AuthEnvelope & { botId: string },
    ack: (res: SocketAck<{ removed: true }>) => void,
  ) => void;
  'room:updateBotDifficulty': (
    payload: AuthEnvelope & { botId: string; difficulty: BotDifficulty },
    ack: (res: SocketAck<{ updated: true }>) => void,
  ) => void;
  'room:startGame': (
    payload: AuthEnvelope,
    ack: (res: SocketAck<{ started: true }>) => void,
  ) => void;
  'room:returnToLobby': (
    payload: AuthEnvelope,
    ack: (res: SocketAck<{ returned: true }>) => void,
  ) => void;
  'matchmaking:join': (
    payload: MatchmakingPreferences,
    ack: (res: SocketAck<MatchmakingStatusPayload>) => void,
  ) => void;
  'matchmaking:cancel': (
    ack: (res: SocketAck<{ cancelled: true }>) => void,
  ) => void;
  'game:action': (
    payload: AuthEnvelope & { action: GameAction },
    ack: (res: SocketAck<{ version: number }>) => void,
  ) => void;
  'chat:send': (
    payload: AuthEnvelope & { text: string },
    ack: (res: SocketAck<{ messageId: string }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: PrivateRoomSnapshot) => void;
  'game:state': (payload: {
    roomCode: string;
    gameState: ClientGameState;
    events: GameDomainEvent[];
  }) => void;
  'chat:message': (message: ChatMessage) => void;
  'room:kicked': (payload: { roomCode: string; reason: string }) => void;
  'room:error': (payload: { code: string; error: string }) => void;
  'matchmaking:status': (status: MatchmakingStatusPayload) => void;
  'matchmaking:matched': (payload: RoomJoinedResponse) => void;
}
