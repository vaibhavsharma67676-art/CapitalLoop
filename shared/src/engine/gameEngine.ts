import { CHANCE_CARD_BY_ID } from '../cards/chanceCards';
import { COMMUNITY_CARD_BY_ID } from '../cards/communityCards';
import {
  HOTEL_LEVEL,
  JAIL_BAIL_AMOUNT,
  MAX_HOUSES_BEFORE_HOTEL,
  MAX_JAIL_TURNS,
} from '../constants/limits';
import { getTileById } from '../maps/mapRegistry';
import {
  computeRankings,
  executeBankruptcyTransfer,
  getActivePlayerIds,
} from '../rules/bankruptcyRules';
import {
  getPlayerBuildingCounts,
  validateBuildHouse,
  validateSellHouse,
} from '../rules/buildingRules';
import {
  consumeAndReturnJailCard,
  releasePlayerFromJail,
  sendPlayerToJail,
  validatePayJailBail,
  validateUseJailCard,
} from '../rules/jailRules';
import { canLiquidateInPhase, validateMortgage, validateUnmortgage } from '../rules/mortgageRules';
import { calculateRent, type RentCalculationOverrides } from '../rules/rentRules';
import { resolveTaxAssessment } from '../rules/taxRules';
import {
  executeTradeTransfer,
  validateAcceptTrade,
  validateProposeTrade,
} from '../rules/tradeRules';
import type { ActionErrorCode, ActionResult, GameAction } from '../types/actions';
import { isPurchasableTile } from '../types/board';
import type { CardDeckType, CardDefinition } from '../types/cards';
import type { GameDomainEvent } from '../types/events';
import type { DiceRollResult, GamePhase, GameState, TradeOffer } from '../types/game';
import {
  applyAuctionBid,
  applyAuctionPass,
  finalizeAuction,
  startPropertyAuction,
} from './auctionEngine';
import { advancePlayerSteps, findNearestTileOfType, movePlayerToTile } from './movementEngine';
import { createDefaultRng, type RngProvider } from './rng';
import { appendLog, computeTurnDeadline } from './stateFactory';

function fail(code: ActionErrorCode, error: string): ActionResult {
  return { ok: false, code, error };
}

function getCurrentPlayerId(state: GameState): string {
  return state.turnOrder[state.currentPlayerIndex] ?? '';
}

function finishTurnTransition(state: GameState, grantExtraTurn: boolean): void {
  const currentId = getCurrentPlayerId(state);
  const currentPlayer = state.players[currentId];

  if (
    grantExtraTurn &&
    currentPlayer &&
    !currentPlayer.isBankrupt &&
    !currentPlayer.inJail &&
    state.settings.doublesExtraTurn
  ) {
    state.phase = 'WAITING_FOR_ROLL';
    state.hasRolledThisTurn = false;
    state.extraTurnPending = false;
    return;
  }

  state.phase = 'POST_ROLL_ACTIONS';
  state.hasRolledThisTurn = true;
  state.extraTurnPending = false;
}

function advanceToNextPlayerTurn(
  state: GameState,
  rng: RngProvider,
  events: GameDomainEvent[],
): void {
  const activeIds = getActivePlayerIds(state);
  if (activeIds.length <= 1) {
    finalizeGameOver(state, rng, events);
    return;
  }

  const totalSlots = state.turnOrder.length;
  let nextIndex = state.currentPlayerIndex;

  for (let step = 1; step <= totalSlots; step += 1) {
    const candidateIndex = (state.currentPlayerIndex + step) % totalSlots;
    const candidateId = state.turnOrder[candidateIndex];
    const candidate = candidateId ? state.players[candidateId] : undefined;
    if (candidate && !candidate.isBankrupt) {
      nextIndex = candidateIndex;
      break;
    }
  }

  const prevId = getCurrentPlayerId(state);
  const prevPlayer = state.players[prevId];
  if (prevPlayer) {
    prevPlayer.consecutiveDoubles = 0;
  }

  state.currentPlayerIndex = nextIndex;
  state.turnNumber += 1;
  state.phase = 'WAITING_FOR_ROLL';
  state.hasRolledThisTurn = false;
  state.extraTurnPending = false;
  state.pendingPurchaseTileId = null;
  state.pendingTax = null;
  state.pendingCard = null;
  state.pendingDebt = null;

  const now = rng.now();
  state.turnStartedAt = now;
  state.turnDeadlineAt = computeTurnDeadline(state.settings, now);

  const nextPlayerId = getCurrentPlayerId(state);
  events.push({ type: 'TURN_CHANGED', nextPlayerId, turnNumber: state.turnNumber });
}

function finalizeGameOver(
  state: GameState,
  rng: RngProvider,
  events: GameDomainEvent[],
): void {
  const activeIds = getActivePlayerIds(state);
  const winnerId = activeIds[0] ?? state.turnOrder[0] ?? null;

  state.phase = 'GAME_OVER';
  state.winnerId = winnerId;
  state.finishedAt = rng.now();
  state.turnDeadlineAt = null;
  state.pendingPurchaseTileId = null;
  state.pendingTax = null;
  state.pendingCard = null;
  state.pendingDebt = null;
  state.activeAuction = null;
  state.rankings = computeRankings(state);

  if (winnerId) {
    const winner = state.players[winnerId];
    appendLog(state, rng, 'VICTORY', `${winner?.nickname ?? 'Player'} won the game!`, {
      actorId: winnerId,
    });
    events.push({ type: 'GAME_FINISHED', winnerId });
  }
}

