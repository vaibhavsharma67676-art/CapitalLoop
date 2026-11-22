import { getColorGroupTiles, getTileById } from '../maps/mapRegistry';
import type { ActionErrorCode } from '../types/actions';
import { isPurchasableTile, type PurchasableTile } from '../types/board';
import type { ClientGameState, GamePhase, GameState } from '../types/game';
import { groupHasBuildings } from './rentRules';

export type MortgageValidationResult =
  | { valid: true; payout: number }
  | { valid: false; code: ActionErrorCode; error: string };

export type UnmortgageValidationResult =
  | { valid: true; cost: number }
  | { valid: false; code: ActionErrorCode; error: string };

export interface EligibleMortgageOption {
  tileId: number;
  tile: PurchasableTile;
  mortgageValue: number;
}

export function getUnmortgageCost(tile: PurchasableTile, interestPercent: number): number {
  const interest = Math.ceil((tile.mortgageValue * interestPercent) / 100);
  return tile.mortgageValue + interest;
}

/**
 * Returns true if the active player is allowed to mortgage or sell buildings in the given phase.
 * Includes AWAITING_BUY_DECISION so a player can raise funds mid-purchase without losing the property.
 */
export function canLiquidateInPhase(
  phase: GamePhase,
  isCurrentTurn: boolean,
  isDebtorRaisingFunds: boolean,
): boolean {
  if (isDebtorRaisingFunds) return true;
  if (!isCurrentTurn) return false;
  return (
    phase === 'WAITING_FOR_ROLL' ||
    phase === 'AWAITING_BUY_DECISION' ||
    phase === 'POST_ROLL_ACTIONS'
  );
}

/**
 * Lists all owned properties currently eligible to be mortgaged under official game rules.
 * Safe for both server GameState and sanitized ClientGameState.
 */
export function getEligibleMortgageOptions(
  state: Pick<GameState | ClientGameState, 'settings' | 'players' | 'properties'>,
  playerId: string,
): EligibleMortgageOption[] {
  if (!state.settings.mortgageEnabled) return [];
  const player = state.players[playerId];
  if (!player || player.isBankrupt) return [];

  const options: EligibleMortgageOption[] = [];
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== playerId || prop.mortgaged) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (!isPurchasableTile(tile)) continue;

    if (tile.type === 'STREET') {
      const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
      const hasBuildings = groupTiles.some((t) => (state.properties[t.id]?.houses ?? 0) > 0);
      if (hasBuildings) continue;
    }

    options.push({
      tileId: prop.tileId,
      tile,
      mortgageValue: tile.mortgageValue,
    });
  }

  return options.sort((a, b) => a.mortgageValue - b.mortgageValue);
}

export function getTotalAvailableMortgagePayout(
  state: Pick<GameState | ClientGameState, 'settings' | 'players' | 'properties'>,
  playerId: string,
): number {
  return getEligibleMortgageOptions(state, playerId).reduce(
    (sum, item) => sum + item.mortgageValue,
    0,
  );
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
