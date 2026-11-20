import { MAX_ACTIVE_TRADES_PER_PLAYER } from '../constants/limits';
import { getTileById } from '../maps/mapRegistry';
import type { ActionErrorCode } from '../types/actions';
import { isPurchasableTile } from '../types/board';
import type { GameState, TradeOffer, TradeOfferItem } from '../types/game';
import { groupHasBuildings } from './rentRules';

export type TradeValidationResult =
  | { valid: true }
  | { valid: false; code: ActionErrorCode; error: string };

function isEmptyTradeItem(item: TradeOfferItem): boolean {
  return item.cash === 0 && item.propertyIds.length === 0 && item.jailFreeCards === 0;
}

export function validateTradeItems(
  state: GameState,
  ownerId: string,
  item: TradeOfferItem,
): TradeValidationResult {
  const player = state.players[ownerId];
  if (!player || player.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Trading player is not active.' };
  }

  if (!Number.isInteger(item.cash) || item.cash < 0) {
    return { valid: false, code: 'TRADE_INVALID', error: 'Cash amount must be a non-negative integer.' };
  }
  if (item.cash > player.cash) {
    return {
      valid: false,
      code: 'INSUFFICIENT_FUNDS',
      error: `${player.nickname} does not have $${item.cash}.`,
    };
  }

  if (!Number.isInteger(item.jailFreeCards) || item.jailFreeCards < 0) {
    return { valid: false, code: 'TRADE_INVALID', error: 'Invalid jail card quantity.' };
  }
  if (item.jailFreeCards > player.jailFreeCards) {
    return {
      valid: false,
      code: 'TRADE_INVALID',
      error: `${player.nickname} does not hold enough Get Out of Prison cards.`,
    };
  }

  const uniqueProps = new Set(item.propertyIds);
  if (uniqueProps.size !== item.propertyIds.length) {
    return { valid: false, code: 'TRADE_INVALID', error: 'Duplicate properties in trade offer.' };
  }

  for (const tileId of item.propertyIds) {
    const tile = getTileById(state.settings.mapId, tileId);
    if (!isPurchasableTile(tile)) {
      return { valid: false, code: 'TRADE_INVALID', error: 'Non-tradable tile included in offer.' };
    }
    const prop = state.properties[tileId];
    if (!prop || prop.ownerId !== ownerId) {
      return {
        valid: false,
        code: 'TRADE_INVALID',
        error: `${player.nickname} does not own ${tile.name}.`,
      };
    }
    if (tile.type === 'STREET' && groupHasBuildings(state, tile.colorGroup)) {
      return {
        valid: false,
        code: 'RULE_VIOLATION',
        error: `Cannot trade ${tile.name} while buildings exist in its color group.`,
      };
    }
  }

  return { valid: true };
}

export function validateProposeTrade(
  state: GameState,
  proposerId: string,
  recipientId: string,
  offered: TradeOfferItem,
  requested: TradeOfferItem,
): TradeValidationResult {
  if (!state.settings.tradingEnabled) {
    return { valid: false, code: 'FEATURE_DISABLED', error: 'Trading is disabled in room settings.' };
  }

  if (proposerId === recipientId) {
    return { valid: false, code: 'TRADE_INVALID', error: 'You cannot trade with yourself.' };
  }

  const proposer = state.players[proposerId];
  const recipient = state.players[recipientId];
  if (!proposer || proposer.isBankrupt || !recipient || recipient.isBankrupt) {
    return { valid: false, code: 'PLAYER_BANKRUPT', error: 'Both players must be active to trade.' };
  }

  if (isEmptyTradeItem(offered) && isEmptyTradeItem(requested)) {
    return { valid: false, code: 'TRADE_INVALID', error: 'Trade offer cannot be empty.' };
  }

  const activeByProposer = state.trades.filter(
    (t) => t.proposerId === proposerId && t.status === 'PENDING',
  ).length;
  if (activeByProposer >= MAX_ACTIVE_TRADES_PER_PLAYER) {
    return {
      valid: false,
      code: 'TRADE_INVALID',
      error: `Maximum of ${MAX_ACTIVE_TRADES_PER_PLAYER} pending outgoing trades allowed.`,
    };
  }

  const offerCheck = validateTradeItems(state, proposerId, offered);
  if (!offerCheck.valid) return offerCheck;

  const requestCheck = validateTradeItems(state, recipientId, requested);
  if (!requestCheck.valid) return requestCheck;

  return { valid: true };
}

export function validateAcceptTrade(
  state: GameState,
  accepterId: string,
  trade: TradeOffer,
): TradeValidationResult {
  if (!state.settings.tradingEnabled) {
    return { valid: false, code: 'FEATURE_DISABLED', error: 'Trading is disabled.' };
  }

  if (trade.status !== 'PENDING') {
    return { valid: false, code: 'TRADE_INVALID', error: 'Trade is no longer active.' };
  }

  if (trade.recipientId !== accepterId) {
    return { valid: false, code: 'TRADE_INVALID', error: 'Only the trade recipient can accept.' };
  }

  const offerCheck = validateTradeItems(state, trade.proposerId, trade.offered);
  if (!offerCheck.valid) return offerCheck;

  const requestCheck = validateTradeItems(state, trade.recipientId, trade.requested);
  if (!requestCheck.valid) return requestCheck;

  return { valid: true };
}

function transferJailCards(state: GameState, fromId: string, toId: string, count: number): void {
  let remaining = count;
  if (remaining > 0 && state.decks.chanceJailCardHolderId === fromId) {
    state.decks.chanceJailCardHolderId = toId;
    remaining -= 1;
  }
  if (remaining > 0 && state.decks.communityJailCardHolderId === fromId) {
    state.decks.communityJailCardHolderId = toId;
    remaining -= 1;
  }
}

export function executeTradeTransfer(state: GameState, trade: TradeOffer): void {
  const proposer = state.players[trade.proposerId];
  const recipient = state.players[trade.recipientId];
  if (!proposer || !recipient) return;

  proposer.cash = proposer.cash - trade.offered.cash + trade.requested.cash;
  recipient.cash = recipient.cash - trade.requested.cash + trade.offered.cash;

  for (const tileId of trade.offered.propertyIds) {
    const prop = state.properties[tileId];
    if (prop) prop.ownerId = recipient.id;
  }
  for (const tileId of trade.requested.propertyIds) {
    const prop = state.properties[tileId];
    if (prop) prop.ownerId = proposer.id;
  }

  if (trade.offered.jailFreeCards > 0) {
    proposer.jailFreeCards -= trade.offered.jailFreeCards;
    recipient.jailFreeCards += trade.offered.jailFreeCards;
    transferJailCards(state, proposer.id, recipient.id, trade.offered.jailFreeCards);
  }

  if (trade.requested.jailFreeCards > 0) {
    recipient.jailFreeCards -= trade.requested.jailFreeCards;
    proposer.jailFreeCards += trade.requested.jailFreeCards;
    transferJailCards(state, recipient.id, proposer.id, trade.requested.jailFreeCards);
  }

  proposer.stats.tradesCompleted += 1;
  recipient.stats.tradesCompleted += 1;
  trade.status = 'ACCEPTED';
}