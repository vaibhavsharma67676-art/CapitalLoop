import {
  getColorGroupTiles,
  getEligibleMortgageOptions,
  getTileById,
  getTransitTiles,
  getUnmortgageCost,
  HOTEL_LEVEL,
  isPurchasableTile,
  JAIL_BAIL_AMOUNT,
  MAX_HOUSES_BEFORE_HOTEL,
  type BotDifficulty,
  type ClientGameState,
  type ColorGroup,
  type GameAction,
  type PlayerGameState,
  type TradeOffer,
} from '@capitalloop/shared';

interface DifficultyProfile {
  minCashReserve: number;
  buyThresholdRatio: number;
  allowMortgageForPurchase: boolean;
  auctionMaxMultiplier: number;
  buildReserve: number;
  unmortgageReserve: number;
  tradeAcceptMargin: number;
  proposeTradeEnabled: boolean;
  payBailEarly: boolean;
}

const DIFFICULTY_PROFILES: Record<BotDifficulty, DifficultyProfile> = {
  EASY: {
    minCashReserve: 260,
    buyThresholdRatio: 0.72,
    allowMortgageForPurchase: false,
    auctionMaxMultiplier: 0.75,
    buildReserve: 450,
    unmortgageReserve: 500,
    tradeAcceptMargin: 0.85,
    proposeTradeEnabled: false,
    payBailEarly: false,
  },
  MEDIUM: {
    minCashReserve: 160,
    buyThresholdRatio: 0.9,
    allowMortgageForPurchase: true,
    auctionMaxMultiplier: 0.95,
    buildReserve: 260,
    unmortgageReserve: 300,
    tradeAcceptMargin: 1.0,
    proposeTradeEnabled: false,
    payBailEarly: true,
  },
  HARD: {
    minCashReserve: 110,
    buyThresholdRatio: 1.05,
    allowMortgageForPurchase: true,
    auctionMaxMultiplier: 1.15,
    buildReserve: 180,
    unmortgageReserve: 220,
    tradeAcceptMargin: 1.1,
    proposeTradeEnabled: true,
    payBailEarly: true,
  },
  EXPERT: {
    minCashReserve: 80,
    buyThresholdRatio: 1.2,
    allowMortgageForPurchase: true,
    auctionMaxMultiplier: 1.28,
    buildReserve: 130,
    unmortgageReserve: 170,
    tradeAcceptMargin: 1.18,
    proposeTradeEnabled: true,
    payBailEarly: true,
  },
};

function getProfile(player: PlayerGameState): DifficultyProfile {
  return DIFFICULTY_PROFILES[player.botDifficulty ?? 'MEDIUM'];
}

function ownsFullSet(state: ClientGameState, playerId: string, group: ColorGroup): boolean {
  const tiles = getColorGroupTiles(state.settings.mapId, group);
  return tiles.length > 0 && tiles.every((t) => state.properties[t.id]?.ownerId === playerId);
}

function groupHasMortgaged(state: ClientGameState, group: ColorGroup): boolean {
  const tiles = getColorGroupTiles(state.settings.mapId, group);
  return tiles.some((t) => state.properties[t.id]?.mortgaged === true);
}

function groupHasBuildings(state: ClientGameState, group: ColorGroup): boolean {
  const tiles = getColorGroupTiles(state.settings.mapId, group);
  return tiles.some((t) => (state.properties[t.id]?.houses ?? 0) > 0);
}

function countOwnedInGroup(state: ClientGameState, playerId: string, group: ColorGroup): number {
  const tiles = getColorGroupTiles(state.settings.mapId, group);
  return tiles.filter((t) => state.properties[t.id]?.ownerId === playerId).length;
}

function isPropertyStrategic(state: ClientGameState, botId: string, tileId: number): boolean {
  const tile = getTileById(state.settings.mapId, tileId);
  if (tile.type === 'STREET') {
    const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
    const myCount = countOwnedInGroup(state, botId, tile.colorGroup);
    if (myCount >= groupTiles.length - 1) return true; // Completes a color set!
    // Also strategic if it blocks an opponent from completing a color set
    for (const otherId of state.turnOrder) {
      if (otherId === botId) continue;
      const other = state.players[otherId];
      if (!other || other.isBankrupt) continue;
      if (countOwnedInGroup(state, otherId, tile.colorGroup) >= groupTiles.length - 1) {
        return true;
      }
    }
  }
  if (tile.type === 'TRANSIT') {
    const airports = getTransitTiles(state.settings.mapId);
    const owned = airports.filter((a) => state.properties[a.id]?.ownerId === botId).length;
    if (owned >= 2) return true;
  }
  return false;
}

