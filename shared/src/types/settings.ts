import type { MapId } from './board';

export type IncomeTaxMode = 'FLAT_200' | 'PERCENT_10' | 'CHOICE_FLAT_OR_PERCENT';
export type BankruptcyTransferMode = 'CREDITOR' | 'BANK';
export type GameSpeed = 'NORMAL' | 'FAST';

export interface GameSettings {
  mapId: MapId;
  maxPlayers: number;
  startingCash: number;
  passStartBonus: number;
  turnTimerSeconds: number;
  incomeTaxMode: IncomeTaxMode;
  auctionDeclinedProperties: boolean;
  doubleRentOnColorSet: boolean;
  vacationPotEnabled: boolean;
  evenBuilding: boolean;
  limitedSupply: boolean;
  tradingEnabled: boolean;
  mortgageEnabled: boolean;
  mortgageInterestPercent: number;
  doublesExtraTurn: boolean;
  threeDoublesToJail: boolean;
  bankruptcyTransferMode: BankruptcyTransferMode;
  gameSpeed: GameSpeed;
  doubleGoOnExactLand: boolean;
  collectRentInJail: boolean;
}

export type PartialGameSettings = Partial<GameSettings>;