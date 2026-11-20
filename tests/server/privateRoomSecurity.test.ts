import type {
  ClientToServerEvents,
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

describe('Strict Private Room Access & Security Controls', () => {
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

  it('exposes NO public room listing or matchmaking endpoints', async () => {
    const resRooms = await fetch(`${baseUrl}/api/rooms`);
    expect(resRooms.status).toBe(404);

    const resMatch = await fetch(`${baseUrl}/api/matchmaking`);
    expect(resMatch.status).toBe(404);

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    const body = (await health.json()) as { mode: string };
    expect(body.mode).toBe('private-rooms-only');
  });

  it('generates a 5-char private code, enforces room lock, blocks unauthorized active-game joins, and blocks forged tokens', async () => {
    const hostSocket = await connectSocket();
    const guestSocket = await connectSocket();
    const intruderSocket = await connectSocket();

    // 1. Host creates private room
    const created = await emitAck<RoomJoinedResponse>(hostSocket, 'room:create', {
      nickname: 'HostVaibhav',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { roomCode, playerId: hostId, sessionToken: hostToken } = created.data.credentials;
    expect(roomCode).toMatch(/^[A-Z2-9]{5}$/);

    // 2. Host locks room -> guest cannot join
    const locked = await emitAck(hostSocket, 'room:toggleLock', {
      roomCode,
      playerId: hostId,
      sessionToken: hostToken,
      isLocked: true,
    });
    expect(locked.ok).toBe(true);

    const blockedJoin = await emitAck<RoomJoinedResponse>(guestSocket, 'room:join', {
      roomCode,
      nickname: 'FriendOne',
    });
    expect(blockedJoin.ok).toBe(false);
    if (!blockedJoin.ok) expect(blockedJoin.code).toBe('ROOM_LOCKED');

    // 3. Host unlocks -> guest joins -> sets ready -> host starts game
    await emitAck(hostSocket, 'room:toggleLock', {
      roomCode,
      playerId: hostId,
      sessionToken: hostToken,
      isLocked: false,
    });

    const joined = await emitAck<RoomJoinedResponse>(guestSocket, 'room:join', {
      roomCode,
      nickname: 'FriendOne',
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    await emitAck(guestSocket, 'room:setReady', {
      roomCode,
      playerId: joined.data.credentials.playerId,
      sessionToken: joined.data.credentials.sessionToken,
      isReady: true,
    });

    const started = await emitAck(hostSocket, 'room:startGame', {
      roomCode,
      playerId: hostId,
      sessionToken: hostToken,
    });
    expect(started.ok).toBe(true);

    // 4. Stranger attempting to join active private game is rejected
    const activeJoin = await emitAck<RoomJoinedResponse>(intruderSocket, 'room:join', {
      roomCode,
      nickname: 'Stranger',
    });
    expect(activeJoin.ok).toBe(false);
    if (!activeJoin.ok) expect(activeJoin.code).toBe('ROOM_IN_GAME');

    // 5. Intruder sending game:action with forged token is rejected
    const forgedAction = await emitAck(intruderSocket, 'game:action', {
      roomCode,
      playerId: hostId,
      sessionToken: 'f'.repeat(64),
      action: { type: 'ROLL_DICE' },
    });
    expect(forgedAction.ok).toBe(false);
    if (!forgedAction.ok) expect(forgedAction.code).toBe('UNAUTHORIZED');
  });
});