import type { TokenShapeId } from '../constants/tokens';
import type { DrawnCardState } from './cards';
import type { BotDifficulty } from './room';
import type { GameSettings } from './settings';

export type GamePhase =
  | 'WAITING_FOR_ROLL'
  | 'AWAITING_BUY_DECISION'
  | 'AUCTION_ACTIVE'
  | 'TAX_DECISION'
  | 'CARD_REVEAL'
  | 'DEBT_RESOLUTION'
  | 'POST_ROLL_ACTIONS'
  | 'GAME_OVER';

export interface PropertyState {
  tileId: number;
  ownerId: string | null;
  /** 0..4 = houses, 5 = hotel */
  houses: number;
  mortgaged: boolean;
}

export interface PlayerStats {
  rentCollected: number;
  rentPaid: number;
  propertiesBought: number;
  tradesCompleted: number;
  timesJailed: number;
}

export interface PlayerGameState {
  id: string;
  nickname: string;
  color: string;
  tokenShape: TokenShapeId;
  position: number;
  cash: number;
  inJail: boolean;
  jailTurns: number;
  jailFreeCards: number;
  consecutiveDoubles: number;
  isBankrupt: boolean;
  bankruptOrder: number | null;
  isConnected: boolean;
  isBot?: boolean;
  botDifficulty?: BotDifficulty | null;
  stats: PlayerStats;
}

export interface DiceRollResult {
  die1: number;
  die2: number;
  total: number;
  isDoubles: boolean;
}

export interface PendingDebt {
  debtorId: string;
  /** null means owed to the Bank (or Vacation pot) */
  creditorId: string | null;
  amount: number;
  reason: string;
  addToVacationPot: boolean;
  resumePhase: GamePhase;
  grantExtraTurnOnResolve: boolean;
}

export interface AuctionBidEntry {
  playerId: string;
  amount: number;
  timestamp: number;
}

export interface AuctionState {
  tileId: number;
  startedAt: number;
  endsAt: number;
  currentBid: number;
  highestBidderId: string | null;
  eligiblePlayerIds: string[];
  passedPlayerIds: string[];
  bidHistory: AuctionBidEntry[];
  resumePhase: GamePhase;
  grantExtraTurnOnResolve: boolean;
}

export interface TradeOfferItem {
  cash: number;
  propertyIds: number[];
  jailFreeCards: number;
}

export type TradeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'COUNTERED';

export interface TradeOffer {
  id: string;
  proposerId: string;
  recipientId: string;
  offered: TradeOfferItem;
  requested: TradeOfferItem;
  status: TradeStatus;
  createdAt: number;
  parentTradeId: string | null;
}

export interface PendingTaxState {
  playerId: string;
  tileId: number;
  flatAmount: number;
  percentAmount: number;
  grantExtraTurnOnResolve: boolean;
}

export type GameLogType =
  | 'SYSTEM'
  | 'ROLL'
  | 'MOVE'
  | 'PURCHASE'
  | 'RENT'
  | 'BUILD'
  | 'MORTGAGE'
  | 'AUCTION'
  | 'TRADE'
  | 'CARD'
  | 'JAIL'
  | 'TAX'
  | 'BANKRUPTCY'
  | 'VICTORY';

export interface GameLogEntry {
  id: string;
  timestamp: number;
  type: GameLogType;
  message: string;
  actorId?: string;
  tileId?: number;
  amount?: number;
}

export interface DeckState {
  chanceOrder: string[];
  communityOrder: string[];
  chanceJailCardHolderId: string | null;
  communityJailCardHolderId: string | null;
}

export interface PlayerRanking {
  playerId: string;
  nickname: string;
  color: string;
  rank: number;
  netWorth: number;
  cash: number;
  isBankrupt: boolean;
  isBot?: boolean;
  propertiesOwned: number;
}

export interface GameState {
  roomCode: string;
  settings: GameSettings;
  phase: GamePhase;
  turnNumber: number;
  currentPlayerIndex: number;
  turnOrder: string[];
  players: Record<string, PlayerGameState>;
  properties: Record<number, PropertyState>;
  lastDiceRoll: DiceRollResult | null;
  hasRolledThisTurn: boolean;
  extraTurnPending: boolean;
  vacationPot: number;
  bankHousesRemaining: number;
  bankHotelsRemaining: number;
  pendingPurchaseTileId: number | null;
  pendingTax: PendingTaxState | null;
  pendingCard: DrawnCardState | null;
  pendingDebt: PendingDebt | null;
  activeAuction: AuctionState | null;
  trades: TradeOffer[];
  decks: DeckState;
  log: GameLogEntry[];
  winnerId: string | null;
  rankings: PlayerRanking[];
  turnStartedAt: number;
  turnDeadlineAt: number | null;
  startedAt: number;
  finishedAt: number | null;
  version: number;
}

export interface ClientGameState extends Omit<GameState, 'decks'> {
  deckCounts: {
    chanceRemaining: number;
    communityRemaining: number;
  };
}
