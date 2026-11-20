import fs from 'node:fs/promises';
import path from 'node:path';
import type { PersistedRoomRecord } from '../rooms/roomTypes';
import type { Logger } from './logger';

export interface PersistenceAdapter {
  init(): Promise<void>;
  loadAll(): Promise<PersistedRoomRecord[]>;
  saveRoom(record: PersistedRoomRecord, immediate?: boolean): void;
  deleteRoom(roomCode: string): Promise<void>;
  flushAll(): Promise<void>;
}

export class FilePersistenceService implements PersistenceAdapter {
  private readonly roomsDir: string;
  private readonly enabled: boolean;
  private readonly logger: Logger;
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();
  private readonly pendingSnapshots = new Map<string, PersistedRoomRecord>();

  constructor(dataDir: string, enabled: boolean, logger: Logger) {
    this.roomsDir = path.join(dataDir, 'rooms');
    this.enabled = enabled;
    this.logger = logger;
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    await fs.mkdir(this.roomsDir, { recursive: true });
  }

  async loadAll(): Promise<PersistedRoomRecord[]> {
    if (!this.enabled) return [];
    try {
      await this.init();
      const entries = await fs.readdir(this.roomsDir);
      const records: PersistedRoomRecord[] = [];
      for (const file of entries) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(this.roomsDir, file), 'utf8');
          const parsed = JSON.parse(raw) as PersistedRoomRecord;
          if (parsed && typeof parsed.roomCode === 'string') {
            records.push(parsed);
          }
        } catch (err) {
          this.logger.warn('Failed to parse persisted room file; skipping', {
            file,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return records;
    } catch (err) {
      this.logger.error('Failed loading persisted rooms', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  saveRoom(record: PersistedRoomRecord, immediate = false): void {
    if (!this.enabled) return;
    const roomCode = record.roomCode;
    const snapshot = structuredClone(record);
    this.pendingSnapshots.set(roomCode, snapshot);

    const existingTimer = this.pendingTimers.get(roomCode);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.pendingTimers.delete(roomCode);
    }

    if (immediate) {
      void this.writeSnapshot(roomCode, snapshot);
      return;
    }

    const timer = setTimeout(() => {
      this.pendingTimers.delete(roomCode);
      const latest = this.pendingSnapshots.get(roomCode);
      if (latest) {
        void this.writeSnapshot(roomCode, latest);
      }
    }, 250);
    this.pendingTimers.set(roomCode, timer);
  }

  async deleteRoom(roomCode: string): Promise<void> {
    const existingTimer = this.pendingTimers.get(roomCode);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.pendingTimers.delete(roomCode);
    }
    this.pendingSnapshots.delete(roomCode);
    if (!this.enabled) return;

    const targetPath = this.getRoomPath(roomCode);
    try {
      await fs.unlink(targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Failed deleting room snapshot', {
          roomCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async flushAll(): Promise<void> {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();

    if (!this.enabled) {
      this.pendingSnapshots.clear();
      return;
    }

    const tasks: Promise<void>[] = [];
    for (const [roomCode, snapshot] of this.pendingSnapshots.entries()) {
      tasks.push(this.writeSnapshot(roomCode, snapshot));
    }
    await Promise.all(tasks);
  }

  private getRoomPath(roomCode: string): string {
    const safeCode = roomCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return path.join(this.roomsDir, `${safeCode}.json`);
  }

  private async writeSnapshot(roomCode: string, snapshot: PersistedRoomRecord): Promise<void> {
    const targetPath = this.getRoomPath(roomCode);
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.mkdir(this.roomsDir, { recursive: true });
      await fs.writeFile(tempPath, JSON.stringify(snapshot), 'utf8');
      await fs.rename(tempPath, targetPath);
      this.pendingSnapshots.delete(roomCode);
    } catch (err) {
      this.logger.error('Failed writing room snapshot', {
        roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}