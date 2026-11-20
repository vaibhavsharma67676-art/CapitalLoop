import {
  applyGameAction,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  JAIL_BAIL_AMOUNT,
  JAIL_TILE_ID,
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

describe('Jail, Taxes, Vacation Pot & Cards', () => {
  it('supports paying bail, using a Get Out of Prison card, and 3rd-turn mandatory bail', () => {
    const state = createInitialGameState({
      roomCode: 'JAIL1',
      settings: { ...DEFAULT_GAME_SETTINGS, vacationPotEnabled: true },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(21),
    });

    const p1 = state.turnOrder[0]!;
    state.players[p1]!.inJail = true;
    state.players[p1]!.position = JAIL_TILE_ID;

    // Pay $50 bail -> freed and $50 added to vacationPot
    const bailed = applyGameAction(state, p1, { type: 'PAY_JAIL_BAIL' }, scriptedRng([]));
    expect(bailed.ok).toBe(true);
    if (!bailed.ok) return;
    expect(bailed.state.players[p1]!.inJail).toBe(false);
    expect(bailed.state.players[p1]!.cash).toBe(1500 - JAIL_BAIL_AMOUNT);
    expect(bailed.state.vacationPot).toBe(JAIL_BAIL_AMOUNT);

    // Test card escape
    bailed.state.players[p1]!.inJail = true;
    bailed.state.players[p1]!.jailFreeCards = 1;
    bailed.state.decks.chanceJailCardHolderId = p1;
    const cardUsed = applyGameAction(bailed.state, p1, { type: 'USE_JAIL_CARD' }, scriptedRng([]));
    expect(cardUsed.ok).toBe(true);
    if (!cardUsed.ok) return;
    expect(cardUsed.state.players[p1]!.inJail).toBe(false);
    expect(cardUsed.state.players[p1]!.jailFreeCards).toBe(0);
    expect(cardUsed.state.decks.chanceJailCardHolderId).toBeNull();

    // Test 3rd turn failed roll forces $50 bail and moves by roll
    cardUsed.state.players[p1]!.inJail = true;
    cardUsed.state.players[p1]!.position = JAIL_TILE_ID;
    cardUsed.state.players[p1]!.jailTurns = 2;
    const cashBefore = cardUsed.state.players[p1]!.cash;

    const thirdAttempt = applyGameAction(cardUsed.state, p1, { type: 'ROLL_DICE' }, scriptedRng([1, 3]));
    expect(thirdAttempt.ok).toBe(true);
    if (!thirdAttempt.ok) return;
    expect(thirdAttempt.state.players[p1]!.inJail).toBe(false);
    expect(thirdAttempt.state.players[p1]!.position).toBe(14);
    expect(thirdAttempt.state.players[p1]!.cash).toBe(cashBefore - JAIL_BAIL_AMOUNT);
  });

  it('handles Income Tax choice mode, feeds Vacation pot, and awards pot on landing on Vacation', () => {
    const state = createInitialGameState({
      roomCode: 'TAX01',
      settings: {
        ...DEFAULT_GAME_SETTINGS,
        incomeTaxMode: 'CHOICE_FLAT_OR_PERCENT',
        vacationPotEnabled: true,
      },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(25),
    });

    const p1 = state.turnOrder[0]!;
    // Roll 1 + 3 = 4 (Income Tax)
    const landed = applyGameAction(state, p1, { type: 'ROLL_DICE' }, scriptedRng([1, 3]));
    expect(landed.ok).toBe(true);
    if (!landed.ok) return;
    expect(landed.state.phase).toBe('TAX_DECISION');
    expect(landed.state.pendingTax?.percentAmount).toBe(150); // 10% of $1500

    // Choose 10% ($150) instead of flat $200
    const taxed = applyGameAction(
      landed.state,
      p1,
      { type: 'CHOOSE_TAX_OPTION', choice: 'PERCENT' },
      scriptedRng([]),
    );
    expect(taxed.ok).toBe(true);
    if (!taxed.ok) return;
    expect(taxed.state.players[p1]!.cash).toBe(1350);
    expect(taxed.state.vacationPot).toBe(150);

    // Move p1 to tile 16 and roll 1 + 3 = 4 to land on Vacation (20)
    taxed.state.phase = 'WAITING_FOR_ROLL';
    taxed.state.players[p1]!.position = 16;
    const vacation = applyGameAction(taxed.state, p1, { type: 'ROLL_DICE' }, scriptedRng([1, 3]));
    expect(vacation.ok).toBe(true);
    if (!vacation.ok) return;
    expect(vacation.state.players[p1]!.position).toBe(20);
    expect(vacation.state.players[p1]!.cash).toBe(1500);
    expect(vacation.state.vacationPot).toBe(0);
  });

  it('draws and resolves a Chance card cleanly', () => {
    const state = createInitialGameState({
      roomCode: 'CRD01',
      settings: { ...DEFAULT_GAME_SETTINGS },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(30),
    });

    const p1 = state.turnOrder[0]!;
    // Force top Chance card to be quarterly dividend (+$50)
    state.decks.chanceOrder.unshift('chance-bank-dividend');

    // Roll 3 + 4 = 7 (Surprise / Chance tile)
    const drew = applyGameAction(state, p1, { type: 'ROLL_DICE' }, scriptedRng([3, 4]));
    expect(drew.ok).toBe(true);
    if (!drew.ok) return;
    expect(drew.state.phase).toBe('CARD_REVEAL');
    expect(drew.state.pendingCard?.card.id).toBe('chance-bank-dividend');

    const resolved = applyGameAction(drew.state, p1, { type: 'ACKNOWLEDGE_CARD' }, scriptedRng([]));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[p1]!.cash).toBe(1550);
    expect(resolved.state.phase).toBe('POST_ROLL_ACTIONS');
  });
});