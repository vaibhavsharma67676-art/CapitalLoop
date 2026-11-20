import type {
  GameAction,
  GameDomainEvent,
  PartialGameSettings,
  PrivateRoomSnapshot,
  RoomSessionCredentials,
  SocketAck,
  TokenShapeId,
} from '@capitalloop/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearRoomCredentials,
  loadLastRoomCredentials,
  loadRoomCredentials,
  saveNickname,
  saveRoomCredentials,
} from '../services/sessionStorage';
import { getSocket } from '../services/socketClient';
import { soundService } from '../services/soundService';
import type { ToastItem, ToastKind } from '../types/ui';

export interface GameSessionController {
  isConnected: boolean;
  isBusy: boolean;
  isRollingDice: boolean;
  room: PrivateRoomSnapshot | null;
  credentials: RoomSessionCredentials | null;
  savedReconnectCreds: RoomSessionCredentials | null;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  createPrivateRoom: (
    nickname: string,
    options?: { preferredColor?: string; preferredToken?: TokenShapeId },
  ) => Promise<boolean>;
  joinPrivateRoom: (
    roomCode: string,
    nickname: string,
    options?: { preferredColor?: string; preferredToken?: TokenShapeId },
  ) => Promise<boolean>;
  reconnectRoom: (creds: RoomSessionCredentials) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (isReady: boolean) => Promise<void>;
  updateProfile: (updates: { color?: string; tokenShape?: TokenShapeId }) => Promise<void>;
  updateSettings: (settings: PartialGameSettings) => Promise<void>;
  toggleLock: (isLocked: boolean) => Promise<void>;
  kickPlayer: (targetPlayerId: string) => Promise<void>;
  startGame: () => Promise<void>;
  returnToLobby: () => Promise<void>;
  sendGameAction: (action: GameAction) => Promise<boolean>;
  sendChat: (text: string) => Promise<boolean>;
}