function evaluatePropertyValue(
  state: ClientGameState,
  botId: string,
  tileId: number,
  profile: DifficultyProfile,
): number {
  const tile = getTileById(state.settings.mapId, tileId);
  if (!isPurchasableTile(tile)) return 0;

  let multiplier = profile.buyThresholdRatio;
  if (tile.type === 'STREET') {
    const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
    const myCount = countOwnedInGroup(state, botId, tile.colorGroup);
    if (myCount >= groupTiles.length - 1) {
      multiplier += 0.35; // Huge monopoly completion bonus
    } else if (myCount > 0) {
      multiplier += 0.12;
    }
    for (const otherId of state.turnOrder) {
      if (otherId === botId) continue;
      const other = state.players[otherId];
      if (other && !other.isBankrupt && countOwnedInGroup(state, otherId, tile.colorGroup) >= groupTiles.length - 1) {
        multiplier += 0.22; // Defensive block value
        break;
      }
    }
  } else if (tile.type === 'TRANSIT') {
    const airports = getTransitTiles(state.settings.mapId);
    const owned = airports.filter((a) => state.properties[a.id]?.ownerId === botId).length;
    multiplier += owned * 0.14;
  }

  return Math.round(tile.price * multiplier);
}

function pickBestBuildingToSell(state: ClientGameState, botId: string): number | null {
  let bestTileId: number | null = null;
  let lowestCost = Number.POSITIVE_INFINITY;

  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== botId || prop.houses <= 0) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (tile.type !== 'STREET') continue;

    if (state.settings.evenBuilding) {
      const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
      const maxH = Math.max(...groupTiles.map((t) => state.properties[t.id]?.houses ?? 0));
      if (prop.houses < maxH) continue;
    }
    if (
      prop.houses === HOTEL_LEVEL &&
      state.settings.limitedSupply &&
      state.bankHousesRemaining < MAX_HOUSES_BEFORE_HOTEL
    ) {
      continue;
    }

    if (tile.houseCost < lowestCost) {
      lowestCost = tile.houseCost;
      bestTileId = prop.tileId;
    }
  }
  return bestTileId;
}

function pickBestMortgageCandidate(
  state: ClientGameState,
  botId: string,
  excludeColorGroup?: ColorGroup,
): number | null {
  const options = getEligibleMortgageOptions(state, botId);
  if (options.length === 0) return null;

  // Prefer mortgaging single uncompleted properties / utilities before breaking strong sets
  const scored = options
    .filter((opt) => !(excludeColorGroup && opt.tile.type === 'STREET' && opt.tile.colorGroup === excludeColorGroup))
    .map((opt) => {
      let penalty = 0;
      if (opt.tile.type === 'STREET') {
        if (ownsFullSet(state, botId, opt.tile.colorGroup)) penalty += 1000;
        penalty += countOwnedInGroup(state, botId, opt.tile.colorGroup) * 100;
      } else if (opt.tile.type === 'TRANSIT') {
        penalty += 150;
      }
      return { tileId: opt.tileId, score: penalty + opt.mortgageValue };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0]?.tileId ?? options[0]?.tileId ?? null;
}

function pickBestBuildCandidate(
  state: ClientGameState,
  bot: PlayerGameState,
  profile: DifficultyProfile,
): number | null {
  let bestTileId: number | null = null;
  let bestScore = -1;

  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== bot.id || prop.mortgaged || prop.houses >= HOTEL_LEVEL) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (tile.type !== 'STREET') continue;
    if (!ownsFullSet(state, bot.id, tile.colorGroup)) continue;
    if (groupHasMortgaged(state, tile.colorGroup)) continue;

    if (state.settings.evenBuilding) {
      const groupTiles = getColorGroupTiles(state.settings.mapId, tile.colorGroup);
      const minH = Math.min(...groupTiles.map((t) => state.properties[t.id]?.houses ?? 0));
      if (prop.houses > minH) continue;
    }

    const isHotel = prop.houses === MAX_HOUSES_BEFORE_HOTEL;
    const cost = isHotel ? tile.hotelCost : tile.houseCost;

    if (state.settings.limitedSupply) {
      if (isHotel && state.bankHotelsRemaining < 1) continue;
      if (!isHotel && state.bankHousesRemaining < 1) continue;
    }

    if (bot.cash - cost < profile.buildReserve) continue;

    // Prioritize high-ROI orange/red/yellow/green groups and pushing toward 3-house sweet spot
    const rentJump =
      prop.houses === 0
        ? tile.rent1House - tile.baseRent
        : prop.houses === 1
          ? tile.rent2Houses - tile.rent1House
          : prop.houses === 2
            ? tile.rent3Houses - tile.rent2Houses
            : prop.houses === 3
              ? tile.rent4Houses - tile.rent3Houses
              : tile.rentHotel - tile.rent4Houses;

    const score = rentJump / Math.max(1, cost);
    if (score > bestScore) {
      bestScore = score;
      bestTileId = tile.id;
    }
  }

  return bestTileId;
}