function chargeOrCreateDebt(
  state: GameState,
  rng: RngProvider,
  events: GameDomainEvent[],
  params: {
    debtorId: string;
    creditorId: string | null;
    amount: number;
    reason: string;
    addToVacationPot: boolean;
    resumePhase: GamePhase;
    grantExtraTurnOnResolve: boolean;
    tileId?: number;
    isRent?: boolean;
    isTax?: boolean;
  },
): boolean {
  const debtor = state.players[params.debtorId];
  if (!debtor) return true;
  if (params.amount <= 0) return true;

  if (debtor.cash >= params.amount) {
    debtor.cash -= params.amount;
    if (params.creditorId) {
      const creditor = state.players[params.creditorId];
      if (creditor && !creditor.isBankrupt) {
        creditor.cash += params.amount;
        if (params.isRent) {
          debtor.stats.rentPaid += params.amount;
          creditor.stats.rentCollected += params.amount;
          events.push({
            type: 'RENT_PAID',
            fromPlayerId: debtor.id,
            toPlayerId: creditor.id,
            tileId: params.tileId ?? debtor.position,
            amount: params.amount,
          });
          appendLog(
            state,
            rng,
            'RENT',
            `${debtor.nickname} paid $${params.amount} rent to ${creditor.nickname} (${params.reason}).`,
            { actorId: debtor.id, tileId: params.tileId, amount: params.amount },
          );
        }
      }
    } else {
      if (params.addToVacationPot && state.settings.vacationPotEnabled) {
        state.vacationPot += params.amount;
      }
      if (params.isTax) {
        events.push({
          type: 'TAX_PAID',
          playerId: debtor.id,
          tileId: params.tileId ?? debtor.position,
          amount: params.amount,
          addedToPot: params.addToVacationPot && state.settings.vacationPotEnabled,
        });
        appendLog(state, rng, 'TAX', `${debtor.nickname} paid $${params.amount} (${params.reason}).`, {
          actorId: debtor.id,
          tileId: params.tileId,
          amount: params.amount,
        });
      }
    }
    return true;
  }

  state.pendingDebt = {
    debtorId: params.debtorId,
    creditorId: params.creditorId,
    amount: params.amount,
    reason: params.reason,
    addToVacationPot: params.addToVacationPot,
    resumePhase: params.resumePhase,
    grantExtraTurnOnResolve: params.grantExtraTurnOnResolve,
  };
  state.phase = 'DEBT_RESOLUTION';

  appendLog(
    state,
    rng,
    'SYSTEM',
    `${debtor.nickname} owes $${params.amount} for ${params.reason} and must raise funds or declare bankruptcy.`,
    { actorId: debtor.id, amount: params.amount },
  );
  events.push({
    type: 'DEBT_REQUIRED',
    debtorId: debtor.id,
    creditorId: params.creditorId,
    amount: params.amount,
    reason: params.reason,
  });
  return false;
}

function drawTopCard(state: GameState, deck: CardDeckType): CardDefinition | null {
  const order = deck === 'CHANCE' ? state.decks.chanceOrder : state.decks.communityOrder;
  const cardId = order.shift();
  if (!cardId) return null;

  const lookup = deck === 'CHANCE' ? CHANCE_CARD_BY_ID : COMMUNITY_CARD_BY_ID;
  const card = lookup[cardId];
  if (!card) return null;

  if (card.effect.kind !== 'GET_OUT_OF_JAIL_FREE') {
    order.push(cardId);
  }
  return card;
}

function resolveLanding(
  state: GameState,
  playerId: string,
  diceTotal: number,
  grantExtraTurn: boolean,
  rng: RngProvider,
  events: GameDomainEvent[],
  rentOverrides: RentCalculationOverrides = {},
): void {
  const player = state.players[playerId];
  if (!player) return;

  const tile = getTileById(state.settings.mapId, player.position);

  if (tile.type === 'START' || tile.type === 'JAIL') {
    finishTurnTransition(state, grantExtraTurn);
    return;
  }

  if (tile.type === 'VACATION') {
    if (state.settings.vacationPotEnabled && state.vacationPot > 0) {
      const pot = state.vacationPot;
      player.cash += pot;
      state.vacationPot = 0;
      appendLog(state, rng, 'SYSTEM', `${player.nickname} collected $${pot} from the Vacation pot!`, {
        actorId: player.id,
        tileId: tile.id,
        amount: pot,
      });
      events.push({ type: 'VACATION_POT_WON', playerId: player.id, amount: pot });
    }
    finishTurnTransition(state, grantExtraTurn);
    return;
  }

  if (tile.type === 'GO_TO_JAIL') {
    sendPlayerToJail(state, player.id);
    appendLog(state, rng, 'JAIL', `${player.nickname} landed on Go to Prison!`, {
      actorId: player.id,
      tileId: tile.id,
    });
    events.push({ type: 'SENT_TO_JAIL', playerId: player.id, reason: 'Landed on Go to Prison' });
    finishTurnTransition(state, false);
    return;
  }

  if (tile.type === 'TAX') {
    const assessment = resolveTaxAssessment(state, player.id, tile);
    if (assessment.requiresChoice) {
      state.pendingTax = {
        playerId: player.id,
        tileId: tile.id,
        flatAmount: assessment.flatAmount,
        percentAmount: assessment.percentAmount,
        grantExtraTurnOnResolve: grantExtraTurn,
      };
      state.phase = 'TAX_DECISION';
      return;
    }

    const paid = chargeOrCreateDebt(state, rng, events, {
      debtorId: player.id,
      creditorId: null,
      amount: assessment.immediateAmount,
      reason: tile.name,
      addToVacationPot: true,
      resumePhase: grantExtraTurn ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
      grantExtraTurnOnResolve: grantExtraTurn,
      tileId: tile.id,
      isTax: true,
    });
    if (paid) {
      finishTurnTransition(state, grantExtraTurn);
    }
    return;
  }

  if (tile.type === 'CHANCE' || tile.type === 'COMMUNITY') {
    const card = drawTopCard(state, tile.type);
    if (!card) {
      finishTurnTransition(state, grantExtraTurn);
      return;
    }
    state.pendingCard = {
      card,
      drawnByPlayerId: player.id,
      resolved: false,
    };
    state.extraTurnPending = grantExtraTurn;
    state.phase = 'CARD_REVEAL';
    appendLog(state, rng, 'CARD', `${player.nickname} drew "${card.title}": ${card.description}`, {
      actorId: player.id,
      tileId: tile.id,
    });
    events.push({ type: 'CARD_DRAWN', playerId: player.id, card });
    return;
  }

  if (isPurchasableTile(tile)) {
    const prop = state.properties[tile.id];
    if (!prop) {
      finishTurnTransition(state, grantExtraTurn);
      return;
    }

    if (!prop.ownerId) {
      state.pendingPurchaseTileId = tile.id;
      state.extraTurnPending = grantExtraTurn;
      state.phase = 'AWAITING_BUY_DECISION';
      return;
    }

    if (prop.ownerId === player.id) {
      finishTurnTransition(state, grantExtraTurn);
      return;
    }

    const rent = calculateRent(state, tile.id, diceTotal, rentOverrides);
    if (rent.amount <= 0 || !rent.ownerId) {
      appendLog(state, rng, 'RENT', `${player.nickname} owes $0 on ${tile.name} (${rent.reason}).`, {
        actorId: player.id,
        tileId: tile.id,
      });
      finishTurnTransition(state, grantExtraTurn);
      return;
    }

    const paid = chargeOrCreateDebt(state, rng, events, {
      debtorId: player.id,
      creditorId: rent.ownerId,
      amount: rent.amount,
      reason: rent.reason,
      addToVacationPot: false,
      resumePhase: grantExtraTurn ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
      grantExtraTurnOnResolve: grantExtraTurn,
      tileId: tile.id,
      isRent: true,
    });
    if (paid) {
      finishTurnTransition(state, grantExtraTurn);
    }
  }
}