export function useGameSession(): GameSessionController {
  const socket = getSocket();
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isRollingDice, setIsRollingDice] = useState<boolean>(false);
  const [room, setRoom] = useState<PrivateRoomSnapshot | null>(null);
  const [credentials, setCredentials] = useState<RoomSessionCredentials | null>(null);
  const [savedReconnectCreds, setSavedReconnectCreds] = useState<RoomSessionCredentials | null>(
    () => loadLastRoomCredentials(),
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const credsRef = useRef<RoomSessionCredentials | null>(null);
  credsRef.current = credentials;

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const playEventSounds = useCallback((events: GameDomainEvent[]) => {
    for (const ev of events) {
      if (ev.type === 'DICE_ROLLED') {
        soundService.play('dice');
        setIsRollingDice(true);
        window.setTimeout(() => setIsRollingDice(false), 520);
      } else if (ev.type === 'PROPERTY_BOUGHT') {
        soundService.play('buy');
      } else if (ev.type === 'RENT_PAID') {
        soundService.play('rent');
      } else if (ev.type === 'CARD_DRAWN') {
        soundService.play('card');
      } else if (ev.type === 'SENT_TO_JAIL') {
        soundService.play('jail');
      } else if (ev.type === 'AUCTION_STARTED' || ev.type === 'AUCTION_BID') {
        soundService.play('auction');
      } else if (ev.type === 'GAME_FINISHED') {
        soundService.play('victory');
      }
    }
  }, []);

  const reconnectRoom = useCallback(
    async (creds: RoomSessionCredentials): Promise<boolean> => {
      setIsBusy(true);
      return new Promise<boolean>((resolve) => {
        socket.emit(
          'room:reconnect',
          {
            roomCode: creds.roomCode,
            playerId: creds.playerId,
            sessionToken: creds.sessionToken,
          },
          (res) => {
            setIsBusy(false);
            if (!res.ok) {
              clearRoomCredentials(creds.roomCode);
              setSavedReconnectCreds(null);
              setCredentials(null);
              setRoom(null);
              pushToast('warning', res.error);
              resolve(false);
              return;
            }
            saveRoomCredentials(creds);
            setCredentials(creds);
            setSavedReconnectCreds(creds);
            setRoom(res.data.room);
            resolve(true);
          },
        );
      });
    },
    [pushToast, socket],
  );

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      if (credsRef.current) {
        void reconnectRoom(credsRef.current);
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onRoomState = (snapshot: PrivateRoomSnapshot) => {
      setRoom(snapshot);
    };

    const onGameState = (payload: {
      roomCode: string;
      gameState: PrivateRoomSnapshot['gameState'];
      events: GameDomainEvent[];
    }) => {
      setRoom((prev) => {
        if (!prev || prev.roomCode !== payload.roomCode) return prev;
        return {
          ...prev,
          status: payload.gameState?.phase === 'GAME_OVER' ? 'FINISHED' : 'IN_GAME',
          gameState: payload.gameState,
        };
      });
      playEventSounds(payload.events);
    };

    const onChatMessage = (message: PrivateRoomSnapshot['chat'][number]) => {
      setRoom((prev) => {
        if (!prev || prev.roomCode !== message.roomCode) return prev;
        if (prev.chat.some((m) => m.id === message.id)) return prev;
        return { ...prev, chat: [...prev.chat, message] };
      });
    };

    const onKicked = (payload: { roomCode: string; reason: string }) => {
      clearRoomCredentials(payload.roomCode);
      setCredentials(null);
      setSavedReconnectCreds(null);
      setRoom(null);
      soundService.play('error');
      pushToast('error', payload.reason);
      if (window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
    };

    const onRoomError = (payload: { code: string; error: string }) => {
      soundService.play('error');
      pushToast('error', payload.error);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('game:state', onGameState);
    socket.on('chat:message', onChatMessage);
    socket.on('room:kicked', onKicked);
    socket.on('room:error', onRoomError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('game:state', onGameState);
      socket.off('chat:message', onChatMessage);
      socket.off('room:kicked', onKicked);
      socket.off('room:error', onRoomError);
    };
  }, [playEventSounds, pushToast, reconnectRoom, socket]);

  // Auto-reconnect if browser URL is /room/:code and matching credentials exist
  useEffect(() => {
    const match = window.location.pathname.match(/^\/(?:room|join)\/([A-Za-z0-9]{5})$/i);
    if (match && match[1]) {
      const existing = loadRoomCredentials(match[1].toUpperCase());
      if (existing && !credsRef.current) {
        void reconnectRoom(existing);
      }
    }
  }, [reconnectRoom]);

  const createPrivateRoom = useCallback(
    async (
      nickname: string,
      options?: { preferredColor?: string; preferredToken?: TokenShapeId },
    ): Promise<boolean> => {
      setIsBusy(true);
      saveNickname(nickname.trim());
      return new Promise<boolean>((resolve) => {
        socket.emit(
          'room:create',
          {
            nickname: nickname.trim(),
            preferredColor: options?.preferredColor,
            preferredToken: options?.preferredToken,
          },
          (res) => {
            setIsBusy(false);
            if (!res.ok) {
              soundService.play('error');
              pushToast('error', res.error);
              resolve(false);
              return;
            }
            saveRoomCredentials(res.data.credentials);
            setCredentials(res.data.credentials);
            setSavedReconnectCreds(res.data.credentials);
            setRoom(res.data.room);
            window.history.replaceState({}, '', `/room/${res.data.credentials.roomCode}`);
            pushToast('success', `Private room ${res.data.credentials.roomCode} created.`);
            resolve(true);
          },
        );
      });
    },
    [pushToast, socket],
  );

  const joinPrivateRoom = useCallback(
    async (
      roomCode: string,
      nickname: string,
      options?: { preferredColor?: string; preferredToken?: TokenShapeId },
    ): Promise<boolean> => {
      const normalized = roomCode.trim().toUpperCase();
      // If the user already owns a seat in this private room, reconnect securely instead of duplicating
      const existing = loadRoomCredentials(normalized);
      if (existing) {
        const reconnected = await reconnectRoom(existing);
        if (reconnected) {
          window.history.replaceState({}, '', `/room/${normalized}`);
          return true;
        }
      }

      setIsBusy(true);
      saveNickname(nickname.trim());
      return new Promise<boolean>((resolve) => {
        socket.emit(
          'room:join',
          {
            roomCode: normalized,
            nickname: nickname.trim(),
            preferredColor: options?.preferredColor,
            preferredToken: options?.preferredToken,
          },
          (res) => {
            setIsBusy(false);
            if (!res.ok) {
              soundService.play('error');
              pushToast('error', res.error);
              resolve(false);
              return;
            }
            saveRoomCredentials(res.data.credentials);
            setCredentials(res.data.credentials);
            setSavedReconnectCreds(res.data.credentials);
            setRoom(res.data.room);
            window.history.replaceState({}, '', `/room/${res.data.credentials.roomCode}`);
            pushToast('success', `Joined private room ${res.data.credentials.roomCode}.`);
            resolve(true);
          },
        );
      });
    },
    [pushToast, reconnectRoom, socket],
  );

  const requireAuth = useCallback(() => {
    const creds = credsRef.current;
    if (!creds) {
      pushToast('error', 'No active room session.');
      return null;
    }
    return {
      roomCode: creds.roomCode,
      playerId: creds.playerId,
      sessionToken: creds.sessionToken,
    };
  }, [pushToast]);

  const handleAckError = useCallback(
    (res: SocketAck<unknown>) => {
      if (!res.ok) {
        soundService.play('error');
        pushToast('error', res.error);
        return false;
      }
      return true;
    },
    [pushToast],
  );

  const leaveRoom = useCallback(async () => {
    const auth = requireAuth();
    if (!auth) return;
    await new Promise<void>((resolve) => {
      socket.emit('room:leave', auth, () => {
        clearRoomCredentials(auth.roomCode);
        setCredentials(null);
        setSavedReconnectCreds(null);
        setRoom(null);
        window.history.replaceState({}, '', '/');
        resolve();
      });
    });
  }, [requireAuth, socket]);

  const setReady = useCallback(
    async (isReady: boolean) => {
      const auth = requireAuth();
      if (!auth) return;
      await new Promise<void>((resolve) => {
        socket.emit('room:setReady', { ...auth, isReady }, (res) => {
          handleAckError(res);
          resolve();
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  const updateProfile = useCallback(
    async (updates: { color?: string; tokenShape?: TokenShapeId }) => {
      const auth = requireAuth();
      if (!auth) return;
      await new Promise<void>((resolve) => {
        socket.emit('room:updateProfile', { ...auth, ...updates }, (res) => {
          handleAckError(res);
          resolve();
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  const updateSettings = useCallback(
    async (settings: PartialGameSettings) => {
      const auth = requireAuth();
      if (!auth) return;
      await new Promise<void>((resolve) => {
        socket.emit('room:updateSettings', { ...auth, settings }, (res) => {
          handleAckError(res);
          resolve();
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  const toggleLock = useCallback(
    async (isLocked: boolean) => {
      const auth = requireAuth();
      if (!auth) return;
      await new Promise<void>((resolve) => {
        socket.emit('room:toggleLock', { ...auth, isLocked }, (res) => {
          if (handleAckError(res)) {
            pushToast('info', isLocked ? 'Private room locked.' : 'Private room unlocked.');
          }
          resolve();
        });
      });
    },
    [handleAckError, pushToast, requireAuth, socket],
  );

  const kickPlayer = useCallback(
    async (targetPlayerId: string) => {
      const auth = requireAuth();
      if (!auth) return;
      await new Promise<void>((resolve) => {
        socket.emit('room:kickPlayer', { ...auth, targetPlayerId }, (res) => {
          if (handleAckError(res)) {
            pushToast('info', 'Player removed from private room.');
          }
          resolve();
        });
      });
    },
    [handleAckError, pushToast, requireAuth, socket],
  );

  const startGame = useCallback(async () => {
    const auth = requireAuth();
    if (!auth) return;
    await new Promise<void>((resolve) => {
      socket.emit('room:startGame', auth, (res) => {
        handleAckError(res);
        resolve();
      });
    });
  }, [handleAckError, requireAuth, socket]);

  const returnToLobby = useCallback(async () => {
    const auth = requireAuth();
    if (!auth) return;
    await new Promise<void>((resolve) => {
      socket.emit('room:returnToLobby', auth, (res) => {
        handleAckError(res);
        resolve();
      });
    });
  }, [handleAckError, requireAuth, socket]);

  const sendGameAction = useCallback(
    async (action: GameAction): Promise<boolean> => {
      const auth = requireAuth();
      if (!auth) return false;
      return new Promise<boolean>((resolve) => {
        socket.emit('game:action', { ...auth, action }, (res) => {
          resolve(handleAckError(res));
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  const sendChat = useCallback(
    async (text: string): Promise<boolean> => {
      const auth = requireAuth();
      if (!auth) return false;
      return new Promise<boolean>((resolve) => {
        socket.emit('chat:send', { ...auth, text }, (res) => {
          resolve(handleAckError(res));
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  return {
    isConnected,
    isBusy,
    isRollingDice,
    room,
    credentials,
    savedReconnectCreds,
    toasts,
    dismissToast,
    pushToast,
    createPrivateRoom,
    joinPrivateRoom,
    reconnectRoom,
    leaveRoom,
    setReady,
    updateProfile,
    updateSettings,
    toggleLock,
    kickPlayer,
    startGame,
    returnToLobby,
    sendGameAction,
    sendChat,
  };
}