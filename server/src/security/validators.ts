import {
  BOARD_TILE_COUNT,
  BOT_DIFFICULTIES,
  CHAT_MAX_LENGTH,
  MAX_PLAYERS_HARD_LIMIT,
  MIN_PLAYERS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SETTINGS_BOUNDS,
  TOKEN_SHAPES,
} from '@capitalloop/shared';
import { z } from 'zod';

const roomCodeRegex = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const controlCharsRegex = /[\u0000-\u001f\u007f]/;

export const roomCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => roomCodeRegex.test(v), {
    message: `Room code must be ${ROOM_CODE_LENGTH} valid characters.`,
  });

export const nicknameSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN_LENGTH, `Nickname must be at least ${NICKNAME_MIN_LENGTH} characters.`)
  .max(NICKNAME_MAX_LENGTH, `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`)
  .refine((v) => !/[<>]/.test(v), 'Nickname cannot contain < or > characters.')
  .refine((v) => !controlCharsRegex.test(v), 'Nickname contains invalid control characters.');

export const tokenShapeSchema = z.enum(TOKEN_SHAPES);
export const colorHexSchema = z.string().regex(hexColorRegex, 'Invalid hex color.');
export const botDifficultySchema = z.enum(BOT_DIFFICULTIES);

export const botSeedSchema = z.object({
  difficulty: botDifficultySchema,
  nickname: nicknameSchema.optional(),
});

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  preferredColor: colorHexSchema.optional(),
  preferredToken: tokenShapeSchema.optional(),
  bots: z.array(botSeedSchema).max(MAX_PLAYERS_HARD_LIMIT - 1).optional(),
});

export const joinRoomSchema = z.object({
  roomCode: roomCodeSchema,
  nickname: nicknameSchema,
  preferredColor: colorHexSchema.optional(),
  preferredToken: tokenShapeSchema.optional(),
});

export const authEnvelopeSchema = z.object({
  roomCode: roomCodeSchema,
  playerId: z.string().min(3).max(64),
  sessionToken: z.string().min(32).max(128),
});

export const setReadySchema = authEnvelopeSchema.extend({
  isReady: z.boolean(),
});

export const updateProfileSchema = authEnvelopeSchema.extend({
  color: colorHexSchema.optional(),
  tokenShape: tokenShapeSchema.optional(),
});

export const toggleLockSchema = authEnvelopeSchema.extend({
  isLocked: z.boolean(),
});

export const kickPlayerSchema = authEnvelopeSchema.extend({
  targetPlayerId: z.string().min(3).max(64),
});

export const addBotSchema = authEnvelopeSchema.extend({
  difficulty: botDifficultySchema,
  nickname: nicknameSchema.optional(),
});

export const removeBotSchema = authEnvelopeSchema.extend({
  botId: z.string().min(3).max(64),
});

export const updateBotDifficultySchema = authEnvelopeSchema.extend({
  botId: z.string().min(3).max(64),
  difficulty: botDifficultySchema,
});

export const matchmakingJoinSchema = z.object({
  nickname: nicknameSchema,
  mapId: z.enum(['classic-metro', 'global-capitals']).default('classic-metro'),
  gameSpeed: z.enum(['NORMAL', 'FAST']).default('NORMAL'),
  targetPlayers: z.number().int().min(MIN_PLAYERS).max(4).default(2),
  preferredColor: colorHexSchema.optional(),
  preferredToken: tokenShapeSchema.optional(),
});

