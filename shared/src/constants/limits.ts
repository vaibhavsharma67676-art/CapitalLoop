export const ROOM_CODE_LENGTH = 5;

/**
 * Unambiguous uppercase alphanumeric alphabet (excludes 0, O, 1, I)
 * so friends can read and type private room codes without confusion.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS_HARD_LIMIT = 8;

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 18;

export const CHAT_MAX_LENGTH = 240;
export const MAX_CHAT_HISTORY = 120;
export const MAX_LOG_ENTRIES = 150;
export const MAX_ACTIVE_TRADES_PER_PLAYER = 3;

export const BOARD_TILE_COUNT = 40;
export const START_TILE_ID = 0;
export const JAIL_TILE_ID = 10;
export const VACATION_TILE_ID = 20;
export const GO_TO_JAIL_TILE_ID = 30;

export const BANK_HOUSE_SUPPLY = 32;
export const BANK_HOTEL_SUPPLY = 12;
export const MAX_HOUSES_BEFORE_HOTEL = 4;
export const HOTEL_LEVEL = 5;

export const JAIL_BAIL_AMOUNT = 50;
export const MAX_JAIL_TURNS = 3;

export const INCOME_TAX_FLAT_AMOUNT = 200;
export const INCOME_TAX_PERCENT = 10;
export const LUXURY_TAX_AMOUNT = 100;

export const AUCTION_MIN_BID = 1;
export const AUCTION_BASE_DURATION_MS = 18_000;
export const AUCTION_FAST_DURATION_MS = 10_000;
export const AUCTION_BID_RESET_MS = 8_000;
export const AUCTION_FAST_BID_RESET_MS = 5_000;

export const TRANSIT_RENT_SCHEDULE: readonly [number, number, number, number] = [25, 50, 100, 200];
export const UTILITY_MULTIPLIERS: readonly [number, number] = [4, 10];