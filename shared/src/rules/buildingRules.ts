import { HOTEL_LEVEL, MAX_HOUSES_BEFORE_HOTEL } from '../constants/limits';
import { getColorGroupTiles, getTileById } from '../maps/mapRegistry';
import type { ActionErrorCode } from '../types/actions';
import type { GameState } from '../types/game';
import { groupHasMortgagedProperty, ownsFullColorSet } from './rentRules';

export type BuildValidationResult =
  | { valid: true; cost: number; isHotelUpgrade: boolean }
  | { valid: false; code: ActionErrorCode; error: string };

export type SellValidationResult =
  | { valid: true; refund: number; isHotelDowngrade: boolean }
  | { valid: false; code: ActionErrorCode; error: string };

export function validateBuildHouse(
  state: GameState,
  playerId: string,
  tileId: number,
): BuildValidationResult {
  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Player cannot build.' };
  }

  const tile = getTileById(state.settings.mapId, tileId);
  if (tile.type !== 'STREET') {
    return { valid: false, code: 'INVALID_TARGET', error: 'Only street properties support buildings.' };
  }

  const prop = state.properties[tileId];
  if (!prop || prop.ownerId !== playerId) {
    return { valid: false, code: 'INVALID_TARGET', error: 'You do not own this property.' };
  }

  if (!ownsFullColorSet(state, playerId, tile.colorGroup)) {
    return {
      valid: false,
      code: 'RULE_VIOLATION',
      error: 'You must own the entire color group before building.',
    };
  }

  if (groupHasMortgagedProperty(state, tile.colorGroup)) {
    return {
      valid: false,
      code: 'RULE_VIOLATION',
      error: 'Unmortgage all properties in this color group before building.',
    };
  }

  if (prop.houses >= HOTEL_LEVEL) {
    return {
      valid: false,
      code: 'RULE_VIOLATION',
      error: 'This property already has a hotel.',
    };
  }

  if (state.settings.evenBuilding) {
    const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
    const minLevel = Math.min(...groupTiles.map((t) => state.properties[t.id]?.houses ?? 0));
    if (prop.houses > minLevel) {
      return {
        valid: false,
        code: 'RULE_VIOLATION',
        error: 'Even-building rule requires upgrading lower-level properties in this group first.',
      };
    }
  }

  const isHotelUpgrade = prop.houses === MAX_HOUSES_BEFORE_HOTEL;
  const cost = isHotelUpgrade ? tile.hotelCost : tile.houseCost;

  if (state.settings.limitedSupply) {
    if (isHotelUpgrade && state.bankHotelsRemaining < 1) {
      return {
        valid: false,
        code: 'SUPPLY_EXHAUSTED',
        error: 'No hotels remain in the bank supply.',
      };
    }
    if (!isHotelUpgrade && state.bankHousesRemaining < 1) {
      return {
        valid: false,
        code: 'SUPPLY_EXHAUSTED',
        error: 'No houses remain in the bank supply.',
      };
    }
  }

  if (player.cash < cost) {
    return {
      valid: false,
      code: 'INSUFFICIENT_FUNDS',
      error: `Need $${cost} to build on ${tile.name}.`,
    };
  }

  return { valid: true, cost, isHotelUpgrade };
}

export function validateSellHouse(
  state: GameState,
  playerId: string,
  tileId: number,
): SellValidationResult {
  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Player cannot sell buildings.' };
  }

  const tile = getTileById(state.settings.mapId, tileId);
  if (tile.type !== 'STREET') {
    return { valid: false, code: 'INVALID_TARGET', error: 'This tile has no buildings.' };
  }

  const prop = state.properties[tileId];
  if (!prop || prop.ownerId !== playerId) {
    return { valid: false, code: 'INVALID_TARGET', error: 'You do not own this property.' };
  }

  if (prop.houses <= 0) {
    return { valid: false, code: 'RULE_VIOLATION', error: 'No buildings to sell on this property.' };
  }

  if (state.settings.evenBuilding) {
    const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
    const maxLevel = Math.max(...groupTiles.map((t) => state.properties[t.id]?.houses ?? 0));
    if (prop.houses < maxLevel) {
      return {
        valid: false,
        code: 'RULE_VIOLATION',
        error: 'Even-building rule requires selling from the highest-level property in this group first.',
      };
    }
  }

  const isHotelDowngrade = prop.houses === HOTEL_LEVEL;
  if (isHotelDowngrade && state.settings.limitedSupply && state.bankHousesRemaining < MAX_HOUSES_BEFORE_HOTEL) {
    return {
      valid: false,
      code: 'SUPPLY_EXHAUSTED',
      error: 'Bank does not have 4 houses available to downgrade this hotel.',
    };
  }

  const baseCost = isHotelDowngrade ? tile.hotelCost : tile.houseCost;
  const refund = Math.floor(baseCost / 2);
  return { valid: true, refund, isHotelDowngrade };
}

export function getPlayerBuildingCounts(
  state: GameState,
  playerId: string,
): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== playerId) continue;
    if (prop.houses === HOTEL_LEVEL) {
      hotels += 1;
    } else if (prop.houses > 0) {
      houses += prop.houses;
    }
  }
  return { houses, hotels };
}