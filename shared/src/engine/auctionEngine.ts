import {
  AUCTION_BASE_DURATION_MS,
  AUCTION_BID_RESET_MS,
  AUCTION_FAST_BID_RESET_MS,
  AUCTION_FAST_DURATION_MS,
  AUCTION_MIN_BID,
} from '../constants/limits';
import { getTileById } from '../maps/mapRegistry';
import { getActivePlayerIds } from '../rules/bankruptcyRules';
import type { ActionErrorCode } from '../types/actions';
import type { GameDomainEvent } from '../types/events';
import type { AuctionState, GamePhase, GameState } from '../types/game';
import type { RngProvider } from './rng';
import { appendLog } from './stateFactory';

export function startPropertyAuction(
  state: GameState,
  tileId: number,
  resumePhase: GamePhase,
  grantExtraTurnOnResolve: boolean,
  rng: RngProvider,
): AuctionState {
  const now = rng.now();
  const duration =
    state.settings.gameSpeed === 'FAST' ? AUCTION_FAST_DURATION_MS : AUCTION_BASE_DURATION_MS;
  const eligiblePlayerIds = getActivePlayerIds(state);

  const auction: AuctionState = {
    tileId,
    startedAt: now,
    endsAt: now + duration,
    currentBid: 0,
    highestBidderId: null,
    eligiblePlayerIds,
    passedPlayerIds: [],
    bidHistory: [],
    resumePhase,
    grantExtraTurnOnResolve,
  };

  state.activeAuction = auction;
  state.phase = 'AUCTION_ACTIVE';
  state.pendingPurchaseTileId = null;

  const tile = getTileById(state.settings.mapId, tileId);
  appendLog(state, rng, 'AUCTION', `Auction started for ${tile.name}!`, { tileId });
  return auction;
}

export function applyAuctionBid(
  state: GameState,
  playerId: string,
  amount: number,
  rng: RngProvider,
): { ok: true; endsAt: number } | { ok: false; code: ActionErrorCode; error: string } {
  const auction = state.activeAuction;
  if (!auction || state.phase !== 'AUCTION_ACTIVE') {
    return { ok: false, code: 'INVALID_PHASE', error: 'No active auction.' };
  }

  const player = state.players[playerId];
  if (!player || player.isBankrupt) {
    return { ok: false, code: 'PLAYER_BANKRUPT', error: 'Bankrupt players cannot bid.' };
  }

  if (!auction.eligiblePlayerIds.includes(playerId)) {
    return { ok: false, code: 'AUCTION_INVALID', error: 'You are not eligible for this auction.' };
  }

  if (auction.passedPlayerIds.includes(playerId)) {
    return { ok: false, code: 'AUCTION_INVALID', error: 'You already passed on this auction.' };
  }

  if (!Number.isInteger(amount) || amount < AUCTION_MIN_BID) {
    return { ok: false, code: 'AUCTION_INVALID', error: `Bid must be at least $${AUCTION_MIN_BID}.` };
  }

  if (amount <= auction.currentBid) {
    return {
      ok: false,
      code: 'AUCTION_INVALID',
      error: `Bid must be higher than current bid of $${auction.currentBid}.`,
    };
  }

  if (amount > player.cash) {
    return {
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
      error: `You only have $${player.cash} available to bid.`,
    };
  }

  const now = rng.now();
  const resetWindow =
    state.settings.gameSpeed === 'FAST' ? AUCTION_FAST_BID_RESET_MS : AUCTION_BID_RESET_MS;

  auction.currentBid = amount;
  auction.highestBidderId = playerId;
  auction.endsAt = Math.max(auction.endsAt, now + resetWindow);
  auction.bidHistory.push({ playerId, amount, timestamp: now });

  const tile = getTileById(state.settings.mapId, auction.tileId);
  appendLog(state, rng, 'AUCTION', `${player.nickname} bid $${amount} for ${tile.name}.`, {
    actorId: playerId,
    tileId: auction.tileId,
    amount,
  });

  return { ok: true, endsAt: auction.endsAt };
}

export function applyAuctionPass(
  state: GameState,
  playerId: string,
  rng: RngProvider,
): { ok: true; shouldFinalize: boolean } | { ok: false; code: ActionErrorCode; error: string } {
  const auction = state.activeAuction;
  if (!auction || state.phase !== 'AUCTION_ACTIVE') {
    return { ok: false, code: 'INVALID_PHASE', error: 'No active auction.' };
  }

  if (!auction.eligiblePlayerIds.includes(playerId)) {
    return { ok: false, code: 'AUCTION_INVALID', error: 'Not in this auction.' };
  }

  if (auction.highestBidderId === playerId) {
    return { ok: false, code: 'AUCTION_INVALID', error: 'Highest bidder cannot pass.' };
  }

  if (!auction.passedPlayerIds.includes(playerId)) {
    auction.passedPlayerIds.push(playerId);
    const player = state.players[playerId];
    if (player) {
      appendLog(state, rng, 'AUCTION', `${player.nickname} passed on the auction.`, {
        actorId: playerId,
        tileId: auction.tileId,
      });
    }
  }

  const remainingBidders = auction.eligiblePlayerIds.filter(
    (id) => !auction.passedPlayerIds.includes(id),
  );

  const shouldFinalize =
    remainingBidders.length === 0 ||
    (remainingBidders.length === 1 && remainingBidders[0] === auction.highestBidderId);

  return { ok: true, shouldFinalize };
}

export function finalizeAuction(
  state: GameState,
  rng: RngProvider,
): {
  events: GameDomainEvent[];
  resumePhase: GamePhase;
  grantExtraTurnOnResolve: boolean;
} {
  const auction = state.activeAuction;
  if (!auction) {
    return { events: [], resumePhase: 'POST_ROLL_ACTIONS', grantExtraTurnOnResolve: false };
  }

  const tile = getTileById(state.settings.mapId, auction.tileId);
  const events: GameDomainEvent[] = [];

  let winnerId: string | null = null;
  let winningAmount = 0;

  if (auction.highestBidderId) {
    const winner = state.players[auction.highestBidderId];
    const prop = state.properties[auction.tileId];
    if (winner && !winner.isBankrupt && prop && winner.cash >= auction.currentBid) {
      winner.cash -= auction.currentBid;
      winner.stats.propertiesBought += 1;
      prop.ownerId = winner.id;
      winnerId = winner.id;
      winningAmount = auction.currentBid;
      appendLog(
        state,
        rng,
        'AUCTION',
        `${winner.nickname} won ${tile.name} at auction for $${winningAmount}!`,
        { actorId: winner.id, tileId: tile.id, amount: winningAmount },
      );
    }
  }

  if (!winnerId) {
    appendLog(state, rng, 'AUCTION', `No bids placed. ${tile.name} remains unowned.`, {
      tileId: tile.id,
    });
  }

  events.push({
    type: 'AUCTION_ENDED',
    tileId: auction.tileId,
    winnerId,
    amount: winningAmount,
  });

  const resumePhase = auction.resumePhase;
  const grantExtraTurnOnResolve = auction.grantExtraTurnOnResolve;
  state.activeAuction = null;

  return { events, resumePhase, grantExtraTurnOnResolve };
}