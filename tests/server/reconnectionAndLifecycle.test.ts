import type {
  ClientToServerEvents,
  PrivateRoomSnapshot,
  RoomJoinedResponse,
  ServerToClientEvents,
  SocketAck,
} from '@capitalloop/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCapitalLoopServer, type CapitalLoopServerInstance } from '../../server/src/app';
import { loadServerConfig } from '../../server/src/config';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function emitAck<T>(socket: TestSocket, event: string, payload: unknown): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    (socket as unknown as { emit: (e: string, p: unknown, cb: (r: SocketAck<T>) => void) => void }).emit(
      event,
      payload,
      resolve,
    );
  });
}

describe('Private Room Reconnection & Synchronized Gameplay Lifecycle', () => {
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

  it('reconnects a disconnected player securely using their issued sessionToken and syncs live game state', async () => {
    const hostSocket = await connectSocket();
    const guestSocket1 = await connectSocket();

    const created = await emitAck<RoomJoinedResponse>(hostSocket, 'room:create', {
      nickname: 'HostOne',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { roomCode, playerId: hostId, sessionToken: hostToken } = created.data.credentials;

    const joined = await emitAck<RoomJoinedResponse>(guestSocket1, 'room:join', {
      roomCode,
      nickname: 'GuestTwo',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const { playerId: guestId, sessionToken: guestToken } = joined.data.credentials;

    // Guest marks ready and host starts the match
    await emitAck(guestSocket1, 'room:setReady', {
      roomCode,
      playerId: guestId,
      sessionToken: guestToken,
      isReady: true,
    });

    const roomStatePromise = new Promise<PrivateRoomSnapshot>((resolve) => {
      guestSocket1.once('room:state', (snap) => {
        if (snap.status === 'IN_GAME') resolve(snap);
      });
    });

    const started = await emitAck(hostSocket, 'room:startGame', {
      roomCode,
      playerId: hostId,
      sessionToken: hostToken,
    });
    expect(started.ok).toBe(true);

    const startedSnap = await roomStatePromise;
    expect(startedSnap.status).toBe('IN_GAME');
    expect(startedSnap.gameState?.players[guestId]?.isConnected).toBe(true);

    // Guest drops connection
    guestSocket1.disconnect();
    await new Promise((r) => setTimeout(r, 80));

    // Reconnect attempt with invalid token must fail
    const badReconnectSocket = await connectSocket();
    const badRes = await emitAck<{ room: PrivateRoomSnapshot }>(
      badReconnectSocket,
      'room:reconnect',
      {
        roomCode,
        playerId: guestId,
        sessionToken: '0'.repeat(64),
      },
    );
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) expect(badRes.code).toBe('UNAUTHORIZED');

    // Reconnect with genuine sessionToken restores seat and full synchronized state
    const guestSocket2 = await connectSocket();
    const restored = await emitAck<{ room: PrivateRoomSnapshot }>(
      guestSocket2,
      'room:reconnect',
      {
        roomCode,
        playerId: guestId,
        sessionToken: guestToken,
      },
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    expect(restored.data.room.status).toBe('IN_GAME');
    expect(restored.data.room.gameState?.players[guestId]?.isConnected).toBe(true);
  });
});