export type CardDeckType = 'CHANCE' | 'COMMUNITY';

export type CardEffect =
  | { kind: 'GAIN_CASH'; amount: number }
  | { kind: 'PAY_CASH'; amount: number }
  | { kind: 'MOVE_TO_TILE'; targetTileId: number; collectStartIfPassed: boolean }
  | { kind: 'MOVE_RELATIVE'; steps: number }
  | { kind: 'MOVE_NEAREST_TRANSIT'; rentMultiplier: number }
  | { kind: 'MOVE_NEAREST_UTILITY'; diceMultiplier: number }
  | { kind: 'GO_TO_JAIL' }
  | { kind: 'GET_OUT_OF_JAIL_FREE' }
  | { kind: 'REPAIRS'; perHouse: number; perHotel: number }
  | { kind: 'COLLECT_FROM_ALL'; amountPerPlayer: number }
  | { kind: 'PAY_ALL_PLAYERS'; amountPerPlayer: number };

export interface CardDefinition {
  id: string;
  deck: CardDeckType;
  title: string;
  description: string;
  effect: CardEffect;
}

export interface DrawnCardState {
  card: CardDefinition;
  drawnByPlayerId: string;
  resolved: boolean;
}