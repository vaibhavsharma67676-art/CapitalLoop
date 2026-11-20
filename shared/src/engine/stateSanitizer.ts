import type { ClientGameState, GameState } from '../types/game';

export function sanitizeGameState(state: GameState): ClientGameState {
  const { decks, ...rest } = state;
  return {
    ...rest,
    deckCounts: {
      chanceRemaining: decks.chanceOrder.length,
      communityRemaining: decks.communityOrder.length,
    },
  };
}