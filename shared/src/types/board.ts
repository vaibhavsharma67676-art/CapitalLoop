export type MapId = 'classic-metro' | 'global-capitals';

export type CountryCode = 'BR' | 'IT' | 'DE' | 'IN' | 'JP' | 'FR' | 'GB' | 'US' | 'AE' | 'SG';

export type ColorGroup =
  | 'brown'
  | 'lightBlue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkBlue';

export type TileType =
  | 'START'
  | 'STREET'
  | 'TRANSIT'
  | 'UTILITY'
  | 'TAX'
  | 'CHANCE'
  | 'COMMUNITY'
  | 'JAIL'
  | 'VACATION'
  | 'GO_TO_JAIL';

export interface BaseTile {
  id: number;
  position: number;
  name: string;
  shortLabel: string;
  type: TileType;
  badgeCode: string;
}

export interface StreetTile extends BaseTile {
  type: 'STREET';
  colorGroup: ColorGroup;
  country: string;
  countryCode: CountryCode;
  countryFlag: string;
  price: number;
  baseRent: number;
  rent1House: number;
  rent2Houses: number;
  rent3Houses: number;
  rent4Houses: number;
  rentHotel: number;
  houseCost: number;
  hotelCost: number;
  mortgageValue: number;
  specialRules?: string;
}

export interface TransitTile extends BaseTile {
  type: 'TRANSIT';
  country: string;
  countryCode: CountryCode;
  countryFlag: string;
  price: number;
  mortgageValue: number;
  specialRules?: string;
}

export interface UtilityTile extends BaseTile {
  type: 'UTILITY';
  utilityKind: 'ELECTRIC' | 'WATER';
  price: number;
  mortgageValue: number;
  specialRules?: string;
}

export interface TaxTile extends BaseTile {
  type: 'TAX';
  taxKind: 'INCOME' | 'LUXURY';
  flatAmount: number;
}

export interface CardTile extends BaseTile {
  type: 'CHANCE' | 'COMMUNITY';
}

export interface CornerTile extends BaseTile {
  type: 'START' | 'JAIL' | 'VACATION' | 'GO_TO_JAIL';
}

export type BoardTile =
  | StreetTile
  | TransitTile
  | UtilityTile
  | TaxTile
  | CardTile
  | CornerTile;

export type PurchasableTile = StreetTile | TransitTile | UtilityTile;

export interface BoardMapDefinition {
  id: MapId;
  name: string;
  description: string;
  currencySymbol: string;
  tiles: readonly BoardTile[];
}

export function isPurchasableTile(tile: BoardTile): tile is PurchasableTile {
  return tile.type === 'STREET' || tile.type === 'TRANSIT' || tile.type === 'UTILITY';
}

export function isStreetTile(tile: BoardTile): tile is StreetTile {
  return tile.type === 'STREET';
}