function resolveDrawnCard(
  state: GameState,
  rng: RngProvider,
  events: GameDomainEvent[],
): void {
  const pending = state.pendingCard;
  if (!pending) return;

  const player = state.players[pending.drawnByPlayerId];
  const card = pending.card;
  const grantExtraTurn = state.extraTurnPending;
  state.pendingCard = null;

  if (!player || player.isBankrupt) {
    finishTurnTransition(state, false);
    return;
  }

  const diceTotal = state.lastDiceRoll?.total ?? 7;

  switch (card.effect.kind) {
    case 'GAIN_CASH': {
      player.cash += card.effect.amount;
      appendLog(state, rng, 'CARD', `${player.nickname} received $${card.effect.amount}.`, {
        actorId: player.id,
        amount: card.effect.amount,
      });
      finishTurnTransition(state, grantExtraTurn);
      return;
    }

    case 'PAY_CASH': {
      const paid = chargeOrCreateDebt(state, rng, events, {
        debtorId: player.id,
        creditorId: null,
        amount: card.effect.amount,
        reason: card.title,
        addToVacationPot: true,
        resumePhase: grantExtraTurn ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
        grantExtraTurnOnResolve: grantExtraTurn,
      });
      if (paid) {
        appendLog(state, rng, 'CARD', `${player.nickname} paid $${card.effect.amount} (${card.title}).`, {
          actorId: player.id,
          amount: card.effect.amount,
        });
        finishTurnTransition(state, grantExtraTurn);
      }
      return;
    }

    case 'MOVE_TO_TILE': {
      const move = movePlayerToTile(
        state,
        player.id,
        card.effect.targetTileId,
        card.effect.collectStartIfPassed,
      );
      events.push({
        type: 'PLAYER_MOVED',
        playerId: player.id,
        from: move.from,
        to: move.to,
        passedStart: move.passedStart,
        startBonus: move.startBonus,
      });
      resolveLanding(state, player.id, diceTotal, grantExtraTurn, rng, events);
      return;
    }

    case 'MOVE_RELATIVE': {
      const move = advancePlayerSteps(state, player.id, card.effect.steps);
      events.push({
        type: 'PLAYER_MOVED',
        playerId: player.id,
        from: move.from,
        to: move.to,
        passedStart: move.passedStart,
        startBonus: move.startBonus,
      });
      resolveLanding(state, player.id, diceTotal, grantExtraTurn, rng, events);
      return;
    }

    case 'MOVE_NEAREST_TRANSIT': {
      const targetTileId = findNearestTileOfType(state.settings.mapId, player.position, 'TRANSIT');
      const move = movePlayerToTile(state, player.id, targetTileId, true);
      events.push({
        type: 'PLAYER_MOVED',
        playerId: player.id,
        from: move.from,
        to: move.to,
        passedStart: move.passedStart,
        startBonus: move.startBonus,
      });
      resolveLanding(state, player.id, diceTotal, grantExtraTurn, rng, events, {
        transitMultiplier: card.effect.rentMultiplier,
      });
      return;
    }

    case 'MOVE_NEAREST_UTILITY': {
      const targetTileId = findNearestTileOfType(state.settings.mapId, player.position, 'UTILITY');
      const move = movePlayerToTile(state, player.id, targetTileId, true);
      events.push({
        type: 'PLAYER_MOVED',
        playerId: player.id,
        from: move.from,
        to: move.to,
        passedStart: move.passedStart,
        startBonus: move.startBonus,
      });
      resolveLanding(state, player.id, diceTotal, grantExtraTurn, rng, events, {
        utilityMultiplier: card.effect.diceMultiplier,
      });
      return;
    }

    case 'GO_TO_JAIL': {
      sendPlayerToJail(state, player.id);
      appendLog(state, rng, 'JAIL', `${player.nickname} was sent to Prison by "${card.title}".`, {
        actorId: player.id,
      });
      events.push({ type: 'SENT_TO_JAIL', playerId: player.id, reason: card.title });
      finishTurnTransition(state, false);
      return;
    }

    case 'GET_OUT_OF_JAIL_FREE': {
      player.jailFreeCards += 1;
      if (card.deck === 'CHANCE') {
        state.decks.chanceJailCardHolderId = player.id;
      } else {
        state.decks.communityJailCardHolderId = player.id;
      }
      appendLog(state, rng, 'CARD', `${player.nickname} kept a Get Out of Prison Free card.`, {
        actorId: player.id,
      });
      finishTurnTransition(state, grantExtraTurn);
      return;
    }

    case 'REPAIRS': {
      const { houses, hotels } = getPlayerBuildingCounts(state, player.id);
      const repairTotal = houses * card.effect.perHouse + hotels * card.effect.perHotel;
      if (repairTotal === 0) {
        appendLog(state, rng, 'CARD', `${player.nickname} owns no buildings — $0 repair fee.`, {
          actorId: player.id,
        });
        finishTurnTransition(state, grantExtraTurn);
        return;
      }
      const paid = chargeOrCreateDebt(state, rng, events, {
        debtorId: player.id,
        creditorId: null,
        amount: repairTotal,
        reason: `${card.title} (${houses}H / ${hotels}Ht)`,
        addToVacationPot: true,
        resumePhase: grantExtraTurn ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
        grantExtraTurnOnResolve: grantExtraTurn,
      });
      if (paid) {
        appendLog(state, rng, 'CARD', `${player.nickname} paid $${repairTotal} in property repairs.`, {
          actorId: player.id,
          amount: repairTotal,
        });
        finishTurnTransition(state, grantExtraTurn);
      }
      return;
    }

    case 'COLLECT_FROM_ALL': {
      const others = getActivePlayerIds(state).filter((id) => id !== player.id);
      let collected = 0;
      for (const otherId of others) {
        const other = state.players[otherId];
        if (!other) continue;
        const paidAmount = Math.min(other.cash, card.effect.amountPerPlayer);
        other.cash -= paidAmount;
        player.cash += paidAmount;
        collected += paidAmount;
      }
      appendLog(
        state,
        rng,
        'CARD',
        `${player.nickname} collected $${collected} from other players (${card.title}).`,
        { actorId: player.id, amount: collected },
      );
      finishTurnTransition(state, grantExtraTurn);
      return;
    }

    case 'PAY_ALL_PLAYERS': {
      const others = getActivePlayerIds(state).filter((id) => id !== player.id);
      const totalOwed = others.length * card.effect.amountPerPlayer;
      if (totalOwed === 0) {
        finishTurnTransition(state, grantExtraTurn);
        return;
      }
      if (player.cash >= totalOwed) {
        player.cash -= totalOwed;
        for (const otherId of others) {
          const other = state.players[otherId];
          if (other) other.cash += card.effect.amountPerPlayer;
        }
        appendLog(
          state,
          rng,
          'CARD',
          `${player.nickname} paid $${card.effect.amountPerPlayer} to each player ($${totalOwed} total).`,
          { actorId: player.id, amount: totalOwed },
        );
        finishTurnTransition(state, grantExtraTurn);
        return;
      }
      chargeOrCreateDebt(state, rng, events, {
        debtorId: player.id,
        creditorId: null,
        amount: totalOwed,
        reason: card.title,
        addToVacationPot: false,
        resumePhase: grantExtraTurn ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
        grantExtraTurnOnResolve: grantExtraTurn,
      });
    }
  }
}

