import type { GameSettings } from '../types/settings';
import { MAX_PLAYERS_HARD_LIMIT, MIN_PLAYERS } from './limits';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mapId: 'classic-metro',
  maxPlayers: 6,
  startingCash: 1500,
  passStartBonus: 200,
  turnTimerSeconds: 60,
  incomeTaxMode: 'CHOICE_FLAT_OR_PERCENT',
  auctionDeclinedProperties: true,
  doubleRentOnColorSet: true,
  vacationPotEnabled: false,
  evenBuilding: true,
  limitedSupply: true,
  tradingEnabled: true,
  mortgageEnabled: true,
  mortgageInterestPercent: 10,
  doublesExtraTurn: true,
  threeDoublesToJail: true,
  bankruptcyTransferMode: 'CREDITOR',
  gameSpeed: 'NORMAL',
  doubleGoOnExactLand: false,
  collectRentInJail: true,
};

export const SETTINGS_BOUNDS = {
  maxPlayers: { min: MIN_PLAYERS, max: MAX_PLAYERS_HARD_LIMIT },
  startingCash: { min: 500, max: 5000, step: 100 },
  passStartBonus: { min: 0, max: 500, step: 50 },
  turnTimerOptions: [0, 30, 60, 90, 120] as const,
  mortgageInterestOptions: [0, 10, 20] as const,
} as const;