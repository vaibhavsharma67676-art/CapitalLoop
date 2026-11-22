import type {
  ClientToServerEvents,
  MatchmakingStatusPayload,
  RoomJoinedResponse,
  ServerToClientEvents,
  SocketAck,
} from '@capitalloop/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCapitalLoopServer, type CapitalLoopServerInstance } from '../../server/src/app';
import { loadServerConfig } from '../../server/src/config';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function emitAck<T>(socket: TestSocket, event: string, payload?: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    const emitter = socket as unknown as {
      emit: (...args: unknown[]) => void;
    };
    if (payload === undefined) {
      emitter.emit(event, resolve);
    } else {
      emitter.emit(event, payload, resolve);
    }
  });
}

describe('AI Bot Opponents & Public Quick Matchmaking', () => {
  let server: CapitalLoopServerInstance;
  let baseUrl = '';
  const openSockets: TestSocket[] = [];

  async function connectSocket(): Promise<TestSocket> {
    const socket: TestSocket = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    openSockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (err) => reject(err));
    });
    return socket;
  }

  beforeAll(async () => {
    const config = loadServerConfig({
      nodeEnv: 'test',
      port: 0,
      enablePersistence: false,
      clientOrigin: '*',
      matchmakingEnabled: true,
    });
    server = createCapitalLoopServer(config);
    await server.init();
    await new Promise<void>((resolve) => {
      server.httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.httpServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind test server');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    for (const s of openSockets) {
      s.disconnect();
    }
    await server.close();
  });

  it('allows host to add/remove bots, change difficulty, and start a mixed human + bot game', async () => {
    const hostSocket = await connectSocket();

    const created = await emitAck<RoomJoinedResponse>(hostSocket, 'room:create', {
      nickname: 'Vaibhav',
      bots: [{ difficulty: 'HARD' }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { roomCode, playerId, sessionToken } = created.data.credentials;
    expect(created.data.room.players.length).toBe(2);
    expect(created.data.room.players[1]?.isBot).toBe(true);
    expect(created.data.room.players[1]?.botDifficulty).toBe('HARD');

    // Add a second bot with EXPERT difficulty
    const added = await emitAck<{ botId: string }>(hostSocket, 'room:addBot', {
      roomCode,
      playerId,
      sessionToken,
      difficulty: 'EXPERT',
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    // Update second bot difficulty to EASY
    const updatedDiff = await emitAck(hostSocket, 'room:updateBotDifficulty', {
      roomCode,
      playerId,
      sessionToken,
      botId: added.data.botId,
      difficulty: 'EASY',
    });
    expect(updatedDiff.ok).toBe(true);

    // Start match immediately without needing guest human ready clicks
    const started = await emitAck(hostSocket, 'room:startGame', {
      roomCode,
      playerId,
      sessionToken,
    });
    expect(started.ok).toBe(true);

    const record = server.roomManager.getRoomRecord(roomCode);
    expect(record?.status).toBe('IN_GAME');
    expect(record?.gameState?.phase).toBe('WAITING_FOR_ROLL');
  });

  it('matches compatible Quick Match players into an isolated match room and supports cancel', async () => {
    const s1 = await connectSocket();
    const s2 = await connectSocket();
    const sCancel = await connectSocket();

    // sCancel joins queue then cancels
    const queuedCancel = await emitAck<MatchmakingStatusPayload>(sCancel, 'matchmaking:join', {
      nickname: 'TempWaiter',
      mapId: 'classic-metro',
      gameSpeed: 'FAST',
      targetPlayers: 2,
    });
    expect(queuedCancel.ok).toBe(true);

    const cancelled = await emitAck(sCancel, 'matchmaking:cancel');
    expect(cancelled.ok).toBe(true);

    // s1 enters queue for 2-player FAST classic-metro match
    const q1 = await emitAck<MatchmakingStatusPayload>(s1, 'matchmaking:join', {
      nickname: 'PlayerOne',
      mapId: 'classic-metro',
      gameSpeed: 'FAST',
      targetPlayers: 2,
    });
    expect(q1.ok).toBe(true);
    if (!q1.ok) return;
    expect(q1.data.status).toBe('SEARCHING');

    const matchedPromise = new Promise<RoomJoinedResponse>((resolve) => {
      s1.once('matchmaking:matched', (payload) => resolve(payload));
    });

    // s2 enters compatible queue -> triggers match formation and starts game
    const q2 = await emitAck<MatchmakingStatusPayload>(s2, 'matchmaking:join', {
      nickname: 'PlayerTwo',
      mapId: 'classic-metro',
      gameSpeed: 'FAST',
      targetPlayers: 2,
    });
    expect(q2.ok).toBe(true);

    const matchedPayload = await matchedPromise;
    expect(matchedPayload.room.visibility).toBe('PUBLIC_MATCH');
    expect(matchedPayload.room.status).toBe('IN_GAME');
    expect(matchedPayload.room.players.length).toBe(2);

    // Private room code cannot be used to hijack Quick Match room
    const hijack = await emitAck<RoomJoinedResponse>(sCancel, 'room:join', {
      roomCode: matchedPayload.room.roomCode,
      nickname: 'Intruder',
    });
    expect(hijack.ok).toBe(false);
  });
});