function handleRollDice(
  state: GameState,
  actorId: string,
  rng: RngProvider,
  events: GameDomainEvent[],
): ActionResult {
  if (state.phase !== 'WAITING_FOR_ROLL') {
    return fail('INVALID_PHASE', 'Cannot roll dice in the current phase.');
  }
  if (getCurrentPlayerId(state) !== actorId) {
    return fail('NOT_YOUR_TURN', 'It is not your turn.');
  }

  const player = state.players[actorId];
  if (!player || player.isBankrupt) {
    return fail('PLAYER_BANKRUPT', 'Bankrupt players cannot roll.');
  }

  const die1 = rng.nextInt(1, 7);
  const die2 = rng.nextInt(1, 7);
  if (
    !Number.isInteger(die1) ||
    !Number.isInteger(die2) ||
    die1 < 1 ||
    die1 > 6 ||
    die2 < 1 ||
    die2 > 6
  ) {
    return fail('RULE_VIOLATION', 'Invalid server dice generation result.');
  }
  const roll: DiceRollResult = {
    die1,
    die2,
    total: die1 + die2,
    isDoubles: die1 === die2,
  };

  state.lastDiceRoll = roll;
  state.hasRolledThisTurn = true;
  events.push({ type: 'DICE_ROLLED', playerId: player.id, roll });
  appendLog(
    state,
    rng,
    'ROLL',
    `${player.nickname} rolled ${die1} + ${die2} (${roll.total})${roll.isDoubles ? ' — Doubles!' : ''}.`,
    { actorId: player.id },
  );

  // Jailed player rolling for doubles
  if (player.inJail) {
    if (roll.isDoubles) {
      releasePlayerFromJail(state, player.id);
      appendLog(state, rng, 'JAIL', `${player.nickname} rolled doubles and escaped Prison!`, {
        actorId: player.id,
      });
      events.push({ type: 'RELEASED_FROM_JAIL', playerId: player.id, method: 'DOUBLES' });
      const move = advancePlayerSteps(state, player.id, roll.total);
      events.push({
        type: 'PLAYER_MOVED',
        playerId: player.id,
        from: move.from,
        to: move.to,
        passedStart: move.passedStart,
        startBonus: move.startBonus,
      });
      // Escaping jail via doubles does NOT grant an extra roll
      resolveLanding(state, player.id, roll.total, false, rng, events);
      return { ok: true, state, events };
    }

    player.jailTurns += 1;
    if (player.jailTurns >= MAX_JAIL_TURNS) {
      releasePlayerFromJail(state, player.id);
      events.push({ type: 'RELEASED_FROM_JAIL', playerId: player.id, method: 'FORCED_BAIL' });
      const paidBail = chargeOrCreateDebt(state, rng, events, {
        debtorId: player.id,
        creditorId: null,
        amount: JAIL_BAIL_AMOUNT,
        reason: 'Mandatory 3rd-turn Prison bail',
        addToVacationPot: true,
        resumePhase: 'POST_ROLL_ACTIONS',
        grantExtraTurnOnResolve: false,
      });
      if (!paidBail) {
        return { ok: true, state, events };
      }
      appendLog(
        state,
        rng,
        'JAIL',
        `${player.nickname} paid mandatory $${JAIL_BAIL_AMOUNT} bail on turn 3 and moved ${roll.total} spaces.`,
        { actorId: player.id, amount: JAIL_BAIL_AMOUNT },
      );
      const move = advancePlayerSteps(state, player.id, roll.total);
      events.push({
        type: 'PLAYER_MOVED',
        playerId: player.id,
        from: move.from,
        to: move.to,
        passedStart: move.passedStart,
        startBonus: move.startBonus,
      });
      resolveLanding(state, player.id, roll.total, false, rng, events);
      return { ok: true, state, events };
    }

    appendLog(
      state,
      rng,
      'JAIL',
      `${player.nickname} stays in Prison (attempt ${player.jailTurns}/${MAX_JAIL_TURNS}).`,
      { actorId: player.id },
    );
    finishTurnTransition(state, false);
    return { ok: true, state, events };
  }

  // Normal turn doubles tracking
  if (roll.isDoubles) {
    player.consecutiveDoubles += 1;
    if (state.settings.threeDoublesToJail && player.consecutiveDoubles >= 3) {
      sendPlayerToJail(state, player.id);
      appendLog(
        state,
        rng,
        'JAIL',
        `${player.nickname} rolled 3 consecutive doubles and was sent to Prison!`,
        { actorId: player.id },
      );
      events.push({ type: 'SENT_TO_JAIL', playerId: player.id, reason: 'Three consecutive doubles' });
      finishTurnTransition(state, false);
      return { ok: true, state, events };
    }
  } else {
    player.consecutiveDoubles = 0;
  }

  const move = advancePlayerSteps(state, player.id, roll.total);
  events.push({
    type: 'PLAYER_MOVED',
    playerId: player.id,
    from: move.from,
    to: move.to,
    passedStart: move.passedStart,
    startBonus: move.startBonus,
  });

  if (move.passedStart && move.startBonus > 0) {
    appendLog(
      state,
      rng,
      'MOVE',
      `${player.nickname} passed Start and collected $${move.startBonus}.`,
      { actorId: player.id, tileId: 0, amount: move.startBonus },
    );
  }

  const grantExtraTurn = roll.isDoubles && state.settings.doublesExtraTurn;
  resolveLanding(state, player.id, roll.total, grantExtraTurn, rng, events);
  return { ok: true, state, events };
}

