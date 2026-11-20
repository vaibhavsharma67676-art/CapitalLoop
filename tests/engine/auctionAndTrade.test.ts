import {
  applyGameAction,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  resolveAuctionTimeout,
  type RngProvider,
} from '@capitalloop/shared';
import { describe, expect, it } from 'vitest';

function scriptedRng(rolls: number[]): RngProvider {
  const queue = [...rolls];
  let seq = 0;
  let now = 1_700_000_000_000;
  return {
    nextInt: (min) => queue.shift() ?? min,
    nextId: (p) => `${p}_${++seq}`,
    now: () => (now += 100),
  };
}

describe('Auctions & Player-to-Player Trading', () => {
  it('runs a live auction on declined property and awards it to highest bidder', () => {
    const state = createInitialGameState({
      roomCode: 'AUC01',
      settings: { ...DEFAULT_GAME_SETTINGS, auctionDeclinedProperties: true },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(5),
    });

    const p1 = state.turnOrder[0]!;
    const p2 = state.turnOrder[1]!;

    // p1 lands on tile 6 (Harbor Quays, $100) via 2 + 4 = 6
    const rolled = applyGameAction(state, p1, { type: 'ROLL_DICE' }, scriptedRng([2, 4]));
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;

    // p1 declines -> auction starts
    const declined = applyGameAction(rolled.state, p1, { type: 'DECLINE_PROPERTY' }, scriptedRng([]));
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.state.phase).toBe('AUCTION_ACTIVE');
    expect(declined.state.activeAuction?.tileId).toBe(6);

    // p2 bids $45
    const bid1 = applyGameAction(declined.state, p2, { type: 'PLACE_BID', amount: 45 }, scriptedRng([]));
    expect(bid1.ok).toBe(true);
    if (!bid1.ok) return;

    // p1 bids $60
    const bid2 = applyGameAction(bid1.state, p1, { type: 'PLACE_BID', amount: 60 }, scriptedRng([]));
    expect(bid2.ok).toBe(true);
    if (!bid2.ok) return;

    // p2 passes -> p1 wins immediately
    const passed = applyGameAction(bid2.state, p2, { type: 'PASS_AUCTION' }, scriptedRng([]));
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.phase).toBe('POST_ROLL_ACTIONS');
    expect(passed.state.properties[6]!.ownerId).toBe(p1);
    expect(passed.state.players[p1]!.cash).toBe(1440);
  });

  it('finalizes an auction cleanly on server timeout', () => {
    const state = createInitialGameState({
      roomCode: 'AUC02',
      settings: { ...DEFAULT_GAME_SETTINGS, auctionDeclinedProperties: true },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(8),
    });

    const p1 = state.turnOrder[0]!;
    const p2 = state.turnOrder[1]!;

    const r1 = applyGameAction(state, p1, { type: 'ROLL_DICE' }, scriptedRng([1, 5]));
    if (!r1.ok) throw new Error(r1.error);
    const r2 = applyGameAction(r1.state, p1, { type: 'DECLINE_PROPERTY' }, scriptedRng([]));
    if (!r2.ok) throw new Error(r2.error);
    const r3 = applyGameAction(r2.state, p2, { type: 'PLACE_BID', amount: 75 }, scriptedRng([]));
    if (!r3.ok) throw new Error(r3.error);

    const timedOut = resolveAuctionTimeout(r3.state, scriptedRng([]));
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.properties[6]!.ownerId).toBe(p2);
    expect(timedOut.state.players[p2]!.cash).toBe(1425);
  });

  it('supports trade proposal, counteroffer, and atomic cash + property + jail-card exchange', () => {
    const rng = createSeededRng(19);
    const state = createInitialGameState({
      roomCode: 'TRD01',
      settings: { ...DEFAULT_GAME_SETTINGS, tradingEnabled: true },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng,
    });

    const p1 = state.turnOrder[0]!;
    const p2 = state.turnOrder[1]!;
    state.properties[1]!.ownerId = p1;
    state.properties[6]!.ownerId = p2;
    state.players[p1]!.jailFreeCards = 1;
    state.decks.chanceJailCardHolderId = p1;

    // p1 proposes trade to p2
    const proposed = applyGameAction(
      state,
      p1,
      {
        type: 'PROPOSE_TRADE',
        recipientId: p2,
        offered: { cash: 100, propertyIds: [1], jailFreeCards: 0 },
        requested: { cash: 0, propertyIds: [6], jailFreeCards: 0 },
      },
      rng,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const trade1 = proposed.state.trades[0]!;

    // p2 sends counteroffer asking for $150 + tile 1 + jailFreeCard in exchange for tile 6
    const countered = applyGameAction(
      proposed.state,
      p2,
      {
        type: 'COUNTER_TRADE',
        tradeId: trade1.id,
        offered: { cash: 0, propertyIds: [6], jailFreeCards: 0 },
        requested: { cash: 150, propertyIds: [1], jailFreeCards: 1 },
      },
      rng,
    );
    expect(countered.ok).toBe(true);
    if (!countered.ok) return;
    expect(countered.state.trades[0]!.status).toBe('COUNTERED');
    const trade2 = countered.state.trades[1]!;
    expect(trade2.proposerId).toBe(p2);
    expect(trade2.recipientId).toBe(p1);

    // p1 accepts counteroffer
    const accepted = applyGameAction(
      countered.state,
      p1,
      { type: 'ACCEPT_TRADE', tradeId: trade2.id },
      rng,
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.state.properties[1]!.ownerId).toBe(p2);
    expect(accepted.state.properties[6]!.ownerId).toBe(p1);
    expect(accepted.state.players[p1]!.cash).toBe(1350);
    expect(accepted.state.players[p2]!.cash).toBe(1650);
    expect(accepted.state.players[p1]!.jailFreeCards).toBe(0);
    expect(accepted.state.players[p2]!.jailFreeCards).toBe(1);
    expect(accepted.state.decks.chanceJailCardHolderId).toBe(p2);
  });
});