import { JAIL_BAIL_AMOUNT, JAIL_TILE_ID } from '../constants/limits';
import type { ActionErrorCode } from '../types/actions';
import type { GameState } from '../types/game';

export type JailActionValidation =
  | { valid: true }
  | { valid: false; code: ActionErrorCode; error: string };

export function sendPlayerToJail(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player) return;

  player.position = JAIL_TILE_ID;
  player.inJail = true;
  player.jailTurns = 0;
  player.consecutiveDoubles = 0;
  player.stats.timesJailed += 1;
  state.extraTurnPending = false;
}

export function releasePlayerFromJail(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player) return;

  player.inJail = false;
  player.jailTurns = 0;
}

export function validatePayJailBail(state: GameState, playerId: string): JailActionValidation {
  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Player is not active.' };
  }
  if (!player.inJail) {
    return { valid: false, code: 'RULE_VIOLATION', error: 'Player is not in Prison.' };
  }
  if (player.cash < JAIL_BAIL_AMOUNT) {
    return {
      valid: false,
      code: 'INSUFFICIENT_FUNDS',
      error: `Need $${JAIL_BAIL_AMOUNT} to pay bail.`,
    };
  }
  return { valid: true };
}

export function validateUseJailCard(state: GameState, playerId: string): JailActionValidation {
  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Player is not active.' };
  }
  if (!player.inJail) {
    return { valid: false, code: 'RULE_VIOLATION', error: 'Player is not in Prison.' };
  }
  if (player.jailFreeCards <= 0) {
    return {
      valid: false,
      code: 'RULE_VIOLATION',
      error: 'You do not hold a Get Out of Prison card.',
    };
  }
  return { valid: true };
}

export function consumeAndReturnJailCard(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player || player.jailFreeCards <= 0) return;

  player.jailFreeCards -= 1;

  if (state.decks.chanceJailCardHolderId === playerId) {
    state.decks.chanceJailCardHolderId = null;
    state.decks.chanceOrder.push('chance-jail-free');
  } else if (state.decks.communityJailCardHolderId === playerId) {
    state.decks.communityJailCardHolderId = null;
    state.decks.communityOrder.push('community-jail-free');
  }
}