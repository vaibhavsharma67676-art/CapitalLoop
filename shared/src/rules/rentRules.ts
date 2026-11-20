import { HOTEL_LEVEL, TRANSIT_RENT_SCHEDULE, UTILITY_MULTIPLIERS } from '../constants/limits';
import {
  getColorGroupTiles,
  getTileById,
  getTransitTiles,
  getUtilityTiles,
} from '../maps/mapRegistry';
import type { ColorGroup, StreetTile } from '../types/board';
import type { GameState } from '../types/game';

export interface RentCalculationOverrides {
  transitMultiplier?: number;
  utilityMultiplier?: number;
}

export interface RentCalculationResult {
  amount: number;
  ownerId: string | null;
  reason: string;
}

export function ownsFullColorSet(
  state: GameState,
  playerId: string,
  colorGroup: ColorGroup,
): boolean {
  const groupTiles = getColorGroupTiles(state.settings.mapId, colorGroup);
  if (groupTiles.length === 0) {
    return false;
  }
  return groupTiles.every((tile) => state.properties[tile.id]?.ownerId === playerId);
}

export function groupHasMortgagedProperty(state: GameState, colorGroup: ColorGroup): boolean {
  const groupTiles = getColorGroupTiles(state.settings.mapId, colorGroup);
  return groupTiles.some((tile) => state.properties[tile.id]?.mortgaged === true);
}

export function groupHasBuildings(state: GameState, colorGroup: ColorGroup): boolean {
  const groupTiles = getColorGroupTiles(state.settings.mapId, colorGroup);
  return groupTiles.some((tile) => (state.properties[tile.id]?.houses ?? 0) > 0);
}

export function getStreetRentForLevel(tile: StreetTile, houses: number): number {
  switch (houses) {
    case 0:
      return tile.baseRent;
    case 1:
      return tile.rent1House;
    case 2:
      return tile.rent2Houses;
    case 3:
      return tile.rent3Houses;
    case 4:
      return tile.rent4Houses;
    case HOTEL_LEVEL:
      return tile.rentHotel;
    default:
      return tile.baseRent;
  }
}

export function calculateRent(
  state: GameState,
  tileId: number,
  diceTotal: number,
  overrides: RentCalculationOverrides = {},
): RentCalculationResult {
  const tile = getTileById(state.settings.mapId, tileId);
  const prop = state.properties[tileId];

  if (!prop || !prop.ownerId) {
    return { amount: 0, ownerId: null, reason: 'Unowned property' };
  }

  const owner = state.players[prop.ownerId];
  if (!owner || owner.isBankrupt) {
    return { amount: 0, ownerId: null, reason: 'Owner unavailable' };
  }

  if (prop.mortgaged) {
    return { amount: 0, ownerId: owner.id, reason: 'Property is mortgaged' };
  }

  if (owner.inJail && !state.settings.collectRentInJail) {
    return { amount: 0, ownerId: owner.id, reason: 'Owner cannot collect rent while in Prison' };
  }

  if (tile.type === 'STREET') {
    const baseAmount = getStreetRentForLevel(tile, prop.houses);
    if (
      prop.houses === 0 &&
      state.settings.doubleRentOnColorSet &&
      ownsFullColorSet(state, owner.id, tile.colorGroup) &&
      !groupHasMortgagedProperty(state, tile.colorGroup)
    ) {
      return {
        amount: baseAmount * 2,
        ownerId: owner.id,
        reason: `${tile.name} rent (2x full color set)`,
      };
    }
    return {
      amount: baseAmount,
      ownerId: owner.id,
      reason:
        prop.houses === HOTEL_LEVEL
          ? `${tile.name} hotel rent`
          : prop.houses > 0
            ? `${tile.name} rent (${prop.houses} house${prop.houses > 1 ? 's' : ''})`
            : `${tile.name} base rent`,
    };
  }

  if (tile.type === 'TRANSIT') {
    const transitTiles = getTransitTiles(state.settings.mapId);
    const ownedCount = transitTiles.filter((t) => {
      const p = state.properties[t.id];
      return p?.ownerId === owner.id && !p.mortgaged;
    }).length;
    const scheduleIndex = Math.max(0, Math.min(ownedCount - 1, TRANSIT_RENT_SCHEDULE.length - 1));
    const baseTransitRent = TRANSIT_RENT_SCHEDULE[scheduleIndex] ?? 25;
    const multiplier = overrides.transitMultiplier ?? 1;
    return {
      amount: baseTransitRent * multiplier,
      ownerId: owner.id,
      reason: `${tile.name} airport rent (${ownedCount} airport${ownedCount > 1 ? 's' : ''} owned${multiplier > 1 ? ` x${multiplier}` : ''})`,
    };
  }

  if (tile.type === 'UTILITY') {
    const utilityTiles = getUtilityTiles(state.settings.mapId);
    const ownedCount = utilityTiles.filter((t) => {
      const p = state.properties[t.id];
      return p?.ownerId === owner.id && !p.mortgaged;
    }).length;
    const defaultMultiplier = ownedCount >= 2 ? UTILITY_MULTIPLIERS[1] : UTILITY_MULTIPLIERS[0];
    const effectiveMultiplier = overrides.utilityMultiplier ?? defaultMultiplier;
    const rollValue = Math.max(2, diceTotal);
    return {
      amount: rollValue * effectiveMultiplier,
      ownerId: owner.id,
      reason: `${tile.name} utility fee (${effectiveMultiplier}x dice roll of ${rollValue})`,
    };
  }

  return { amount: 0, ownerId: null, reason: 'Non-rentable tile' };
}
