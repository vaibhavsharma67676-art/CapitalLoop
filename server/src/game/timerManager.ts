import type { GameState } from '@capitalloop/shared';

interface RoomTimers {
  turnTimer: NodeJS.Timeout | null;
  auctionTimer: NodeJS.Timeout | null;
}

export class GameTimerManager {
  private readonly timers = new Map<string, RoomTimers>();

  syncRoomTimers(
    roomCode: string,
    state: GameState | null,
    callbacks: {
      onTurnTimeout: (roomCode: string) => void;
      onAuctionTimeout: (roomCode: string) => void;
    },
  ): void {
    this.clearRoomTimers(roomCode);
    if (!state || state.phase === 'GAME_OVER') {
      return;
    }

    const entry: RoomTimers = { turnTimer: null, auctionTimer: null };
    const now = Date.now();

    if (state.phase === 'AUCTION_ACTIVE' && state.activeAuction) {
      const delayMs = Math.max(150, state.activeAuction.endsAt - now + 100);
      entry.auctionTimer = setTimeout(() => {
        entry.auctionTimer = null;
        callbacks.onAuctionTimeout(roomCode);
      }, delayMs);
      entry.auctionTimer.unref();
    } else if (state.turnDeadlineAt !== null) {
      const delayMs = Math.max(250, state.turnDeadlineAt - now + 100);
      entry.turnTimer = setTimeout(() => {
        entry.turnTimer = null;
        callbacks.onTurnTimeout(roomCode);
      }, delayMs);
      entry.turnTimer.unref();
    }

    this.timers.set(roomCode, entry);
  }

  clearRoomTimers(roomCode: string): void {
    const existing = this.timers.get(roomCode);
    if (!existing) return;
    if (existing.turnTimer) clearTimeout(existing.turnTimer);
    if (existing.auctionTimer) clearTimeout(existing.auctionTimer);
    this.timers.delete(roomCode);
  }

  clearAll(): void {
    for (const roomCode of this.timers.keys()) {
      this.clearRoomTimers(roomCode);
    }
  }
}