function pickBestUnmortgageCandidate(
  state: ClientGameState,
  bot: PlayerGameState,
  profile: DifficultyProfile,
): number | null {
  if (!state.settings.mortgageEnabled) return null;

  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== bot.id || !prop.mortgaged) continue;
    const tile = getTileById(state.settings.mapId, prop.tileId);
    if (!isPurchasableTile(tile)) continue;
    const cost = getUnmortgageCost(tile, state.settings.mortgageInterestPercent);
    if (bot.cash - cost >= profile.unmortgageReserve) {
      return tile.id;
    }
  }
  return null;
}

function evaluateTradeForBot(
  state: ClientGameState,
  bot: PlayerGameState,
  trade: TradeOffer,
  profile: DifficultyProfile,
): boolean {
  const incomingValue =
    trade.offered.cash +
    trade.offered.jailFreeCards * 50 +
    trade.offered.propertyIds.reduce(
      (sum, tid) => sum + evaluatePropertyValue(state, bot.id, tid, profile),
      0,
    );

  const outgoingValue =
    trade.requested.cash +
    trade.requested.jailFreeCards * 50 +
    trade.requested.propertyIds.reduce((sum, tid) => {
      const tile = getTileById(state.settings.mapId, tid);
      let base = isPurchasableTile(tile) ? tile.price : 0;
      if (tile.type === 'STREET') {
        if (ownsFullSet(state, bot.id, tile.colorGroup)) {
          base *= 2.2; // Never cheaply give away an already completed monopoly
        } else if (countOwnedInGroup(state, trade.proposerId, tile.colorGroup) >= getColorGroupTiles(state.settings.mapId, tile.colorGroup).length - 1) {
          base *= 1.5; // Opponent wants monopoly completion — demand fair premium
        }
      }
      return sum + Math.round(base);
    }, 0);

  if (bot.cash - trade.requested.cash + trade.offered.cash < Math.min(80, profile.minCashReserve)) {
    return false;
  }

  return incomingValue >= outgoingValue * profile.tradeAcceptMargin;
}

function maybeBuildStrategicTradeProposal(
  state: ClientGameState,
  bot: PlayerGameState,
  profile: DifficultyProfile,
): GameAction | null {
  if (!state.settings.tradingEnabled || !profile.proposeTradeEnabled) return null;
  if (state.turnNumber < 6) return null;

  const alreadyHasPending = state.trades.some(
    (t) => t.proposerId === bot.id && t.status === 'PENDING',
  );
  if (alreadyHasPending) return null;

  // Look for a color group where bot is 1 tile short and another player holds that single tile
  const groups: ColorGroup[] = [
    'orange',
    'red',
    'yellow',
    'lightBlue',
    'pink',
    'green',
    'brown',
    'darkBlue',
  ];

  for (const group of groups) {
    const tiles = getColorGroupTiles(state.settings.mapId, group);
    if (groupHasBuildings(state, group)) continue;
    const missing = tiles.filter((t) => state.properties[t.id]?.ownerId !== bot.id);
    if (missing.length !== 1) continue;

    const targetTile = missing[0]!;
    const targetOwnerId = state.properties[targetTile.id]?.ownerId;
    if (!targetOwnerId || targetOwnerId === bot.id) continue;
    const owner = state.players[targetOwnerId];
    if (!owner || owner.isBankrupt) continue;

    // Avoid spamming repeated offers for the same tile
    const alreadyTried = state.trades.some(
      (t) =>
        t.proposerId === bot.id &&
        t.recipientId === targetOwnerId &&
        t.requested.propertyIds.includes(targetTile.id),
    );
    if (alreadyTried) continue;

    const cashOffer = Math.round(targetTile.price * (bot.botDifficulty === 'EXPERT' ? 1.35 : 1.25));
    if (bot.cash - cashOffer < profile.minCashReserve) continue;

    return {
      type: 'PROPOSE_TRADE',
      recipientId: targetOwnerId,
      offered: { cash: cashOffer, propertyIds: [], jailFreeCards: 0 },
      requested: { cash: 0, propertyIds: [targetTile.id], jailFreeCards: 0 },
    };
  }

  return null;
}

