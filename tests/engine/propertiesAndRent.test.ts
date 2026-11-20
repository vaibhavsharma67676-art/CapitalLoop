import {
  applyGameAction,
  calculateRent,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
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

describe('Properties, Color-Set Bonuses & Rent Calculations', () => {
  it('allows buying an unowned street and charges 2x base rent when owner holds the full color set', () => {
    const state = createInitialGameState({
      roomCode: 'RENT1',
      settings: { ...DEFAULT_GAME_SETTINGS, doubleRentOnColorSet: true },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(7),
    });

    const first = state.turnOrder[0]!;
    const second = state.turnOrder[1]!;

    // First lands on tile 3 (Oakridge Row, $60, brown group) via 1 + 2 = 3
    const rolled = applyGameAction(state, first, { type: 'ROLL_DICE' }, scriptedRng([1, 2]));
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    expect(rolled.state.phase).toBe('AWAITING_BUY_DECISION');

    const bought = applyGameAction(rolled.state, first, { type: 'BUY_PROPERTY' }, scriptedRng([]));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.state.properties[3]!.ownerId).toBe(first);
    expect(bought.state.players[first]!.cash).toBe(1440);

    // Single brown tile rent = $4
    expect(calculateRent(bought.state, 3, 6).amount).toBe(4);

    // Grant second brown tile (#1) -> full brown set doubles unimproved rent to $8
    bought.state.properties[1]!.ownerId = first;
    expect(calculateRent(bought.state, 3, 6).amount).toBe(8);

    // End turn and have second player land on tile 3
    const turn2 = applyGameAction(bought.state, first, { type: 'END_TURN' }, scriptedRng([]));
    expect(turn2.ok).toBe(true);
    if (!turn2.ok) return;

    const p2Roll = applyGameAction(turn2.state, second, { type: 'ROLL_DICE' }, scriptedRng([1, 2]));
    expect(p2Roll.ok).toBe(true);
    if (!p2Roll.ok) return;
    expect(p2Roll.state.players[second]!.cash).toBe(1500 - 8);
    expect(p2Roll.state.players[first]!.cash).toBe(1440 + 8);
  });

  it('scales transit rent by owned stations and utility rent by dice roll, and blocks jail rent when disabled', () => {
    const state = createInitialGameState({
      roomCode: 'RENT2',
      settings: { ...DEFAULT_GAME_SETTINGS, collectRentInJail: false },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(12),
    });

    // Transit hubs: 5, 15, 25, 35
    state.properties[5]!.ownerId = 'p1';
    expect(calculateRent(state, 5, 7).amount).toBe(25);
    state.properties[15]!.ownerId = 'p1';
    expect(calculateRent(state, 5, 7).amount).toBe(50);
    state.properties[25]!.ownerId = 'p1';
    expect(calculateRent(state, 5, 7).amount).toBe(100);
    state.properties[35]!.ownerId = 'p1';
    expect(calculateRent(state, 5, 7).amount).toBe(200);

    // Utilities: 12, 28
    state.properties[12]!.ownerId = 'p1';
    expect(calculateRent(state, 12, 8).amount).toBe(32); // 4 * 8
    state.properties[28]!.ownerId = 'p1';
    expect(calculateRent(state, 12, 8).amount).toBe(80); // 10 * 8

    // Owner in Jail with collectRentInJail = false collects $0
    state.players['p1']!.inJail = true;
    expect(calculateRent(state, 5, 7).amount).toBe(0);
  });
});