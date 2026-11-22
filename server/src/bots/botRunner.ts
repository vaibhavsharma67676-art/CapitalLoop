import { sanitizeGameState, type GameAction, type GameState } from '@capitalloop/shared';
import type { Logger } from '../services/logger';
import {
  decideBotAction,
  decideBotAuctionAction,
  decideBotTradeResponse,
} from './botEngine';

export interface BotActionExecutor {
  getGameState: (roomCode: string) => GameState | null;
  executeBotAction: (roomCode: string, botId: string, action: GameAction) => boolean;
}

/**
 * Schedules and runs server-authoritative AI bot turns, auction bids, and trade responses
 * with natural pacing and race-condition guards.
 */
export class BotRunner {
  private readonly roomTimers = new Map<string, NodeJS.Timeout>();
  private readonly stepCounterByTurn = new Map<string, { version: number; count: number }>();

  constructor(private readonly logger: Logger) {}

  scheduleForRoom(roomCode: string, executor: BotActionExecutor): void {
    const code = roomCode.toUpperCase();
    this.clearRoom(code);

    const state = executor.getGameState(code);
    if (!state || state.phase === 'GAME_OVER') {
      return;
    }

    const nextMove = this.findNextBotMove(state);
    if (!nextMove) {
      return;
    }

    const isFast = state.settings.gameSpeed === 'FAST';
    const baseDelayMs =
      state.phase === 'AUCTION_ACTIVE'
        ? isFast
          ? 550
          : 900
        : nextMove.action.type === 'ROLL_DICE'
          ? isFast
            ? 500
            : 850
          : isFast
            ? 420
            : 700;

    const scheduledVersion = state.version;
    const timer = setTimeout(() => {
      this.roomTimers.delete(code);

      const fresh = executor.getGameState(code);
      if (!fresh || fresh.phase === 'GAME_OVER' || fresh.version !== scheduledVersion) {
        return;
      }

      // Guard against infinite loops if a bot somehow emits repeated identical actions
      const tracker = this.stepCounterByTurn.get(code);
      if (tracker && tracker.version === fresh.version) {
        tracker.count += 1;
        if (tracker.count > 4) {
          this.logger.warn('Bot loop guard triggered; skipping step', {
            roomCode: code,
            botId: nextMove.botId,
          });
          return;
        }
      } else {
        this.stepCounterByTurn.set(code, { version: fresh.version, count: 1 });
      }

      const ok = executor.executeBotAction(code, nextMove.botId, nextMove.action);
      if (!ok) {
        this.logger.debug('Bot action rejected; rescheduling safe fallback', {
          roomCode: code,
          botId: nextMove.botId,
          actionType: nextMove.action.type,
        });
      }
    }, baseDelayMs);

    timer.unref();
    this.roomTimers.set(code, timer);
  }

  clearRoom(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const timer = this.roomTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(code);
    }
    this.stepCounterByTurn.delete(code);
  }

  clearAll(): void {
    for (const timer of this.roomTimers.values()) {
      clearTimeout(timer);
    }
    this.roomTimers.clear();
    this.stepCounterByTurn.clear();
  }

  private findNextBotMove(state: GameState): { botId: string; action: GameAction } | null {
    // Strictly pass sanitized ClientGameState so bots NEVER see hidden deck order
    const publicState = sanitizeGameState(state);

    // 1. Check active auctions for any eligible bot ready to bid or pass
    if (publicState.phase === 'AUCTION_ACTIVE' && publicState.activeAuction) {
      for (const playerId of publicState.activeAuction.eligiblePlayerIds) {
        const player = publicState.players[playerId];
        if (!player?.isBot || player.isBankrupt) continue;
        const action = decideBotAuctionAction(publicState, playerId);
        if (action) return { botId: playerId, action };
      }
      return null;
    }

    // 2. Check incoming pending trades addressed to any active bot
    for (const trade of publicState.trades) {
      if (trade.status !== 'PENDING') continue;
      const recipient = publicState.players[trade.recipientId];
      if (!recipient?.isBot || recipient.isBankrupt) continue;
      const response = decideBotTradeResponse(publicState, recipient.id);
      if (response) return { botId: recipient.id, action: response };
    }

    // 3. Check debt resolution if debtor is a bot
    if (publicState.phase === 'DEBT_RESOLUTION' && publicState.pendingDebt) {
      const debtor = publicState.players[publicState.pendingDebt.debtorId];
      if (debtor?.isBot && !debtor.isBankrupt) {
        const action = decideBotAction(publicState, debtor.id);
        if (action) return { botId: debtor.id, action };
      }
      return null;
    }

    // 4. Check current turn player
    const currentId = publicState.turnOrder[publicState.currentPlayerIndex];
    if (!currentId) return null;
    const current = publicState.players[currentId];
    if (!current?.isBot || current.isBankrupt) return null;

    const action = decideBotAction(publicState, current.id);
    return action ? { botId: current.id, action } : null;
  }
}
