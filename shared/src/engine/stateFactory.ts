import { CHANCE_CARDS } from '../cards/chanceCards';
import { COMMUNITY_CARDS } from '../cards/communityCards';
import {
  BANK_HOTEL_SUPPLY,
  BANK_HOUSE_SUPPLY,
  MAX_LOG_ENTRIES,
  START_TILE_ID,
} from '../constants/limits';
import type { TokenShapeId } from '../constants/tokens';
import { getBoardMap } from '../maps/mapRegistry';
import { isPurchasableTile } from '../types/board';
import type {
  GameLogEntry,
  GameLogType,
  GameState,
  PlayerGameState,
  PropertyState,
} from '../types/game';
import type { BotDifficulty } from '../types/room';
import type { GameSettings } from '../types/settings';
import { createDefaultRng, type RngProvider, shuffleArray } from './rng';

export interface InitialPlayerSeed {
  id: string;
  nickname: string;
  color: string;
  tokenShape: TokenShapeId;
  isConnected: boolean;
  isBot?: boolean;
  botDifficulty?: BotDifficulty | null;
}

export interface CreateGameStateInput {
  roomCode: string;
  settings: GameSettings;
  players: InitialPlayerSeed[];
  rng?: RngProvider;
}

export function appendLog(
  state: GameState,
  rng: RngProvider,
  type: GameLogType,
  message: string,
  extra?: { actorId?: string; tileId?: number; amount?: number },
): void {
  const entry: GameLogEntry = {
    id: rng.nextId('log'),
    timestamp: rng.now(),
    type,
    message,
    ...extra,
  };
  state.log.push(entry);
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}

export function computeTurnDeadline(settings: GameSettings, now: number): number | null {
  if (settings.turnTimerSeconds <= 0) {
    return null;
  }
  const effectiveSeconds =
    settings.gameSpeed === 'FAST'
      ? Math.max(15, Math.round(settings.turnTimerSeconds * 0.7))
      : settings.turnTimerSeconds;
  return now + effectiveSeconds * 1000;
}

export function createInitialGameState(input: CreateGameStateInput): GameState {
  const rng = input.rng ?? createDefaultRng();
  const now = rng.now();
  const map = getBoardMap(input.settings.mapId);

  const turnOrder = shuffleArray(
    input.players.map((p) => p.id),
    rng,
  );

  const players: Record<string, PlayerGameState> = {};
  for (const seed of input.players) {
    players[seed.id] = {
      id: seed.id,
      nickname: seed.nickname,
      color: seed.color,
      tokenShape: seed.tokenShape,
      position: START_TILE_ID,
      cash: input.settings.startingCash,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      consecutiveDoubles: 0,
      isBankrupt: false,
      bankruptOrder: null,
      isConnected: seed.isConnected,
      isBot: Boolean(seed.isBot),
      botDifficulty: seed.isBot ? (seed.botDifficulty ?? 'MEDIUM') : null,
      stats: {
        rentCollected: 0,
        rentPaid: 0,
        propertiesBought: 0,
        tradesCompleted: 0,
        timesJailed: 0,
      },
    };
  }

  const properties: Record<number, PropertyState> = {};
  for (const tile of map.tiles) {
    if (isPurchasableTile(tile)) {
      properties[tile.id] = {
        tileId: tile.id,
        ownerId: null,
        houses: 0,
        mortgaged: false,
      };
    }
  }

  const chanceOrder = shuffleArray(
    CHANCE_CARDS.map((c) => c.id),
    rng,
  );
  const communityOrder = shuffleArray(
    COMMUNITY_CARDS.map((c) => c.id),
    rng,
  );

  const firstPlayerId = turnOrder[0];
  const firstPlayer = firstPlayerId ? players[firstPlayerId] : undefined;

  const state: GameState = {
    roomCode: input.roomCode,
    settings: { ...input.settings },
    phase: 'WAITING_FOR_ROLL',
    turnNumber: 1,
    currentPlayerIndex: 0,
    turnOrder,
    players,
    properties,
    lastDiceRoll: null,
    hasRolledThisTurn: false,
    extraTurnPending: false,
    vacationPot: 0,
    bankHousesRemaining: BANK_HOUSE_SUPPLY,
    bankHotelsRemaining: BANK_HOTEL_SUPPLY,
    pendingPurchaseTileId: null,
    pendingTax: null,
    pendingCard: null,
    pendingDebt: null,
    activeAuction: null,
    trades: [],
    decks: {
      chanceOrder,
      communityOrder,
      chanceJailCardHolderId: null,
      communityJailCardHolderId: null,
    },
    log: [],
    winnerId: null,
    rankings: [],
    turnStartedAt: now,
    turnDeadlineAt: computeTurnDeadline(input.settings, now),
    startedAt: now,
    finishedAt: null,
    version: 1,
  };

  appendLog(
    state,
    rng,
    'SYSTEM',
    `Game started on ${map.name}. ${firstPlayer?.nickname ?? 'Player 1'} rolls first.`,
    firstPlayer ? { actorId: firstPlayer.id } : undefined,
  );

  return state;
}
