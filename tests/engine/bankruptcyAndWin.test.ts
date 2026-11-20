import {
  applyGameAction,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  HOTEL_LEVEL,
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

describe('Bankruptcy, Creditor Asset Transfer & Winner Determination', () => {
  it('enters debt resolution on unaffordable rent, transfers assets to creditor, and ends the match with winner', () => {
    const state = createInitialGameState({
      roomCode: 'BNK01',
      settings: { ...DEFAULT_GAME_SETTINGS, bankruptcyTransferMode: 'CREDITOR' },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng: createSeededRng(77),
    });

    const debtor = state.turnOrder[0]!;
    const creditor = state.turnOrder[1]!;

    // Creditor owns Apex Tower (#39) with a Hotel ($2000 rent)
    state.properties[37]!.ownerId = creditor;
    state.properties[39]!.ownerId = creditor;
    state.properties[39]!.houses = HOTEL_LEVEL;

    // Debtor owns tile #1 and has only $120 cash, positioned at #35
    state.properties[1]!.ownerId = debtor;
    state.players[debtor]!.cash = 120;
    state.players[debtor]!.position = 35;

    // Debtor rolls 1 + 3 = 4 -> lands on #39 (owes $2000)
    const landed = applyGameAction(state, debtor, { type: 'ROLL_DICE' }, scriptedRng([1, 3]));
    expect(landed.ok).toBe(true);
    if (!landed.ok) return;
    expect(landed.state.phase).toBe('DEBT_RESOLUTION');
    expect(landed.state.pendingDebt?.amount).toBe(2000);
    expect(landed.state.pendingDebt?.creditorId).toBe(creditor);

    // Debtor declares bankruptcy -> transfers cash + tile #1 to creditor -> GAME_OVER
    const bankrupt = applyGameAction(landed.state, debtor, { type: 'DECLARE_BANKRUPTCY' }, scriptedRng([]));
    expect(bankrupt.ok).toBe(true);
    if (!bankrupt.ok) return;
    expect(bankrupt.state.phase).toBe('GAME_OVER');
    expect(bankrupt.state.winnerId).toBe(creditor);
    expect(bankrupt.state.players[debtor]!.isBankrupt).toBe(true);
    expect(bankrupt.state.properties[1]!.ownerId).toBe(creditor);
    expect(bankrupt.state.players[creditor]!.cash).toBe(1500 + 120);
    expect(bankrupt.state.rankings[0]!.playerId).toBe(creditor);
  });

  it('returns properties unmortgaged to Bank when bankruptcyTransferMode is BANK', () => {
    const rng = createSeededRng(88);
    const state = createInitialGameState({
      roomCode: 'BNK02',
      settings: { ...DEFAULT_GAME_SETTINGS, bankruptcyTransferMode: 'BANK' },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
        { id: 'p3', nickname: 'Riya', color: '#fb7185', tokenShape: 'star', isConnected: true },
      ],
      rng,
    });

    const p1 = state.turnOrder[0]!;
    state.properties[6]!.ownerId = p1;
    state.properties[6]!.mortgaged = true;

    const forfeited = applyGameAction(state, p1, { type: 'DECLARE_BANKRUPTCY' }, rng);
    expect(forfeited.ok).toBe(true);
    if (!forfeited.ok) return;
    expect(forfeited.state.phase).toBe('WAITING_FOR_ROLL'); // 2 players still active
    expect(forfeited.state.properties[6]!.ownerId).toBeNull();
    expect(forfeited.state.properties[6]!.mortgaged).toBe(false);
  });
});