export function applyGameAction(
  currentState: GameState,
  actorId: string,
  action: GameAction,
  rng: RngProvider = createDefaultRng(),
): ActionResult {
  if (currentState.phase === 'GAME_OVER') {
    return fail('INVALID_PHASE', 'Game is already finished.');
  }

  const actor = currentState.players[actorId];
  if (!actor) {
    return fail('PLAYER_NOT_FOUND', 'Player does not exist in this game.');
  }
  if (actor.isBankrupt) {
    return fail('PLAYER_BANKRUPT', 'Bankrupt players cannot perform game actions.');
  }

  const state = structuredClone(currentState);
  const events: GameDomainEvent[] = [];
  const isCurrentTurn = getCurrentPlayerId(state) === actorId;

  switch (action.type) {
    case 'ROLL_DICE': {
      const result = handleRollDice(state, actorId, rng, events);
      if (result.ok) {
        result.state.version += 1;
      }
      return result;
    }

    case 'BUY_PROPERTY': {
      if (state.phase !== 'AWAITING_BUY_DECISION') {
        return fail('INVALID_PHASE', 'No property awaiting purchase.');
      }
      if (!isCurrentTurn) {
        return fail('NOT_YOUR_TURN', 'It is not your turn.');
      }
      const tileId = state.pendingPurchaseTileId;
      if (tileId === null) {
        return fail('INVALID_TARGET', 'No pending property.');
      }
      const tile = getTileById(state.settings.mapId, tileId);
      const prop = state.properties[tileId];
      const player = state.players[actorId]!;
      if (!isPurchasableTile(tile) || !prop || prop.ownerId !== null) {
        return fail('INVALID_TARGET', 'Property is not available for purchase.');
      }
      if (player.cash < tile.price) {
        return fail('INSUFFICIENT_FUNDS', `Need $${tile.price} to buy ${tile.name}.`);
      }

      player.cash -= tile.price;
      player.stats.propertiesBought += 1;
      prop.ownerId = player.id;
      state.pendingPurchaseTileId = null;

      appendLog(state, rng, 'PURCHASE', `${player.nickname} bought ${tile.name} for $${tile.price}.`, {
        actorId: player.id,
        tileId: tile.id,
        amount: tile.price,
      });
      events.push({ type: 'PROPERTY_BOUGHT', playerId: player.id, tileId: tile.id, price: tile.price });

      finishTurnTransition(state, state.extraTurnPending);
      state.version += 1;
      return { ok: true, state, events };
    }

    case 'DECLINE_PROPERTY': {
      if (state.phase !== 'AWAITING_BUY_DECISION') {
        return fail('INVALID_PHASE', 'No property awaiting purchase decision.');
      }
      if (!isCurrentTurn) {
        return fail('NOT_YOUR_TURN', 'It is not your turn.');
      }
      const tileId = state.pendingPurchaseTileId;
      if (tileId === null) {
        return fail('INVALID_TARGET', 'No pending property.');
      }

      const tile = getTileById(state.settings.mapId, tileId);
      const player = state.players[actorId]!;
      const grantExtraTurn = state.extraTurnPending;
      state.pendingPurchaseTileId = null;

      appendLog(state, rng, 'PURCHASE', `${player.nickname} declined to buy ${tile.name}.`, {
        actorId: player.id,
        tileId,
      });

      if (state.settings.auctionDeclinedProperties) {
        const auction = startPropertyAuction(
          state,
          tileId,
          grantExtraTurn ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
          grantExtraTurn,
          rng,
        );
        events.push({ type: 'AUCTION_STARTED', tileId, endsAt: auction.endsAt });
      } else {
        finishTurnTransition(state, grantExtraTurn);
      }

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'PLACE_BID': {
      const bidResult = applyAuctionBid(state, actorId, action.amount, rng);
      if (!bidResult.ok) {
        return fail(bidResult.code, bidResult.error);
      }
      const auction = state.activeAuction!;
      events.push({
        type: 'AUCTION_BID',
        playerId: actorId,
        tileId: auction.tileId,
        amount: action.amount,
        endsAt: bidResult.endsAt,
      });

      // If only 1 player remains active in the auction, finalize immediately
      const remaining = auction.eligiblePlayerIds.filter(
        (id) => !auction.passedPlayerIds.includes(id),
      );
      if (remaining.length === 1 && remaining[0] === actorId) {
        const done = finalizeAuction(state, rng);
        events.push(...done.events);
        finishTurnTransition(state, done.grantExtraTurnOnResolve);
      }

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'PASS_AUCTION': {
      const passResult = applyAuctionPass(state, actorId, rng);
      if (!passResult.ok) {
        return fail(passResult.code, passResult.error);
      }
      if (passResult.shouldFinalize) {
        const done = finalizeAuction(state, rng);
        events.push(...done.events);
        finishTurnTransition(state, done.grantExtraTurnOnResolve);
      }
      state.version += 1;
      return { ok: true, state, events };
    }

    case 'BUILD_HOUSE': {
      if (!isCurrentTurn) {
        return fail('NOT_YOUR_TURN', 'You can only build on your own turn.');
      }
      if (state.phase !== 'WAITING_FOR_ROLL' && state.phase !== 'POST_ROLL_ACTIONS') {
        return fail('INVALID_PHASE', 'Resolve the current action before building.');
      }
      const check = validateBuildHouse(state, actorId, action.tileId);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const player = state.players[actorId]!;
      const prop = state.properties[action.tileId]!;
      const tile = getTileById(state.settings.mapId, action.tileId);

      player.cash -= check.cost;
      prop.houses += 1;

      if (check.isHotelUpgrade) {
        state.bankHotelsRemaining = Math.max(0, state.bankHotelsRemaining - 1);
        state.bankHousesRemaining += MAX_HOUSES_BEFORE_HOTEL;
      } else {
        state.bankHousesRemaining = Math.max(0, state.bankHousesRemaining - 1);
      }

      appendLog(
        state,
        rng,
        'BUILD',
        `${player.nickname} built a ${check.isHotelUpgrade ? 'hotel' : 'house'} on ${tile.name} for $${check.cost}.`,
        { actorId: player.id, tileId: tile.id, amount: check.cost },
      );
      events.push({
        type: 'BUILDING_CHANGED',
        playerId: player.id,
        tileId: tile.id,
        houses: prop.houses,
        delta: 1,
      });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'SELL_HOUSE': {
      const isDebtorRaisingFunds =
        state.phase === 'DEBT_RESOLUTION' && state.pendingDebt?.debtorId === actorId;
      if (!canLiquidateInPhase(state.phase, isCurrentTurn, isDebtorRaisingFunds)) {
        if (!isDebtorRaisingFunds && !isCurrentTurn) {
          return fail('NOT_YOUR_TURN', 'You can only sell buildings on your turn or to pay debt.');
        }
        return fail('INVALID_PHASE', 'Cannot sell buildings right now.');
      }

      const check = validateSellHouse(state, actorId, action.tileId);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const player = state.players[actorId]!;
      const prop = state.properties[action.tileId]!;
      const tile = getTileById(state.settings.mapId, action.tileId);

      player.cash += check.refund;
      prop.houses -= 1;

      if (check.isHotelDowngrade) {
        state.bankHotelsRemaining += 1;
        state.bankHousesRemaining = Math.max(0, state.bankHousesRemaining - MAX_HOUSES_BEFORE_HOTEL);
      } else {
        state.bankHousesRemaining += 1;
      }

      appendLog(
        state,
        rng,
        'BUILD',
        `${player.nickname} sold a ${check.isHotelDowngrade ? 'hotel' : 'house'} on ${tile.name} for $${check.refund}.`,
        { actorId: player.id, tileId: tile.id, amount: check.refund },
      );
      events.push({
        type: 'BUILDING_CHANGED',
        playerId: player.id,
        tileId: tile.id,
        houses: prop.houses,
        delta: -1,
      });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'MORTGAGE_PROPERTY': {
      const isDebtorRaisingFunds =
        state.phase === 'DEBT_RESOLUTION' && state.pendingDebt?.debtorId === actorId;
      if (!canLiquidateInPhase(state.phase, isCurrentTurn, isDebtorRaisingFunds)) {
        if (!isDebtorRaisingFunds && !isCurrentTurn) {
          return fail('NOT_YOUR_TURN', 'You can only mortgage on your turn or to settle debt.');
        }
        return fail('INVALID_PHASE', 'Cannot mortgage right now.');
      }

      const check = validateMortgage(state, actorId, action.tileId);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const player = state.players[actorId]!;
      const prop = state.properties[action.tileId]!;
      const tile = getTileById(state.settings.mapId, action.tileId);

      prop.mortgaged = true;
      player.cash += check.payout;

      appendLog(
        state,
        rng,
        'MORTGAGE',
        `${player.nickname} mortgaged ${tile.name} for $${check.payout}.`,
        { actorId: player.id, tileId: tile.id, amount: check.payout },
      );
      events.push({
        type: 'MORTGAGE_CHANGED',
        playerId: player.id,
        tileId: tile.id,
        mortgaged: true,
        amount: check.payout,
      });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'UNMORTGAGE_PROPERTY': {
      if (!isCurrentTurn) {
        return fail('NOT_YOUR_TURN', 'You can only unmortgage on your own turn.');
      }
      if (
        state.phase !== 'WAITING_FOR_ROLL' &&
        state.phase !== 'AWAITING_BUY_DECISION' &&
        state.phase !== 'POST_ROLL_ACTIONS'
      ) {
        return fail('INVALID_PHASE', 'Cannot unmortgage right now.');
      }

      const check = validateUnmortgage(state, actorId, action.tileId);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const player = state.players[actorId]!;
      const prop = state.properties[action.tileId]!;
      const tile = getTileById(state.settings.mapId, action.tileId);

      prop.mortgaged = false;
      player.cash -= check.cost;

      appendLog(
        state,
        rng,
        'MORTGAGE',
        `${player.nickname} unmortgaged ${tile.name} for $${check.cost}.`,
        { actorId: player.id, tileId: tile.id, amount: check.cost },
      );
      events.push({
        type: 'MORTGAGE_CHANGED',
        playerId: player.id,
        tileId: tile.id,
        mortgaged: false,
        amount: check.cost,
      });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'PAY_JAIL_BAIL': {
      if (!isCurrentTurn || state.phase !== 'WAITING_FOR_ROLL') {
        return fail('INVALID_PHASE', 'You can only pay bail at the start of your turn.');
      }
      const check = validatePayJailBail(state, actorId);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const player = state.players[actorId]!;
      player.cash -= JAIL_BAIL_AMOUNT;
      if (state.settings.vacationPotEnabled) {
        state.vacationPot += JAIL_BAIL_AMOUNT;
      }
      releasePlayerFromJail(state, player.id);

      appendLog(
        state,
        rng,
        'JAIL',
        `${player.nickname} paid $${JAIL_BAIL_AMOUNT} bail and is free to roll!`,
        { actorId: player.id, amount: JAIL_BAIL_AMOUNT },
      );
      events.push({ type: 'RELEASED_FROM_JAIL', playerId: player.id, method: 'BAIL' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'USE_JAIL_CARD': {
      if (!isCurrentTurn || state.phase !== 'WAITING_FOR_ROLL') {
        return fail('INVALID_PHASE', 'You can only use a Prison card at the start of your turn.');
      }
      const check = validateUseJailCard(state, actorId);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const player = state.players[actorId]!;
      consumeAndReturnJailCard(state, player.id);
      releasePlayerFromJail(state, player.id);

      appendLog(
        state,
        rng,
        'JAIL',
        `${player.nickname} used a Get Out of Prison Free card and is free to roll!`,
        { actorId: player.id },
      );
      events.push({ type: 'RELEASED_FROM_JAIL', playerId: player.id, method: 'CARD' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'CHOOSE_TAX_OPTION': {
      if (state.phase !== 'TAX_DECISION' || !state.pendingTax) {
        return fail('INVALID_PHASE', 'No tax decision pending.');
      }
      if (state.pendingTax.playerId !== actorId) {
        return fail('NOT_YOUR_TURN', 'Not your tax decision.');
      }

      const pendingTax = state.pendingTax;
      const amount =
        action.choice === 'FLAT' ? pendingTax.flatAmount : pendingTax.percentAmount;
      const reason =
        action.choice === 'FLAT' ? 'Income Tax (Flat)' : 'Income Tax (10% Net Worth)';
      state.pendingTax = null;

      const paid = chargeOrCreateDebt(state, rng, events, {
        debtorId: actorId,
        creditorId: null,
        amount,
        reason,
        addToVacationPot: true,
        resumePhase: pendingTax.grantExtraTurnOnResolve ? 'WAITING_FOR_ROLL' : 'POST_ROLL_ACTIONS',
        grantExtraTurnOnResolve: pendingTax.grantExtraTurnOnResolve,
        tileId: pendingTax.tileId,
        isTax: true,
      });

      if (paid) {
        finishTurnTransition(state, pendingTax.grantExtraTurnOnResolve);
      }

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'ACKNOWLEDGE_CARD': {
      if (state.phase !== 'CARD_REVEAL' || !state.pendingCard) {
        return fail('INVALID_PHASE', 'No card awaiting acknowledgement.');
      }
      if (state.pendingCard.drawnByPlayerId !== actorId) {
        return fail('NOT_YOUR_TURN', 'Only the player who drew the card can resolve it.');
      }

      resolveDrawnCard(state, rng, events);
      state.version += 1;
      return { ok: true, state, events };
    }

    case 'PROPOSE_TRADE': {
      if (state.phase === 'AUCTION_ACTIVE') {
        return fail('INVALID_PHASE', 'Cannot propose trades during an active auction.');
      }

      const check = validateProposeTrade(
        state,
        actorId,
        action.recipientId,
        action.offered,
        action.requested,
      );
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      const trade: TradeOffer = {
        id: rng.nextId('trade'),
        proposerId: actorId,
        recipientId: action.recipientId,
        offered: {
          cash: action.offered.cash,
          propertyIds: [...action.offered.propertyIds],
          jailFreeCards: action.offered.jailFreeCards,
        },
        requested: {
          cash: action.requested.cash,
          propertyIds: [...action.requested.propertyIds],
          jailFreeCards: action.requested.jailFreeCards,
        },
        status: 'PENDING',
        createdAt: rng.now(),
        parentTradeId: null,
      };

      state.trades.push(trade);
      const proposer = state.players[actorId]!;
      const recipient = state.players[action.recipientId]!;
      appendLog(
        state,
        rng,
        'TRADE',
        `${proposer.nickname} sent a trade offer to ${recipient.nickname}.`,
        { actorId: proposer.id },
      );
      events.push({ type: 'TRADE_UPDATED', tradeId: trade.id, status: 'PROPOSED' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'ACCEPT_TRADE': {
      if (state.phase === 'AUCTION_ACTIVE') {
        return fail('INVALID_PHASE', 'Cannot accept trades during an active auction.');
      }

      const trade = state.trades.find((t) => t.id === action.tradeId);
      if (!trade) {
        return fail('TRADE_INVALID', 'Trade offer not found.');
      }

      const check = validateAcceptTrade(state, actorId, trade);
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      executeTradeTransfer(state, trade);
      const proposer = state.players[trade.proposerId]!;
      const recipient = state.players[trade.recipientId]!;
      appendLog(
        state,
        rng,
        'TRADE',
        `${recipient.nickname} accepted the trade with ${proposer.nickname}!`,
        { actorId: recipient.id },
      );
      events.push({ type: 'TRADE_UPDATED', tradeId: trade.id, status: 'ACCEPTED' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'REJECT_TRADE': {
      const trade = state.trades.find((t) => t.id === action.tradeId);
      if (!trade || trade.status !== 'PENDING') {
        return fail('TRADE_INVALID', 'Pending trade offer not found.');
      }
      if (trade.recipientId !== actorId) {
        return fail('TRADE_INVALID', 'Only the recipient can reject a trade.');
      }

      trade.status = 'REJECTED';
      const recipient = state.players[actorId]!;
      const proposer = state.players[trade.proposerId];
      appendLog(
        state,
        rng,
        'TRADE',
        `${recipient.nickname} declined ${proposer?.nickname ?? 'player'}'s trade offer.`,
        { actorId: recipient.id },
      );
      events.push({ type: 'TRADE_UPDATED', tradeId: trade.id, status: 'REJECTED' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'CANCEL_TRADE': {
      const trade = state.trades.find((t) => t.id === action.tradeId);
      if (!trade || trade.status !== 'PENDING') {
        return fail('TRADE_INVALID', 'Pending trade offer not found.');
      }
      if (trade.proposerId !== actorId) {
        return fail('TRADE_INVALID', 'Only the proposer can cancel a trade.');
      }

      trade.status = 'CANCELLED';
      events.push({ type: 'TRADE_UPDATED', tradeId: trade.id, status: 'CANCELLED' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'COUNTER_TRADE': {
      if (state.phase === 'AUCTION_ACTIVE') {
        return fail('INVALID_PHASE', 'Cannot counteroffer during an active auction.');
      }

      const original = state.trades.find((t) => t.id === action.tradeId);
      if (!original || original.status !== 'PENDING') {
        return fail('TRADE_INVALID', 'Original trade offer is no longer pending.');
      }
      if (original.recipientId !== actorId) {
        return fail('TRADE_INVALID', 'Only the recipient can send a counteroffer.');
      }

      const check = validateProposeTrade(
        state,
        actorId,
        original.proposerId,
        action.offered,
        action.requested,
      );
      if (!check.valid) {
        return fail(check.code, check.error);
      }

      original.status = 'COUNTERED';
      const counter: TradeOffer = {
        id: rng.nextId('trade'),
        proposerId: actorId,
        recipientId: original.proposerId,
        offered: {
          cash: action.offered.cash,
          propertyIds: [...action.offered.propertyIds],
          jailFreeCards: action.offered.jailFreeCards,
        },
        requested: {
          cash: action.requested.cash,
          propertyIds: [...action.requested.propertyIds],
          jailFreeCards: action.requested.jailFreeCards,
        },
        status: 'PENDING',
        createdAt: rng.now(),
        parentTradeId: original.id,
      };
      state.trades.push(counter);

      const sender = state.players[actorId]!;
      const target = state.players[original.proposerId]!;
      appendLog(
        state,
        rng,
        'TRADE',
        `${sender.nickname} sent a counteroffer to ${target.nickname}.`,
        { actorId: sender.id },
      );
      events.push({ type: 'TRADE_UPDATED', tradeId: original.id, status: 'COUNTERED' });
      events.push({ type: 'TRADE_UPDATED', tradeId: counter.id, status: 'PROPOSED' });

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'PAY_DEBT': {
      if (state.phase !== 'DEBT_RESOLUTION' || !state.pendingDebt) {
        return fail('INVALID_PHASE', 'No debt requires payment.');
      }
      if (state.pendingDebt.debtorId !== actorId) {
        return fail('NOT_YOUR_TURN', 'You are not the debtor.');
      }

      const debt = state.pendingDebt;
      const debtor = state.players[actorId]!;
      if (debtor.cash < debt.amount) {
        return fail(
          'INSUFFICIENT_FUNDS',
          `Need $${debt.amount} to pay debt (you have $${debtor.cash}). Sell buildings, mortgage properties, or declare bankruptcy.`,
        );
      }

      debtor.cash -= debt.amount;
      if (debt.creditorId) {
        const creditor = state.players[debt.creditorId];
        if (creditor && !creditor.isBankrupt) {
          creditor.cash += debt.amount;
          debtor.stats.rentPaid += debt.amount;
          creditor.stats.rentCollected += debt.amount;
        }
      } else if (debt.addToVacationPot && state.settings.vacationPotEnabled) {
        state.vacationPot += debt.amount;
      }

      appendLog(
        state,
        rng,
        'SYSTEM',
        `${debtor.nickname} settled their $${debt.amount} debt (${debt.reason}).`,
        { actorId: debtor.id, amount: debt.amount },
      );

      state.pendingDebt = null;
      finishTurnTransition(state, debt.grantExtraTurnOnResolve);
      state.version += 1;
      return { ok: true, state, events };
    }

    case 'DECLARE_BANKRUPTCY': {
      const isDebtor = state.phase === 'DEBT_RESOLUTION' && state.pendingDebt?.debtorId === actorId;
      const canVoluntarilyForfeit =
        isCurrentTurn &&
        (state.phase === 'WAITING_FOR_ROLL' ||
          state.phase === 'POST_ROLL_ACTIONS' ||
          state.phase === 'AWAITING_BUY_DECISION' ||
          state.phase === 'TAX_DECISION');

      if (!isDebtor && !canVoluntarilyForfeit) {
        return fail('INVALID_PHASE', 'You can only declare bankruptcy during debt resolution or on your turn.');
      }

      const creditorId = isDebtor ? (state.pendingDebt?.creditorId ?? null) : null;
      const debtor = state.players[actorId]!;
      const summary = executeBankruptcyTransfer(state, actorId, creditorId);

      const creditor = creditorId ? state.players[creditorId] : undefined;
      appendLog(
        state,
        rng,
        'BANKRUPTCY',
        summary.transferredToCreditor && creditor
          ? `${debtor.nickname} declared bankruptcy! Assets transferred to ${creditor.nickname}.`
          : `${debtor.nickname} declared bankruptcy! All properties returned to the Bank.`,
        { actorId: debtor.id },
      );
      events.push({ type: 'PLAYER_BANKRUPT', playerId: actorId, creditorId });

      state.pendingDebt = null;
      state.pendingPurchaseTileId = null;
      state.pendingTax = null;
      state.pendingCard = null;

      const remainingActive = getActivePlayerIds(state);
      if (remainingActive.length <= 1) {
        finalizeGameOver(state, rng, events);
      } else if (getCurrentPlayerId(state) === actorId) {
        advanceToNextPlayerTurn(state, rng, events);
      } else {
        finishTurnTransition(state, false);
      }

      state.version += 1;
      return { ok: true, state, events };
    }

    case 'END_TURN': {
      if (!isCurrentTurn) {
        return fail('NOT_YOUR_TURN', 'It is not your turn.');
      }
      if (state.phase !== 'POST_ROLL_ACTIONS') {
        return fail('INVALID_PHASE', 'You must complete your roll and pending decisions before ending your turn.');
      }

      advanceToNextPlayerTurn(state, rng, events);
      state.version += 1;
      return { ok: true, state, events };
    }
  }
}

export function resolveAuctionTimeout(
  currentState: GameState,
  rng: RngProvider = createDefaultRng(),
): ActionResult {
  if (currentState.phase !== 'AUCTION_ACTIVE' || !currentState.activeAuction) {
    return fail('INVALID_PHASE', 'No active auction to finalize.');
  }

  const state = structuredClone(currentState);
  const done = finalizeAuction(state, rng);
  finishTurnTransition(state, done.grantExtraTurnOnResolve);
  state.version += 1;

  return { ok: true, state, events: done.events };
}

export function resolveTurnTimeout(
  currentState: GameState,
  rng: RngProvider = createDefaultRng(),
): ActionResult {
  if (currentState.phase === 'GAME_OVER') {
    return fail('INVALID_PHASE', 'Game already ended.');
  }
  if (currentState.phase === 'AUCTION_ACTIVE') {
    return resolveAuctionTimeout(currentState, rng);
  }

  const currentPlayerId = getCurrentPlayerId(currentState);
  switch (currentState.phase) {
    case 'WAITING_FOR_ROLL':
      return applyGameAction(currentState, currentPlayerId, { type: 'ROLL_DICE' }, rng);
    case 'AWAITING_BUY_DECISION':
      return applyGameAction(currentState, currentPlayerId, { type: 'DECLINE_PROPERTY' }, rng);
    case 'TAX_DECISION':
      return applyGameAction(
        currentState,
        currentPlayerId,
        { type: 'CHOOSE_TAX_OPTION', choice: 'FLAT' },
        rng,
      );
    case 'CARD_REVEAL':
      return applyGameAction(currentState, currentPlayerId, { type: 'ACKNOWLEDGE_CARD' }, rng);
    case 'DEBT_RESOLUTION': {
      const debtorId = currentState.pendingDebt?.debtorId ?? currentPlayerId;
      const debtor = currentState.players[debtorId];
      if (debtor && currentState.pendingDebt && debtor.cash >= currentState.pendingDebt.amount) {
        return applyGameAction(currentState, debtorId, { type: 'PAY_DEBT' }, rng);
      }
      return applyGameAction(currentState, debtorId, { type: 'DECLARE_BANKRUPTCY' }, rng);
    }
    case 'POST_ROLL_ACTIONS':
      return applyGameAction(currentState, currentPlayerId, { type: 'END_TURN' }, rng);
  }
}