import { getTileById } from '../maps/mapRegistry';
import type { ActionErrorCode } from '../types/actions';
import { isPurchasableTile, type PurchasableTile } from '../types/board';
import type { GameState } from '../types/game';
import { groupHasBuildings } from './rentRules';

export type MortgageValidationResult =
  | { valid: true; payout: number }
  | { valid: false; code: ActionErrorCode; error: string };

export type UnmortgageValidationResult =
  | { valid: true; cost: number }
  | { valid: false; code: ActionErrorCode; error: string };

export function getUnmortgageCost(tile: PurchasableTile, interestPercent: number): number {
  const interest = Math.ceil((tile.mortgageValue * interestPercent) / 100);
  return tile.mortgageValue + interest;
}

export function validateMortgage(
  state: GameState,
  playerId: string,
  tileId: number,
): MortgageValidationResult {
  if (!state.settings.mortgageEnabled) {
    return { valid: false, code: 'FEATURE_DISABLED', error: 'Mortgaging is disabled in room settings.' };
  }

  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Player cannot mortgage properties.' };
  }

  const tile = getTileById(state.settings.mapId, tileId);
  if (!isPurchasableTile(tile)) {
    return { valid: false, code: 'INVALID_TARGET', error: 'Tile cannot be mortgaged.' };
  }

  const prop = state.properties[tileId];
  if (!prop || prop.ownerId !== playerId) {
    return { valid: false, code: 'INVALID_TARGET', error: 'You do not own this property.' };
  }

  if (prop.mortgaged) {
    return { valid: false, code: 'RULE_VIOLATION', error: 'Property is already mortgaged.' };
  }

  if (tile.type === 'STREET' && groupHasBuildings(state, tile.colorGroup)) {
    return {
      valid: false,
      code: 'RULE_VIOLATION',
      error: 'Sell all buildings in this color group before mortgaging.',
    };
  }

  return { valid: true, payout: tile.mortgageValue };
}

export function validateUnmortgage(
  state: GameState,
  playerId: string,
  tileId: number,
): UnmortgageValidationResult {
  if (!state.settings.mortgageEnabled) {
    return { valid: false, code: 'FEATURE_DISABLED', error: 'Mortgaging is disabled in room settings.' };
  }

  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Player cannot unmortgage properties.' };
  }

  const tile = getTileById(state.settings.mapId, tileId);
  if (!isPurchasableTile(tile)) {
    return { valid: false, code: 'INVALID_TARGET', error: 'Tile cannot be unmortgaged.' };
  }

  const prop = state.properties[tileId];
  if (!prop || prop.ownerId !== playerId) {
    return { valid: false, code: 'INVALID_TARGET', error: 'You do not own this property.' };
  }

  if (!prop.mortgaged) {
    return { valid: false, code: 'RULE_VIOLATION', error: 'Property is not mortgaged.' };
  }

  const cost = getUnmortgageCost(tile, state.settings.mortgageInterestPercent);
  if (player.cash < cost) {
    return {
      valid: false,
      code: 'INSUFFICIENT_FUNDS',
      error: `Need $${cost} to unmortgage ${tile.name}.`,
    };
  }

  return { valid: true, cost };
}