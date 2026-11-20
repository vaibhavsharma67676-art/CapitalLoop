import type { ClientToServerEvents, ServerToClientEvents } from '@capitalloop/shared';
import { io, type Socket } from 'socket.io-client';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: TypedClientSocket | null = null;

export function getSocket(): TypedClientSocket {
  if (!socketInstance) {
    const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;
    socketInstance = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
  }
  return socketInstance;
}