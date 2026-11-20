import {
  HOTEL_LEVEL,
  INCOME_TAX_FLAT_AMOUNT,
  INCOME_TAX_PERCENT,
  LUXURY_TAX_AMOUNT,
  MAX_HOUSES_BEFORE_HOTEL,
} from '../constants/limits';
import { getTileById } from '../maps/mapRegistry';
import { isPurchasableTile, type TaxTile } from '../types/board';
import type { GameState } from '../types/game';

export function calculatePlayerNetWorth(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player) return 0;

  let total = Math.max(0, player.cash);

  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== playerId) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (!isPurchasableTile(tile)) continue;

    total += prop.mortgaged ? tile.mortgageValue : tile.price;

    if (tile.type === 'STREET' && prop.houses > 0) {
      if (prop.houses === HOTEL_LEVEL) {
        total += MAX_HOUSES_BEFORE_HOTEL * tile.houseCost + tile.hotelCost;
      } else {
        total += prop.houses * tile.houseCost;
      }
    }
  }

  return total;
}

export function calculateIncomeTaxAmounts(
  state: GameState,
  playerId: string,
): { flatAmount: number; percentAmount: number } {
  const netWorth = calculatePlayerNetWorth(state, playerId);
  const percentAmount = Math.round((netWorth * INCOME_TAX_PERCENT) / 100);
  return {
    flatAmount: INCOME_TAX_FLAT_AMOUNT,
    percentAmount,
  };
}

export function resolveTaxAssessment(
  state: GameState,
  playerId: string,
  tile: TaxTile,
): {
  requiresChoice: boolean;
  immediateAmount: number;
  flatAmount: number;
  percentAmount: number;
} {
  if (tile.taxKind === 'LUXURY') {
    const amount = tile.flatAmount || LUXURY_TAX_AMOUNT;
    return {
      requiresChoice: false,
      immediateAmount: amount,
      flatAmount: amount,
      percentAmount: amount,
    };
  }

  const { flatAmount, percentAmount } = calculateIncomeTaxAmounts(state, playerId);
  switch (state.settings.incomeTaxMode) {
    case 'FLAT_200':
      return {
        requiresChoice: false,
        immediateAmount: flatAmount,
        flatAmount,
        percentAmount,
      };
    case 'PERCENT_10':
      return {
        requiresChoice: false,
        immediateAmount: percentAmount,
        flatAmount,
        percentAmount,
      };
    case 'CHOICE_FLAT_OR_PERCENT':
      return {
        requiresChoice: true,
        immediateAmount: 0,
        flatAmount,
        percentAmount,
      };
  }
}