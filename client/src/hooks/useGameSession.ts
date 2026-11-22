import {
  HOTEL_LEVEL,
  type BotDifficulty,
  type DiscordUserProfile,
  type GameAction,
  type GameDomainEvent,
  type MatchmakingPreferences,
  type MatchmakingStatusPayload,
  type PartialGameSettings,
  type PrivateRoomSnapshot,
  type RoomSessionCredentials,
  type SocketAck,
  type TokenShapeId,
} from '@capitalloop/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PUBLIC_CONFIG,
  fetchDiscordSession,
  fetchPublicConfig,
  logoutDiscordSession,
  type PublicAppConfig,
} from '../services/publicConfigService';
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
  matchmakingStatus: MatchmakingStatusPayload | null;
  publicConfig: PublicAppConfig;
  discordUser: DiscordUserProfile | null;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  createPrivateRoom: (
    nickname: string,
    options?: {
      preferredColor?: string;
      preferredToken?: TokenShapeId;
      bots?: Array<{ difficulty: BotDifficulty; nickname?: string }>;
    },
  ) => Promise<boolean>;
  joinPrivateRoom: (
    roomCode: string,
    nickname: string,
    options?: { preferredColor?: string; preferredToken?: TokenShapeId },
  ) => Promise<boolean>;
  startQuickMatch: (prefs: MatchmakingPreferences) => Promise<boolean>;
  cancelQuickMatch: () => Promise<void>;
  reconnectRoom: (creds: RoomSessionCredentials) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (isReady: boolean) => Promise<void>;
  updateProfile: (updates: { color?: string; tokenShape?: TokenShapeId }) => Promise<void>;
  updateSettings: (settings: PartialGameSettings) => Promise<void>;
  toggleLock: (isLocked: boolean) => Promise<void>;
  kickPlayer: (targetPlayerId: string) => Promise<void>;
  addBot: (difficulty: BotDifficulty, nickname?: string) => Promise<boolean>;
  removeBot: (botId: string) => Promise<boolean>;
  updateBotDifficulty: (botId: string, difficulty: BotDifficulty) => Promise<boolean>;
  startGame: () => Promise<void>;
  returnToLobby: () => Promise<void>;
  sendGameAction: (action: GameAction) => Promise<boolean>;
  sendChat: (text: string) => Promise<boolean>;
  disconnectDiscord: () => Promise<void>;
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
  const [matchmakingStatus, setMatchmakingStatus] = useState<MatchmakingStatusPayload | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig>(DEFAULT_PUBLIC_CONFIG);
  const [discordUser, setDiscordUser] = useState<DiscordUserProfile | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const credsRef = useRef<RoomSessionCredentials | null>(null);
  credsRef.current = credentials;
  const prevPlayerCountRef = useRef<number | null>(null);
  const actionInFlightRef = useRef<boolean>(false);

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

  // Load safe public config & optional Discord session on mount
  useEffect(() => {
    let active = true;
    void fetchPublicConfig().then((cfg) => {
      if (active) setPublicConfig(cfg);
    });
    void fetchDiscordSession().then((user) => {
      if (!active) return;
      setDiscordUser(user);
    });

    const params = new URLSearchParams(window.location.search);
    const discordFlag = params.get('discord');
    if (discordFlag === 'connected') {
      pushToast('success', 'Discord account connected!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (discordFlag === 'error') {
      pushToast('warning', 'Discord sign-in could not be completed.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      active = false;
    };
  }, [pushToast]);

  const playEventSounds = useCallback((events: GameDomainEvent[]) => {
    const myId = credsRef.current?.playerId;

    for (const ev of events) {
      switch (ev.type) {
        case 'DICE_ROLLED':
          soundService.play('diceRoll');
          setIsRollingDice(true);
          window.setTimeout(() => {
            setIsRollingDice(false);
            soundService.play('diceLand');
          }, 480);
          break;
        case 'PLAYER_MOVED':
          if (ev.passedStart && ev.startBonus > 0) {
            soundService.play('moneyReceive');
          }
          break;
        case 'PROPERTY_BOUGHT':
          soundService.play('buy');
          break;
        case 'RENT_PAID':
          if (myId && ev.toPlayerId === myId) {
            soundService.play('moneyReceive');
          } else {
            soundService.play('rent');
          }
          break;
        case 'BUILDING_CHANGED':
          if (ev.delta > 0) {
            soundService.play(ev.houses >= HOTEL_LEVEL ? 'hotelBuild' : 'houseBuild');
          } else {
            soundService.play('moneyReceive');
          }
          break;
        case 'MORTGAGE_CHANGED':
          soundService.play(ev.mortgaged ? 'mortgage' : 'unmortgage');
          break;
        case 'AUCTION_STARTED':
        case 'AUCTION_BID':
          soundService.play('auctionBid');
          break;
        case 'AUCTION_ENDED':
          if (ev.winnerId) {
            soundService.play('auctionWin');
          }
          break;
        case 'CARD_DRAWN':
          soundService.play(ev.card.deck === 'CHANCE' ? 'surpriseCard' : 'treasuryCard');
          break;
        case 'SENT_TO_JAIL':
          soundService.play('jailEnter');
          break;
        case 'RELEASED_FROM_JAIL':
          soundService.play('jailExit');
          break;
        case 'TAX_PAID':
          soundService.play('moneyDeduct');
          break;
        case 'VACATION_POT_WON':
          soundService.play('moneyReceive');
          break;
        case 'TRADE_UPDATED':
          if (ev.status === 'ACCEPTED') {
            soundService.play('tradeAccept');
          } else if (ev.status === 'REJECTED' || ev.status === 'CANCELLED') {
            soundService.play('tradeReject');
          } else {
            soundService.play('tradePropose');
          }
          break;
        case 'PLAYER_BANKRUPT':
          soundService.play('bankrupt');
          break;
        case 'GAME_FINISHED':
          soundService.play('victory');
          break;
        default:
          break;
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
              prevPlayerCountRef.current = null;
              pushToast('warning', res.error);
              resolve(false);
              return;
            }
            saveRoomCredentials(creds);
            setCredentials(creds);
            setSavedReconnectCreds(creds);
            setMatchmakingStatus(null);
            prevPlayerCountRef.current = res.data.room.players.length;
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
      setMatchmakingStatus(null);
    };

    const onRoomState = (snapshot: PrivateRoomSnapshot) => {
      if (prevPlayerCountRef.current !== null) {
        if (snapshot.players.length > prevPlayerCountRef.current) {
          soundService.play('playerJoin');
        } else if (snapshot.players.length < prevPlayerCountRef.current) {
          soundService.play('playerLeave');
        }
      }
      prevPlayerCountRef.current = snapshot.players.length;
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
      prevPlayerCountRef.current = null;
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

    const onMatchmakingStatus = (status: MatchmakingStatusPayload) => {
      if (status.status === 'CANCELLED' || status.status === 'IDLE') {
        setMatchmakingStatus(null);
      } else {
        setMatchmakingStatus(status);
      }
    };

    const onMatchmakingMatched = (payload: {
      credentials: RoomSessionCredentials;
      room: PrivateRoomSnapshot;
    }) => {
      saveRoomCredentials(payload.credentials);
      setCredentials(payload.credentials);
      setSavedReconnectCreds(payload.credentials);
      setMatchmakingStatus(null);
      prevPlayerCountRef.current = payload.room.players.length;
      setRoom(payload.room);
      window.history.replaceState({}, '', `/room/${payload.credentials.roomCode}`);
      soundService.play('playerJoin');
      pushToast('success', 'Quick Match found! Game starting...');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('game:state', onGameState);
    socket.on('chat:message', onChatMessage);
    socket.on('room:kicked', onKicked);
    socket.on('room:error', onRoomError);
    socket.on('matchmaking:status', onMatchmakingStatus);
    socket.on('matchmaking:matched', onMatchmakingMatched);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('game:state', onGameState);
      socket.off('chat:message', onChatMessage);
      socket.off('room:kicked', onKicked);
      socket.off('room:error', onRoomError);
      socket.off('matchmaking:status', onMatchmakingStatus);
      socket.off('matchmaking:matched', onMatchmakingMatched);
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
      options?: {
        preferredColor?: string;
        preferredToken?: TokenShapeId;
        bots?: Array<{ difficulty: BotDifficulty; nickname?: string }>;
      },
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
            bots: options?.bots,
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
            setMatchmakingStatus(null);
            prevPlayerCountRef.current = res.data.room.players.length;
            setRoom(res.data.room);
            window.history.replaceState({}, '', `/room/${res.data.credentials.roomCode}`);
            soundService.play('playerJoin');
            pushToast('success', `Room ${res.data.credentials.roomCode} created.`);
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
            setMatchmakingStatus(null);
            prevPlayerCountRef.current = res.data.room.players.length;
            setRoom(res.data.room);
            window.history.replaceState({}, '', `/room/${res.data.credentials.roomCode}`);
            soundService.play('playerJoin');
            pushToast('success', `Joined room ${res.data.credentials.roomCode}.`);
            resolve(true);
          },
        );
      });
    },
    [pushToast, reconnectRoom, socket],
  );

  const startQuickMatch = useCallback(
    async (prefs: MatchmakingPreferences): Promise<boolean> => {
      setIsBusy(true);
      saveNickname(prefs.nickname.trim());
      return new Promise<boolean>((resolve) => {
        socket.emit(
          'matchmaking:join',
          { ...prefs, nickname: prefs.nickname.trim() },
          (res) => {
            setIsBusy(false);
            if (!res.ok) {
              soundService.play('error');
              pushToast('error', res.error);
              resolve(false);
              return;
            }
            if (res.data.status === 'SEARCHING') {
              setMatchmakingStatus(res.data);
            }
            resolve(true);
          },
        );
      });
    },
    [pushToast, socket],
  );

  const cancelQuickMatch = useCallback(async () => {
    await new Promise<void>((resolve) => {
      socket.emit('matchmaking:cancel', () => {
        setMatchmakingStatus(null);
        resolve();
      });
    });
  }, [socket]);

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
        prevPlayerCountRef.current = null;
        window.history.replaceState({}, '', '/');
        soundService.play('playerLeave');
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
            pushToast('info', 'Player removed from room.');
          }
          resolve();
        });
      });
    },
    [handleAckError, pushToast, requireAuth, socket],
  );

  const addBot = useCallback(
    async (difficulty: BotDifficulty, nickname?: string): Promise<boolean> => {
      const auth = requireAuth();
      if (!auth) return false;
      return new Promise<boolean>((resolve) => {
        socket.emit('room:addBot', { ...auth, difficulty, nickname }, (res) => {
          resolve(handleAckError(res));
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  const removeBot = useCallback(
    async (botId: string): Promise<boolean> => {
      const auth = requireAuth();
      if (!auth) return false;
      return new Promise<boolean>((resolve) => {
        socket.emit('room:removeBot', { ...auth, botId }, (res) => {
          resolve(handleAckError(res));
        });
      });
    },
    [handleAckError, requireAuth, socket],
  );

  const updateBotDifficulty = useCallback(
    async (botId: string, difficulty: BotDifficulty): Promise<boolean> => {
      const auth = requireAuth();
      if (!auth) return false;
      return new Promise<boolean>((resolve) => {
        socket.emit('room:updateBotDifficulty', { ...auth, botId, difficulty }, (res) => {
          resolve(handleAckError(res));
        });
      });
    },
    [handleAckError, requireAuth, socket],
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
      if (!auth || actionInFlightRef.current) return false;
      actionInFlightRef.current = true;
      return new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          actionInFlightRef.current = false;
          pushToast('warning', 'Action timed out. Syncing with server...');
          resolve(false);
        }, 8000);

        socket.emit('game:action', { ...auth, action }, (res) => {
          window.clearTimeout(timeoutId);
          actionInFlightRef.current = false;
          resolve(handleAckError(res));
        });
      });
    },
    [handleAckError, pushToast, requireAuth, socket],
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

  const disconnectDiscord = useCallback(async () => {
    const ok = await logoutDiscordSession();
    if (ok) {
      setDiscordUser(null);
      pushToast('info', 'Discord account disconnected.');
    }
  }, [pushToast]);

  return {
    isConnected,
    isBusy,
    isRollingDice,
    room,
    credentials,
    savedReconnectCreds,
    matchmakingStatus,
    publicConfig,
    discordUser,
    toasts,
    dismissToast,
    pushToast,
    createPrivateRoom,
    joinPrivateRoom,
    startQuickMatch,
    cancelQuickMatch,
    reconnectRoom,
    leaveRoom,
    setReady,
    updateProfile,
    updateSettings,
    toggleLock,
    kickPlayer,
    addBot,
    removeBot,
    updateBotDifficulty,
    startGame,
    returnToLobby,
    sendGameAction,
    sendChat,
    disconnectDiscord,
  };
}