export const partialSettingsSchema = z
  .object({
    mapId: z.enum(['classic-metro', 'global-capitals']).optional(),
    maxPlayers: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.maxPlayers.min)
      .max(SETTINGS_BOUNDS.maxPlayers.max)
      .optional(),
    startingCash: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.startingCash.min)
      .max(SETTINGS_BOUNDS.startingCash.max)
      .refine((v) => v % SETTINGS_BOUNDS.startingCash.step === 0, 'Invalid starting cash step.')
      .optional(),
    passStartBonus: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.passStartBonus.min)
      .max(SETTINGS_BOUNDS.passStartBonus.max)
      .refine((v) => v % SETTINGS_BOUNDS.passStartBonus.step === 0, 'Invalid Start bonus step.')
      .optional(),
    turnTimerSeconds: z
      .number()
      .int()
      .refine(
        (v) => (SETTINGS_BOUNDS.turnTimerOptions as readonly number[]).includes(v),
        'Invalid turn timer option.',
      )
      .optional(),
    incomeTaxMode: z.enum(['FLAT_200', 'PERCENT_10', 'CHOICE_FLAT_OR_PERCENT']).optional(),
    auctionDeclinedProperties: z.boolean().optional(),
    doubleRentOnColorSet: z.boolean().optional(),
    vacationPotEnabled: z.boolean().optional(),
    evenBuilding: z.boolean().optional(),
    limitedSupply: z.boolean().optional(),
    tradingEnabled: z.boolean().optional(),
    mortgageEnabled: z.boolean().optional(),
    mortgageInterestPercent: z
      .number()
      .int()
      .refine(
        (v) => (SETTINGS_BOUNDS.mortgageInterestOptions as readonly number[]).includes(v),
        'Invalid mortgage interest option.',
      )
      .optional(),
    doublesExtraTurn: z.boolean().optional(),
    threeDoublesToJail: z.boolean().optional(),
    bankruptcyTransferMode: z.enum(['CREDITOR', 'BANK']).optional(),
    gameSpeed: z.enum(['NORMAL', 'FAST']).optional(),
    doubleGoOnExactLand: z.boolean().optional(),
    collectRentInJail: z.boolean().optional(),
  })
  .strict();

export const updateSettingsSchema = authEnvelopeSchema.extend({
  settings: partialSettingsSchema,
});

export const chatSendSchema = authEnvelopeSchema.extend({
  text: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(CHAT_MAX_LENGTH)
    .refine((v) => !controlCharsRegex.test(v), 'Message contains invalid control characters.'),
});

const tileIdSchema = z.number().int().min(0).max(BOARD_TILE_COUNT - 1);

const tradeOfferItemSchema = z.object({
  cash: z.number().int().min(0).max(1_000_000),
  propertyIds: z.array(tileIdSchema).max(28),
  jailFreeCards: z.number().int().min(0).max(2),
});

export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ROLL_DICE') }),
  z.object({ type: z.literal('BUY_PROPERTY') }),
  z.object({ type: z.literal('DECLINE_PROPERTY') }),
  z.object({ type: z.literal('PLACE_BID'), amount: z.number().int().min(1).max(1_000_000) }),
  z.object({ type: z.literal('PASS_AUCTION') }),
  z.object({ type: z.literal('BUILD_HOUSE'), tileId: tileIdSchema }),
  z.object({ type: z.literal('SELL_HOUSE'), tileId: tileIdSchema }),
  z.object({ type: z.literal('MORTGAGE_PROPERTY'), tileId: tileIdSchema }),
  z.object({ type: z.literal('UNMORTGAGE_PROPERTY'), tileId: tileIdSchema }),
  z.object({ type: z.literal('PAY_JAIL_BAIL') }),
  z.object({ type: z.literal('USE_JAIL_CARD') }),
  z.object({ type: z.literal('CHOOSE_TAX_OPTION'), choice: z.enum(['FLAT', 'PERCENT']) }),
  z.object({ type: z.literal('ACKNOWLEDGE_CARD') }),
  z.object({
    type: z.literal('PROPOSE_TRADE'),
    recipientId: z.string().min(3).max(64),
    offered: tradeOfferItemSchema,
    requested: tradeOfferItemSchema,
  }),
  z.object({ type: z.literal('ACCEPT_TRADE'), tradeId: z.string().min(3).max(64) }),
  z.object({ type: z.literal('REJECT_TRADE'), tradeId: z.string().min(3).max(64) }),
  z.object({ type: z.literal('CANCEL_TRADE'), tradeId: z.string().min(3).max(64) }),
  z.object({
    type: z.literal('COUNTER_TRADE'),
    tradeId: z.string().min(3).max(64),
    offered: tradeOfferItemSchema,
    requested: tradeOfferItemSchema,
  }),
  z.object({ type: z.literal('PAY_DEBT') }),
  z.object({ type: z.literal('DECLARE_BANKRUPTCY') }),
  z.object({ type: z.literal('END_TURN') }),
]);

export const gameActionEnvelopeSchema = authEnvelopeSchema.extend({
  action: gameActionSchema,
});
