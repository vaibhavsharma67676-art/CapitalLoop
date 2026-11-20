import type { RoomSessionCredentials } from '@capitalloop/shared';
import type { ThemeConfig } from '../types/theme';

const SESSION_PREFIX = 'capitalloop:session:';
const LAST_ROOM_KEY = 'capitalloop:lastRoom';
const NICKNAME_KEY = 'capitalloop:nickname';
const THEME_KEY = 'capitalloop:theme';
const MUTE_KEY = 'capitalloop:muted';

export function saveRoomCredentials(creds: RoomSessionCredentials): void {
  try {
    const code = creds.roomCode.toUpperCase();
    localStorage.setItem(`${SESSION_PREFIX}${code}`, JSON.stringify(creds));
    localStorage.setItem(LAST_ROOM_KEY, code);
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
}

export function loadRoomCredentials(roomCode: string): RoomSessionCredentials | null {
  try {
    const raw = localStorage.getItem(`${SESSION_PREFIX}${roomCode.toUpperCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomSessionCredentials;
    if (parsed && parsed.roomCode && parsed.playerId && parsed.sessionToken) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearRoomCredentials(roomCode: string): void {
  try {
    const code = roomCode.toUpperCase();
    localStorage.removeItem(`${SESSION_PREFIX}${code}`);
    if (localStorage.getItem(LAST_ROOM_KEY) === code) {
      localStorage.removeItem(LAST_ROOM_KEY);
    }
  } catch {
    // Ignore
  }
}

export function loadLastRoomCredentials(): RoomSessionCredentials | null {
  try {
    const lastCode = localStorage.getItem(LAST_ROOM_KEY);
    if (!lastCode) return null;
    return loadRoomCredentials(lastCode);
  } catch {
    return null;
  }
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Ignore
  }
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveThemeConfig(theme: ThemeConfig): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Ignore
  }
}

export function loadThemeConfig(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ThemeConfig;
  } catch {
    return null;
  }
}

export function saveSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore
  }
}

export function loadSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}