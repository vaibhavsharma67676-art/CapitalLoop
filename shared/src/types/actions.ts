import type { GameDomainEvent } from './events';
import type { GameState, TradeOfferItem } from './game';

export type GameAction =
  | { type: 'ROLL_DICE' }
  | { type: 'BUY_PROPERTY' }
  | { type: 'DECLINE_PROPERTY' }
  | { type: 'PLACE_BID'; amount: number }
  | { type: 'PASS_AUCTION' }
  | { type: 'BUILD_HOUSE'; tileId: number }
  | { type: 'SELL_HOUSE'; tileId: number }
  | { type: 'MORTGAGE_PROPERTY'; tileId: number }
  | { type: 'UNMORTGAGE_PROPERTY'; tileId: number }
  | { type: 'PAY_JAIL_BAIL' }
  | { type: 'USE_JAIL_CARD' }
  | { type: 'CHOOSE_TAX_OPTION'; choice: 'FLAT' | 'PERCENT' }
  | { type: 'ACKNOWLEDGE_CARD' }
  | {
      type: 'PROPOSE_TRADE';
      recipientId: string;
      offered: TradeOfferItem;
      requested: TradeOfferItem;
    }
  | { type: 'ACCEPT_TRADE'; tradeId: string }
  | { type: 'REJECT_TRADE'; tradeId: string }
  | { type: 'CANCEL_TRADE'; tradeId: string }
  | {
      type: 'COUNTER_TRADE';
      tradeId: string;
      offered: TradeOfferItem;
      requested: TradeOfferItem;
    }
  | { type: 'PAY_DEBT' }
  | { type: 'DECLARE_BANKRUPTCY' }
  | { type: 'END_TURN' };

export type ActionErrorCode =
  | 'NOT_YOUR_TURN'
  | 'INVALID_PHASE'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_BANKRUPT'
  | 'INSUFFICIENT_FUNDS'
  | 'RULE_VIOLATION'
  | 'FEATURE_DISABLED'
  | 'INVALID_TARGET'
  | 'SUPPLY_EXHAUSTED'
  | 'TRADE_INVALID'
  | 'AUCTION_INVALID';

export type ActionResult =
  | {
      ok: true;
      state: GameState;
      events: GameDomainEvent[];
    }
  | {
      ok: false;
      code: ActionErrorCode;
      error: string;
    };