/**
 * Pure, fair AI decision function for incoming trades targeting a bot.
 * Operates exclusively on public ClientGameState.
 */
export function decideBotTradeResponse(
  state: ClientGameState,
  botId: string,
): GameAction | null {
  if (state.phase === 'AUCTION_ACTIVE' || state.phase === 'GAME_OVER') return null;
  const bot = state.players[botId];
  if (!bot || !bot.isBot || bot.isBankrupt) return null;

  const incoming = state.trades.find(
    (t) => t.status === 'PENDING' && t.recipientId === botId,
  );
  if (!incoming) return null;

  const profile = getProfile(bot);
  const accept = evaluateTradeForBot(state, bot, incoming, profile);
  return accept
    ? { type: 'ACCEPT_TRADE', tradeId: incoming.id }
    : { type: 'REJECT_TRADE', tradeId: incoming.id };
}

/**
 * Pure, fair AI decision function for live auctions.
 * Operates exclusively on public ClientGameState.
 */
export function decideBotAuctionAction(
  state: ClientGameState,
  botId: string,
): GameAction | null {
  if (state.phase !== 'AUCTION_ACTIVE' || !state.activeAuction) return null;
  const auction = state.activeAuction;
  const bot = state.players[botId];
  if (!bot || !bot.isBot || bot.isBankrupt) return null;
  if (!auction.eligiblePlayerIds.includes(botId)) return null;
  if (auction.passedPlayerIds.includes(botId)) return null;
  if (auction.highestBidderId === botId) return null;

  const profile = getProfile(bot);
  const baseValuation = evaluatePropertyValue(state, botId, auction.tileId, profile);
  const maxBid = Math.min(
    Math.max(0, bot.cash - Math.floor(profile.minCashReserve * 0.6)),
    Math.round(baseValuation * profile.auctionMaxMultiplier),
  );

  const increment = auction.currentBid < 50 ? 10 : auction.currentBid < 150 ? 15 : 20;
  const nextBid = Math.min(maxBid, Math.max(auction.currentBid + 1, auction.currentBid + increment));

  if (nextBid > auction.currentBid && nextBid <= bot.cash && nextBid <= maxBid) {
    return { type: 'PLACE_BID', amount: nextBid };
  }

  return { type: 'PASS_AUCTION' };
}

/**
 * Pure, fair AI decision function for the active bot's turn or debt resolution.
 * Never inspects hidden decks, never manipulates dice, and only emits legal GameActions.
 */
