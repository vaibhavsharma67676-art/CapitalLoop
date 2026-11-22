import {
  applyGameAction,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  getEligibleMortgageOptions,
  getTotalAvailableMortgagePayout,
  type RngProvider,
} from '@capitalloop/shared';
import { describe, expect, it } from 'vitest';
import { createCryptoRng } from '../../server/src/security/codeGenerator';

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

describe('Fair Cryptographic Dice & Mortgage-During-Purchase Flow', () => {
  it('generates unbiased integer dice values strictly in [1..6] across many rolls', () => {
    const cryptoRng = createCryptoRng();
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const totalRolls = 1200;

    for (let i = 0; i < totalRolls; i += 1) {
      const die = cryptoRng.nextInt(1, 7);
      expect(Number.isInteger(die)).toBe(true);
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(6);
      counts[die]! += 1;
    }

    // With 1200 rolls, expected is ~200 per face; every face must appear reasonably uniformly
    for (let face = 1; face <= 6; face += 1) {
      expect(counts[face]!).toBeGreaterThan(130);
      expect(counts[face]!).toBeLessThan(270);
    }
  });

  it('allows mortgaging an eligible property mid-purchase and buying the property in the same turn', () => {
    const state = createInitialGameState({
      roomCode: 'MRTBUY',
      settings: { ...DEFAULT_GAME_SETTINGS, mortgageEnabled: true },
      players: [
        { id: 'p1', nickname: 'Vaibhav', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Aarav', color: '#fb7185', tokenShape: 'rocket', isConnected: true },
      ],
      rng: createSeededRng(55),
    });

    const p1 = state.turnOrder[0]!;
    // Give p1 low cash ($100) and an eligible property with $150 mortgage value (e.g., Manchester #31, price $300, mortgage $150)
    state.players[p1]!.cash = 100;
    state.properties[31]!.ownerId = p1;

    // Move p1 to position 14 and roll 1 + 2 = 3 -> lands on tile 17? Wait: let's land on Heathrow (#5, price $200) from pos 2 via 1 + 2 = 3
    state.players[p1]!.position = 2;
    const rolled = applyGameAction(state, p1, { type: 'ROLL_DICE' }, scriptedRng([1, 2]));
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;

    expect(rolled.state.phase).toBe('AWAITING_BUY_DECISION');
    expect(rolled.state.pendingPurchaseTileId).toBe(5);
    expect(rolled.state.players[p1]!.cash).toBe(100);

    // Cannot buy yet with only $100 for $200 property
    const tooPoor = applyGameAction(rolled.state, p1, { type: 'BUY_PROPERTY' }, scriptedRng([]));
    expect(tooPoor.ok).toBe(false);
    if (!tooPoor.ok) expect(tooPoor.code).toBe('INSUFFICIENT_FUNDS');

    // Mortgage tile #31 (+$150) during AWAITING_BUY_DECISION -> cash becomes $250
    expect(getTotalAvailableMortgagePayout(rolled.state, p1)).toBe(150);
    expect(getEligibleMortgageOptions(rolled.state, p1).some((o) => o.tileId === 31)).toBe(true);

    const mortgaged = applyGameAction(
      rolled.state,
      p1,
      { type: 'MORTGAGE_PROPERTY', tileId: 31 },
      scriptedRng([]),
    );
    expect(mortgaged.ok).toBe(true);
    if (!mortgaged.ok) return;

    expect(mortgaged.state.phase).toBe('AWAITING_BUY_DECISION');
    expect(mortgaged.state.pendingPurchaseTileId).toBe(5);
    expect(mortgaged.state.players[p1]!.cash).toBe(250);
    expect(mortgaged.state.properties[31]!.mortgaged).toBe(true);

    // Now purchase tile #5 ($200) in the same turn -> cash becomes $50 and ownership updates
    const bought = applyGameAction(mortgaged.state, p1, { type: 'BUY_PROPERTY' }, scriptedRng([]));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    expect(bought.state.properties[5]!.ownerId).toBe(p1);
    expect(bought.state.players[p1]!.cash).toBe(50);
  });
});
