import type { CardDefinition } from './cards';
import type { DiceRollResult } from './game';

export type GameDomainEvent =
  | { type: 'DICE_ROLLED'; playerId: string; roll: DiceRollResult }
  | {
      type: 'PLAYER_MOVED';
      playerId: string;
      from: number;
      to: number;
      passedStart: boolean;
      startBonus: number;
    }
  | { type: 'PROPERTY_BOUGHT'; playerId: string; tileId: number; price: number }
  | { type: 'RENT_PAID'; fromPlayerId: string; toPlayerId: string; tileId: number; amount: number }
  | { type: 'BUILDING_CHANGED'; playerId: string; tileId: number; houses: number; delta: number }
  | { type: 'MORTGAGE_CHANGED'; playerId: string; tileId: number; mortgaged: boolean; amount: number }
  | { type: 'AUCTION_STARTED'; tileId: number; endsAt: number }
  | { type: 'AUCTION_BID'; playerId: string; tileId: number; amount: number; endsAt: number }
  | { type: 'AUCTION_ENDED'; tileId: number; winnerId: string | null; amount: number }
  | { type: 'CARD_DRAWN'; playerId: string; card: CardDefinition }
  | { type: 'SENT_TO_JAIL'; playerId: string; reason: string }
  | { type: 'RELEASED_FROM_JAIL'; playerId: string; method: 'BAIL' | 'CARD' | 'DOUBLES' | 'FORCED_BAIL' }
  | { type: 'TAX_PAID'; playerId: string; tileId: number; amount: number; addedToPot: boolean }
  | { type: 'VACATION_POT_WON'; playerId: string; amount: number }
  | { type: 'TRADE_UPDATED'; tradeId: string; status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'COUNTERED' }
  | { type: 'DEBT_REQUIRED'; debtorId: string; creditorId: string | null; amount: number; reason: string }
  | { type: 'PLAYER_BANKRUPT'; playerId: string; creditorId: string | null }
  | { type: 'TURN_CHANGED'; nextPlayerId: string; turnNumber: number }
  | { type: 'GAME_FINISHED'; winnerId: string };