export function decideBotAction(
  state: ClientGameState,
  botId: string,
): GameAction | null {
  if (state.phase === 'GAME_OVER') return null;

  const bot = state.players[botId];
  if (!bot || !bot.isBot || bot.isBankrupt) return null;
  const profile = getProfile(bot);

  if (state.phase === 'AUCTION_ACTIVE') {
    return decideBotAuctionAction(state, botId);
  }

  // Debt resolution can belong to a non-current player (e.g., future card effects) or current player
  if (state.phase === 'DEBT_RESOLUTION' && state.pendingDebt) {
    if (state.pendingDebt.debtorId !== botId) return null;
    if (bot.cash >= state.pendingDebt.amount) {
      return { type: 'PAY_DEBT' };
    }
    const sellTile = pickBestBuildingToSell(state, botId);
    if (sellTile !== null) {
      return { type: 'SELL_HOUSE', tileId: sellTile };
    }
    const mortgageTile = pickBestMortgageCandidate(state, botId);
    if (mortgageTile !== null) {
      return { type: 'MORTGAGE_PROPERTY', tileId: mortgageTile };
    }
    return { type: 'DECLARE_BANKRUPTCY' };
  }

  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  if (currentPlayerId !== botId) return null;

  switch (state.phase) {
    case 'WAITING_FOR_ROLL': {
      if (bot.inJail) {
        if (bot.jailFreeCards > 0) {
          return { type: 'USE_JAIL_CARD' };
        }
        const unownedCount = Object.values(state.properties).filter((p) => p.ownerId === null).length;
        // Early game: escape fast to buy properties; late game: stay in jail safely if dangerous
        const wantOutFast = unownedCount > 8 || (profile.payBailEarly && state.turnNumber < 16);
        if (wantOutFast && bot.cash >= JAIL_BAIL_AMOUNT + profile.minCashReserve) {
          return { type: 'PAY_JAIL_BAIL' };
        }
      }
      return { type: 'ROLL_DICE' };
    }

    case 'CARD_REVEAL': {
      if (state.pendingCard?.drawnByPlayerId === botId) {
        return { type: 'ACKNOWLEDGE_CARD' };
      }
      return null;
    }

    case 'TAX_DECISION': {
      if (!state.pendingTax || state.pendingTax.playerId !== botId) return null;
      if (bot.botDifficulty === 'EASY') {
        return { type: 'CHOOSE_TAX_OPTION', choice: 'FLAT' };
      }
      const choice =
        state.pendingTax.percentAmount <= state.pendingTax.flatAmount ? 'PERCENT' : 'FLAT';
      return { type: 'CHOOSE_TAX_OPTION', choice };
    }

    case 'AWAITING_BUY_DECISION': {
      if (state.pendingPurchaseTileId === null) {
        return { type: 'DECLINE_PROPERTY' };
      }
      const tile = getTileById(state.settings.mapId, state.pendingPurchaseTileId);
      if (!isPurchasableTile(tile)) {
        return { type: 'DECLINE_PROPERTY' };
      }

      const valuation = evaluatePropertyValue(state, botId, tile.id, profile);
      const strategic = isPropertyStrategic(state, botId, tile.id);

      // Direct purchase if cash is comfortable
      if (bot.cash >= tile.price) {
        const remaining = bot.cash - tile.price;
        if (strategic || remaining >= profile.minCashReserve || valuation >= tile.price) {
          return { type: 'BUY_PROPERTY' };
        }
        return { type: 'DECLINE_PROPERTY' };
      }

      // Smart Mortgage-During-Purchase: if short on cash for a strategic/valuable property, mortgage first
      if (profile.allowMortgageForPurchase && state.settings.mortgageEnabled && (strategic || valuation >= tile.price)) {
        const eligible = getEligibleMortgageOptions(state, botId);
        const totalRaiseable = eligible.reduce((sum, opt) => sum + opt.mortgageValue, 0);
        if (bot.cash + totalRaiseable >= tile.price) {
          const excludeGroup = tile.type === 'STREET' ? tile.colorGroup : undefined;
          const candidate = pickBestMortgageCandidate(state, botId, excludeGroup);
          if (candidate !== null) {
            return { type: 'MORTGAGE_PROPERTY', tileId: candidate };
          }
        }
      }

      return { type: 'DECLINE_PROPERTY' };
    }

    case 'POST_ROLL_ACTIONS': {
      const buildTile = pickBestBuildCandidate(state, bot, profile);
      if (buildTile !== null) {
        return { type: 'BUILD_HOUSE', tileId: buildTile };
      }

      const unmortgageTile = pickBestUnmortgageCandidate(state, bot, profile);
      if (unmortgageTile !== null) {
        return { type: 'UNMORTGAGE_PROPERTY', tileId: unmortgageTile };
      }

      const tradeProposal = maybeBuildStrategicTradeProposal(state, bot, profile);
      if (tradeProposal !== null) {
        return tradeProposal;
      }

            return { type: 'END_TURN' };
    }

    default:
      return null;
  }
}
