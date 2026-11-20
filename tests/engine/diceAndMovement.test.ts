import {
  applyGameAction,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  JAIL_TILE_ID,
  type GameState,
  type RngProvider,
} from '@capitalloop/shared';
import { describe, expect, it } from 'vitest';

function createScriptedRng(rolls: number[]): RngProvider {
  const queue = [...rolls];
  let seq = 0;
  let now = 1_700_000_000_000;
  return {
    nextInt(minInclusive: number, maxExclusive: number): number {
      const next = queue.shift();
      if (next !== undefined) {
        return next;
      }
      return minInclusive + ((seq++) % (maxExclusive - minInclusive));
    },
    nextId(prefix: string): string {
      seq += 1;
      return `${prefix}_${seq}`;
    },
    now(): number {
      now += 100;
      return now;
    },
  };
}

function makeTwoPlayerState(overrides: Partial<typeof DEFAULT_GAME_SETTINGS> = {}): {
  state: GameState;
  p1: string;
  p2: string;
} {
  const state = createInitialGameState({
    roomCode: 'ABCDE',
    settings: { ...DEFAULT_GAME_SETTINGS, ...overrides },
    players: [
      { id: 'plr_1', nickname: 'Vaibhav', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
      { id: 'plr_2', nickname: 'Aarav', color: '#facc15', tokenShape: 'rocket', isConnected: true },
    ],
    rng: createSeededRng(101),
  });
  return { state, p1: state.turnOrder[0]!, p2: state.turnOrder[1]! };
}

describe('Dice, Movement, Doubles, Passing Start & Turn Progression', () => {
  it('moves player clockwise by dice sum and transitions to turn end on non-doubles', () => {
    const { state, p1, p2 } = makeTwoPlayerState();
    // Roll 5 + 5 would be doubles; roll 4 + 6 = 10 (Just Visiting corner)
    const rolled = applyGameAction(state, p1, { type: 'ROLL_DICE' }, createScriptedRng([4, 6]));
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;

    expect(rolled.state.players[p1]!.position).toBe(10);
    expect(rolled.state.phase).toBe('POST_ROLL_ACTIONS');

    // Non-current player cannot end turn
    const badEnd = applyGameAction(rolled.state, p2, { type: 'END_TURN' }, createScriptedRng([]));
    expect(badEnd.ok).toBe(false);
    if (!badEnd.ok) expect(badEnd.code).toBe('NOT_YOUR_TURN');

    const ended = applyGameAction(rolled.state, p1, { type: 'END_TURN' }, createScriptedRng([]));
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.turnOrder[ended.state.currentPlayerIndex]).toBe(p2);
    expect(ended.state.turnNumber).toBe(2);
    expect(ended.state.phase).toBe('WAITING_FOR_ROLL');
  });

  it('awards passStartBonus when crossing Start and 2x bonus when doubleGoOnExactLand is enabled', () => {
    const { state, p1 } = makeTwoPlayerState({
      passStartBonus: 250,
      doubleGoOnExactLand: true,
    });
    state.players[p1]!.position = 36;
    const initialCash = state.players[p1]!.cash;

    // Roll 1 + 3 = 4 -> lands exactly on tile 0 (Start)
    const res = applyGameAction(state, p1, { type: 'ROLL_DICE' }, createScriptedRng([1, 3]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.players[p1]!.position).toBe(0);
    expect(res.state.players[p1]!.cash).toBe(initialCash + 500);
  });

  it('grants an extra turn on doubles and sends player to Prison on 3rd consecutive double', () => {
    const { state, p1 } = makeTwoPlayerState({
      doublesExtraTurn: true,
      threeDoublesToJail: true,
    });

    // Double #1: 5 + 5 = 10 (Just Visiting corner -> immediately WAITING_FOR_ROLL again)
    const r1 = applyGameAction(state, p1, { type: 'ROLL_DICE' }, createScriptedRng([5, 5]));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.phase).toBe('WAITING_FOR_ROLL');
    expect(r1.state.players[p1]!.consecutiveDoubles).toBe(1);

    // Double #2: 5 + 5 = 10 -> position 20 (Vacation -> immediately WAITING_FOR_ROLL again)
    const r2 = applyGameAction(r1.state, p1, { type: 'ROLL_DICE' }, createScriptedRng([5, 5]));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.phase).toBe('WAITING_FOR_ROLL');
    expect(r2.state.players[p1]!.consecutiveDoubles).toBe(2);

    // Double #3: 3 + 3 -> sent directly to Prison
    const r3 = applyGameAction(r2.state, p1, { type: 'ROLL_DICE' }, createScriptedRng([3, 3]));
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.state.players[p1]!.inJail).toBe(true);
    expect(r3.state.players[p1]!.position).toBe(JAIL_TILE_ID);
    expect(r3.state.phase).toBe('POST_ROLL_ACTIONS');
  });
});