import { HOTEL_LEVEL, MAX_HOUSES_BEFORE_HOTEL } from '../constants/limits';
import { getTileById } from '../maps/mapRegistry';
import { isPurchasableTile } from '../types/board';
import type { GameState, PlayerRanking } from '../types/game';
import { calculatePlayerNetWorth } from './taxRules';

export function getActivePlayerIds(state: GameState): string[] {
  return state.turnOrder.filter((id) => {
    const p = state.players[id];
    return Boolean(p && !p.isBankrupt);
  });
}

export function calculateMaxLiquidatableCash(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player) return 0;

  let total = Math.max(0, player.cash);
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== playerId) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (!isPurchasableTile(tile)) continue;

    if (tile.type === 'STREET' && prop.houses > 0) {
      if (prop.houses === HOTEL_LEVEL) {
        total += Math.floor((MAX_HOUSES_BEFORE_HOTEL * tile.houseCost + tile.hotelCost) / 2);
      } else {
        total += Math.floor((prop.houses * tile.houseCost) / 2);
      }
    }

    if (!prop.mortgaged) {
      total += tile.mortgageValue;
    }
  }
  return total;
}

export interface BankruptcyTransferSummary {
  transferredToCreditor: boolean;
  transferredCash: number;
  transferredPropertyIds: number[];
}

export function executeBankruptcyTransfer(
  state: GameState,
  debtorId: string,
  creditorId: string | null,
): BankruptcyTransferSummary {
  const debtor = state.players[debtorId];
  if (!debtor) {
    return { transferredToCreditor: false, transferredCash: 0, transferredPropertyIds: [] };
  }

  const bankruptCount = Object.values(state.players).filter((p) => p.isBankrupt).length;
  debtor.isBankrupt = true;
  debtor.bankruptOrder = bankruptCount + 1;
  debtor.inJail = false;
  debtor.jailTurns = 0;

  // Cancel any pending trades involving the bankrupt player
  for (const trade of state.trades) {
    if (
      trade.status === 'PENDING' &&
      (trade.proposerId === debtorId || trade.recipientId === debtorId)
    ) {
      trade.status = 'CANCELLED';
    }
  }

  // Liquidate all buildings on debtor's properties first and return them to bank supply
  let buildingCash = 0;
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== debtorId) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (tile.type === 'STREET' && prop.houses > 0) {
      if (prop.houses === HOTEL_LEVEL) {
        buildingCash += Math.floor((MAX_HOUSES_BEFORE_HOTEL * tile.houseCost + tile.hotelCost) / 2);
        state.bankHotelsRemaining += 1;
      } else {
        buildingCash += Math.floor((prop.houses * tile.houseCost) / 2);
        state.bankHousesRemaining += prop.houses;
      }
      prop.houses = 0;
    }
  }

  const totalCashToTransfer = Math.max(0, debtor.cash) + buildingCash;
  debtor.cash = 0;

  const creditor =
    creditorId && state.settings.bankruptcyTransferMode === 'CREDITOR'
      ? state.players[creditorId]
      : undefined;

  const transferredPropertyIds: number[] = [];

  if (creditor && !creditor.isBankrupt) {
    creditor.cash += totalCashToTransfer;

    for (const prop of Object.values(state.properties)) {
      if (prop.ownerId !== debtorId) continue;
      prop.ownerId = creditor.id;
      transferredPropertyIds.push(prop.tileId);
    }

    if (debtor.jailFreeCards > 0) {
      creditor.jailFreeCards += debtor.jailFreeCards;
      if (state.decks.chanceJailCardHolderId === debtorId) {
        state.decks.chanceJailCardHolderId = creditor.id;
      }
      if (state.decks.communityJailCardHolderId === debtorId) {
        state.decks.communityJailCardHolderId = creditor.id;
      }
      debtor.jailFreeCards = 0;
    }

    return {
      transferredToCreditor: true,
      transferredCash: totalCashToTransfer,
      transferredPropertyIds,
    };
  }

  // Return all assets to the Bank unmortgaged
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== debtorId) continue;
    prop.ownerId = null;
    prop.houses = 0;
    prop.mortgaged = false;
    transferredPropertyIds.push(prop.tileId);
  }

  if (debtor.jailFreeCards > 0) {
    if (state.decks.chanceJailCardHolderId === debtorId) {
      state.decks.chanceJailCardHolderId = null;
      state.decks.chanceOrder.push('chance-jail-free');
    }
    if (state.decks.communityJailCardHolderId === debtorId) {
      state.decks.communityJailCardHolderId = null;
      state.decks.communityOrder.push('community-jail-free');
    }
    debtor.jailFreeCards = 0;
  }

  return {
    transferredToCreditor: false,
    transferredCash: 0,
    transferredPropertyIds,
  };
}

export function computeRankings(state: GameState): PlayerRanking[] {
  const players = Object.values(state.players);
  const ownedCounts: Record<string, number> = {};
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId) {
      ownedCounts[prop.ownerId] = (ownedCounts[prop.ownerId] ?? 0) + 1;
    }
  }

  const sorted = [...players].sort((a, b) => {
    if (a.isBankrupt !== b.isBankrupt) {
      return a.isBankrupt ? 1 : -1;
    }
    if (!a.isBankrupt && !b.isBankrupt) {
      return calculatePlayerNetWorth(state, b.id) - calculatePlayerNetWorth(state, a.id);
    }
    return (b.bankruptOrder ?? 0) - (a.bankruptOrder ?? 0);
  });

  return sorted.map((player, index) => ({
    playerId: player.id,
    nickname: player.nickname,
    color: player.color,
    rank: index + 1,
    netWorth: player.isBankrupt ? 0 : calculatePlayerNetWorth(state, player.id),
    cash: player.cash,
    isBankrupt: player.isBankrupt,
    propertiesOwned: ownedCounts[player.id] ?? 0,
  }));
}