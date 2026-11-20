import {
  applyGameAction,
  calculateRent,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  HOTEL_LEVEL,
} from '@capitalloop/shared';
import { describe, expect, it } from 'vitest';

describe('Houses, Hotels, Even Building & Mortgages', () => {
  it('enforces even-building rules up to a Hotel and adjusts bank house/hotel supply accurately', () => {
    const rng = createSeededRng(33);
    const state = createInitialGameState({
      roomCode: 'BLD01',
      settings: { ...DEFAULT_GAME_SETTINGS, startingCash: 3000, evenBuilding: true, limitedSupply: true },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng,
    });

    const owner = state.turnOrder[0]!;
    // Give owner full brown group (tiles 1 & 3, houseCost = 50, hotelCost = 50)
    state.properties[1]!.ownerId = owner;
    state.properties[3]!.ownerId = owner;

    let current = state;
    // Build 1st house on tile 1
    let res = applyGameAction(current, owner, { type: 'BUILD_HOUSE', tileId: 1 }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    current = res.state;
    expect(current.properties[1]!.houses).toBe(1);
    expect(current.bankHousesRemaining).toBe(31);

    // Building 2nd house on tile 1 before tile 3 violates even building
    const uneven = applyGameAction(current, owner, { type: 'BUILD_HOUSE', tileId: 1 }, rng);
    expect(uneven.ok).toBe(false);
    if (!uneven.ok) expect(uneven.code).toBe('RULE_VIOLATION');

    // Build evenly up to 4 houses each
    const sequence = [3, 1, 3, 1, 3, 1, 3];
    for (const tileId of sequence) {
      res = applyGameAction(current, owner, { type: 'BUILD_HOUSE', tileId }, rng);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      current = res.state;
    }

    expect(current.properties[1]!.houses).toBe(4);
    expect(current.properties[3]!.houses).toBe(4);
    expect(current.bankHousesRemaining).toBe(24);

    // Upgrade tile 1 to Hotel -> consumes 1 hotel, returns 4 houses to bank
    res = applyGameAction(current, owner, { type: 'BUILD_HOUSE', tileId: 1 }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    current = res.state;
    expect(current.properties[1]!.houses).toBe(HOTEL_LEVEL);
    expect(current.bankHotelsRemaining).toBe(11);
    expect(current.bankHousesRemaining).toBe(28);
    expect(calculateRent(current, 1, 7).amount).toBe(250);
  });

  it('prevents mortgaging while group has buildings, pays mortgage value, zeroes rent, and charges interest to unmortgage', () => {
    const rng = createSeededRng(44);
    const state = createInitialGameState({
      roomCode: 'MRT01',
      settings: { ...DEFAULT_GAME_SETTINGS, mortgageEnabled: true, mortgageInterestPercent: 10 },
      players: [
        { id: 'p1', nickname: 'Alice', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Bob', color: '#facc15', tokenShape: 'bolt', isConnected: true },
      ],
      rng,
    });

    const owner = state.turnOrder[0]!;
    state.properties[1]!.ownerId = owner;
    state.properties[3]!.ownerId = owner;
    state.properties[1]!.houses = 1;

    // Cannot mortgage tile 3 while tile 1 in same group has a house
    const blocked = applyGameAction(state, owner, { type: 'MORTGAGE_PROPERTY', tileId: 3 }, rng);
    expect(blocked.ok).toBe(false);

    // Sell house on tile 1 first (+$25)
    const sold = applyGameAction(state, owner, { type: 'SELL_HOUSE', tileId: 1 }, rng);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    expect(sold.state.players[owner]!.cash).toBe(1525);

    // Mortgage tile 3 (+$30)
    const mort = applyGameAction(sold.state, owner, { type: 'MORTGAGE_PROPERTY', tileId: 3 }, rng);
    expect(mort.ok).toBe(true);
    if (!mort.ok) return;
    expect(mort.state.properties[3]!.mortgaged).toBe(true);
    expect(mort.state.players[owner]!.cash).toBe(1555);
    expect(calculateRent(mort.state, 3, 6).amount).toBe(0);

    // Unmortgage tile 3 costs $30 + 10% = $33
    const unmort = applyGameAction(mort.state, owner, { type: 'UNMORTGAGE_PROPERTY', tileId: 3 }, rng);
    expect(unmort.ok).toBe(true);
    if (!unmort.ok) return;
    expect(unmort.state.properties[3]!.mortgaged).toBe(false);
    expect(unmort.state.players[owner]!.cash).toBe(1522);
  });
});