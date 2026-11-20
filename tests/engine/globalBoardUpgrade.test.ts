import {
  applyGameAction,
  createInitialGameState,
  createSeededRng,
  DEFAULT_GAME_SETTINGS,
  getAllBoardMaps,
  getBoardMap,
  getColorGroupTiles,
  getPropertyOwnerColor,
  getPurchasableTiles,
  getTransitTiles,
  getUtilityTiles,
  type ColorGroup,
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

const EXPECTED_COUNTRIES: Array<{
  group: ColorGroup;
  country: string;
  flag: string;
  cities: string[];
}> = [
  { group: 'brown', country: 'Brazil', flag: '🇧🇷', cities: ['Salvador', 'Rio de Janeiro'] },
  { group: 'lightBlue', country: 'Italy', flag: '🇮🇹', cities: ['Venice', 'Milan', 'Rome'] },
  { group: 'pink', country: 'Germany', flag: '🇩🇪', cities: ['Frankfurt', 'Munich', 'Berlin'] },
  { group: 'orange', country: 'India', flag: '🇮🇳', cities: ['Jaipur', 'Bengaluru', 'Mumbai'] },
  { group: 'red', country: 'Japan', flag: '🇯🇵', cities: ['Osaka', 'Kyoto', 'Tokyo'] },
  { group: 'yellow', country: 'France', flag: '🇫🇷', cities: ['Lyon', 'Marseille', 'Paris'] },
  {
    group: 'green',
    country: 'United Kingdom',
    flag: '🇬🇧',
    cities: ['Manchester', 'Liverpool', 'London'],
  },
  { group: 'darkBlue', country: 'USA', flag: '🇺🇸', cities: ['San Francisco', 'New York'] },
];

const EXPECTED_AIRPORTS = [
  'Heathrow Airport – London',
  'JFK Airport – New York',
  'Dubai International Airport (DXB)',
  'Changi Airport – Singapore',
];

const EXPECTED_UTILITIES = ['Solar Power Plant', 'Water Supply / Hydro Company'];

describe('Global Property Board Redesign (28 Purchasable Properties & Ownership Colors)', () => {
  it('contains exactly 22 cities across 8 countries, 4 airports, and 2 utilities (28 total) on all maps', () => {
    for (const map of getAllBoardMaps()) {
      expect(map.tiles.length).toBe(40);

      const purchasable = getPurchasableTiles(map.id);
      expect(purchasable.length).toBe(28);

      const streets = map.tiles.filter((t) => t.type === 'STREET');
      expect(streets.length).toBe(22);

      const airports = getTransitTiles(map.id);
      expect(airports.length).toBe(4);
      expect(airports.map((a) => a.name)).toEqual(EXPECTED_AIRPORTS);

      const utilities = getUtilityTiles(map.id);
      expect(utilities.length).toBe(2);
      expect(utilities.map((u) => u.name)).toEqual(EXPECTED_UTILITIES);

      let prevMaxPrice = 0;
      for (const spec of EXPECTED_COUNTRIES) {
        const groupTiles = getColorGroupTiles(map.id, spec.group);
        expect(groupTiles.map((t) => t.name)).toEqual(spec.cities);
        for (const tile of groupTiles) {
          expect(tile.country).toBe(spec.country);
          expect(tile.countryFlag).toBe(spec.flag);
          expect(tile.price).toBeGreaterThanOrEqual(prevMaxPrice);
        }
        prevMaxPrice = Math.max(...groupTiles.map((t) => t.price));
      }
    }
  });

  it('derives property ownership color strictly from the owner player data and resets to null when returned to bank', () => {
    const map = getBoardMap('classic-metro');
    expect(map.tiles[1]!.name).toBe('Salvador');
    expect(map.tiles[39]!.name).toBe('New York');

    const state = createInitialGameState({
      roomCode: 'GLB01',
      settings: { ...DEFAULT_GAME_SETTINGS, bankruptcyTransferMode: 'BANK' },
      players: [
        { id: 'p1', nickname: 'Vaibhav', color: '#2dd4bf', tokenShape: 'crown', isConnected: true },
        { id: 'p2', nickname: 'Aarav', color: '#fb7185', tokenShape: 'rocket', isConnected: true },
        { id: 'p3', nickname: 'Riya', color: '#facc15', tokenShape: 'star', isConnected: true },
      ],
      rng: createSeededRng(42),
    });

    const buyerId = state.turnOrder[0]!;
    const buyerColor = state.players[buyerId]!.color;

    // Unowned property has no owner color
    expect(getPropertyOwnerColor(state, 3)).toBeNull();

    // Buyer lands on tile 3 (Rio de Janeiro) via 1 + 2 = 3 and buys it
    const rolled = applyGameAction(state, buyerId, { type: 'ROLL_DICE' }, scriptedRng([1, 2]));
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;

    const bought = applyGameAction(rolled.state, buyerId, { type: 'BUY_PROPERTY' }, scriptedRng([]));
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    // Ownership color matches buyer's authoritative player color
    expect(getPropertyOwnerColor(bought.state, 3)).toBe(buyerColor);

    // Buyer declares bankruptcy -> property returns to Bank -> owner color resets to null
    const bankrupt = applyGameAction(
      bought.state,
      buyerId,
      { type: 'DECLARE_BANKRUPTCY' },
      scriptedRng([]),
    );
    expect(bankrupt.ok).toBe(true);
    if (!bankrupt.ok) return;
    expect(bankrupt.state.properties[3]!.ownerId).toBeNull();
    expect(getPropertyOwnerColor(bankrupt.state, 3)).toBeNull();
  });
});
