import type {
  GameSpeed,
  MapId,
  MatchmakingPreferences,
  MatchmakingStatusPayload,
  RoomSessionCredentials,
  TokenShapeId,
} from '@capitalloop/shared';
import type { RoomManager } from './roomManager';

export interface QueueEntry {
  socketId: string;
  clientIp: string;
  nickname: string;
  mapId: MapId;
  gameSpeed: GameSpeed;
  targetPlayers: number;
  preferredColor?: string;
  preferredToken?: TokenShapeId;
  joinedAt: number;
  bucketKey: string;
}

export interface MatchFormedResult {
  roomCode: string;
  hostPlayerId: string;
  hostSessionToken: string;
  assignments: Array<{ socketId: string; credentials: RoomSessionCredentials }>;
}

export type EnqueueOutcome =
  | {
      ok: true;
      matched: false;
      status: MatchmakingStatusPayload;
      bucketSocketIds: string[];
    }
  | {
      ok: true;
      matched: true;
      match: MatchFormedResult;
    }
  | {
      ok: false;
      code: string;
      error: string;
    };

/**
 * Isolated public Quick Match queue.
 * - Matches players strictly by compatible (mapId, gameSpeed, targetPlayers).
 * - Never exposes or interacts with PRIVATE rooms.
 * - Prevents duplicate queue entries and handles disconnects cleanly.
 */
export class MatchmakingManager {
  private readonly entriesBySocket = new Map<string, QueueEntry>();
  private readonly buckets = new Map<string, string[]>();

  constructor(
    private readonly roomManager: RoomManager,
    private readonly enabled: boolean,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  getQueueCount(): number {
    return this.entriesBySocket.size;
  }

  enqueue(input: {
    socketId: string;
    clientIp: string;
    prefs: MatchmakingPreferences;
  }): EnqueueOutcome {
    if (!this.enabled) {
      return {
        ok: false,
        code: 'FEATURE_DISABLED',
        error: 'Public Quick Matchmaking is currently disabled on this server.',
      };
    }

    if (this.roomManager.isSocketInRoom(input.socketId)) {
      return {
        ok: false,
        code: 'ALREADY_IN_ROOM',
        error: 'Leave your current room before searching for a Quick Match.',
      };
    }

    if (this.entriesBySocket.has(input.socketId)) {
      return {
        ok: false,
        code: 'ALREADY_QUEUED',
        error: 'You are already searching for a Quick Match.',
      };
    }

    const targetPlayers = Math.max(2, Math.min(4, Math.floor(input.prefs.targetPlayers)));
    const bucketKey = `${input.prefs.mapId}:${input.prefs.gameSpeed}:${targetPlayers}`;
    const entry: QueueEntry = {
      socketId: input.socketId,
      clientIp: input.clientIp,
      nickname: input.prefs.nickname.trim(),
      mapId: input.prefs.mapId,
      gameSpeed: input.prefs.gameSpeed,
      targetPlayers,
      preferredColor: input.prefs.preferredColor,
      preferredToken: input.prefs.preferredToken,
      joinedAt: Date.now(),
      bucketKey,
    };

    this.entriesBySocket.set(input.socketId, entry);
    const bucket = this.buckets.get(bucketKey) ?? [];
    bucket.push(input.socketId);
    this.buckets.set(bucketKey, bucket);

    if (bucket.length >= targetPlayers) {
      const matchedIds = bucket.splice(0, targetPlayers);
      if (bucket.length === 0) {
        this.buckets.delete(bucketKey);
      }

      const matchedEntries: QueueEntry[] = [];
      for (const sid of matchedIds) {
        const found = this.entriesBySocket.get(sid);
        this.entriesBySocket.delete(sid);
        if (found) matchedEntries.push(found);
      }

      const created = this.roomManager.createPublicMatchRoom({
        mapId: entry.mapId,
        gameSpeed: entry.gameSpeed,
        seats: matchedEntries.map((m) => ({
          nickname: m.nickname,
          clientIp: m.clientIp,
          socketId: m.socketId,
          preferredColor: m.preferredColor,
          preferredToken: m.preferredToken,
        })),
      });

      if (!created.ok) {
        return created;
      }

      const hostAssignment = created.data.assignments[0]!;
      return {
        ok: true,
        matched: true,
        match: {
          roomCode: created.data.roomCode,
          hostPlayerId: hostAssignment.credentials.playerId,
          hostSessionToken: hostAssignment.credentials.sessionToken,
          assignments: created.data.assignments,
        },
      };
    }

    return {
      ok: true,
      matched: false,
      status: this.buildStatusForEntry(entry, bucket.length),
      bucketSocketIds: [...bucket],
    };
  }

  cancel(socketId: string): {
    removed: boolean;
    affectedSocketIds: string[];
    updatedStatus?: MatchmakingStatusPayload;
  } {
    const entry = this.entriesBySocket.get(socketId);
    if (!entry) {
      return { removed: false, affectedSocketIds: [] };
    }

    this.entriesBySocket.delete(socketId);
    const bucket = this.buckets.get(entry.bucketKey);
    if (!bucket) {
      return { removed: true, affectedSocketIds: [] };
    }

    const filtered = bucket.filter((id) => id !== socketId);
    if (filtered.length === 0) {
      this.buckets.delete(entry.bucketKey);
      return { removed: true, affectedSocketIds: [] };
    }

    this.buckets.set(entry.bucketKey, filtered);
    const firstRemaining = this.entriesBySocket.get(filtered[0]!);
    return {
      removed: true,
      affectedSocketIds: [...filtered],
      updatedStatus: firstRemaining
        ? this.buildStatusForEntry(firstRemaining, filtered.length)
        : undefined,
    };
  }

  getStatusForSocket(socketId: string): MatchmakingStatusPayload | null {
    const entry = this.entriesBySocket.get(socketId);
    if (!entry) return null;
    const bucket = this.buckets.get(entry.bucketKey) ?? [];
    return this.buildStatusForEntry(entry, bucket.length);
  }

  clearAll(): void {
    this.entriesBySocket.clear();
    this.buckets.clear();
  }

  private buildStatusForEntry(entry: QueueEntry, queueSize: number): MatchmakingStatusPayload {
    return {
      status: 'SEARCHING',
      queueSize,
      targetPlayers: entry.targetPlayers,
      waitedSeconds: Math.max(0, Math.floor((Date.now() - entry.joinedAt) / 1000)),
      mapId: entry.mapId,
      gameSpeed: entry.gameSpeed,
    };
  }
}
