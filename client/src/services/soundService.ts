import {
  loadSoundMuted,
  loadSoundVolume,
  saveSoundMuted,
  saveSoundVolume,
} from './sessionStorage';

export type SoundCue =
  | 'diceRoll'
  | 'diceLand'
  | 'buy'
  | 'rent'
  | 'moneyReceive'
  | 'moneyDeduct'
  | 'tradePropose'
  | 'tradeAccept'
  | 'tradeReject'
  | 'auctionBid'
  | 'auctionWin'
  | 'houseBuild'
  | 'hotelBuild'
  | 'mortgage'
  | 'unmortgage'
  | 'surpriseCard'
  | 'treasuryCard'
  | 'jailEnter'
  | 'jailExit'
  | 'bankrupt'
  | 'victory'
  | 'error'
  | 'playerJoin'
  | 'playerLeave';

type SoundListener = (state: { muted: boolean; volume: number }) => void;

const MIN_CUE_INTERVAL_MS = 110;

/**
 * Zero-dependency Web Audio synthesizer providing 24 clean, non-fatiguing game sound effects.
 * - Handles mobile iOS/Android audio context unlocking on first user gesture.
 * - Throttles duplicate overlapping triggers cleanly.
 * - Persists mute and master volume preferences in localStorage.
 */
class SoundService {
  private ctx: AudioContext | null = null;
  private muted: boolean = loadSoundMuted();
  private volume: number = loadSoundVolume();
  private lastPlayedAt = new Map<SoundCue, number>();
  private listeners = new Set<SoundListener>();
  private unlockBound = false;

  constructor() {
    this.bindAutoplayUnlock();
  }

  subscribe(listener: SoundListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isMuted(): boolean {
    return this.muted;
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(nextVolume: number): number {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(nextVolume) ? nextVolume : 0.75));
    this.volume = clamped;
    if (clamped > 0 && this.muted) {
      this.muted = false;
      saveSoundMuted(false);
    }
    saveSoundVolume(clamped);
    this.notify();
    return this.volume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveSoundMuted(this.muted);
    this.notify();
    return this.muted;
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    try {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume();
      }
    } catch {
      // Ignore blocked resume before gesture
    }
  }

  play(cue: SoundCue): void {
    if (this.muted || this.volume <= 0.005 || typeof window === 'undefined') return;

    const nowMs = Date.now();
    const prev = this.lastPlayedAt.get(cue) ?? 0;
    if (nowMs - prev < MIN_CUE_INTERVAL_MS) return;
    this.lastPlayedAt.set(cue, nowMs);

    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      switch (cue) {
        case 'diceRoll':
          this.tone(240, 0.045, 'triangle', 0.09, 0);
          this.tone(310, 0.045, 'triangle', 0.09, 0.055);
          this.tone(390, 0.05, 'triangle', 0.09, 0.11);
          this.tone(280, 0.045, 'triangle', 0.08, 0.165);
          break;
        case 'diceLand':
          this.tone(460, 0.06, 'sine', 0.1, 0);
          this.tone(580, 0.08, 'sine', 0.09, 0.05);
          break;
        case 'buy':
          this.tone(523.25, 0.08, 'sine', 0.12, 0);
          this.tone(659.25, 0.09, 'sine', 0.12, 0.07);
          this.tone(783.99, 0.14, 'sine', 0.12, 0.14);
          break;
        case 'rent':
          this.tone(415, 0.08, 'sine', 0.1, 0);
          this.tone(330, 0.12, 'sine', 0.1, 0.08);
          break;
        case 'moneyReceive':
          this.tone(587.33, 0.07, 'sine', 0.11, 0);
          this.tone(880, 0.12, 'sine', 0.11, 0.065);
          break;
        case 'moneyDeduct':
          this.tone(349.23, 0.07, 'triangle', 0.09, 0);
          this.tone(277.18, 0.11, 'triangle', 0.09, 0.07);
          break;
        case 'tradePropose':
          this.tone(440, 0.06, 'sine', 0.09, 0);
          this.tone(554.37, 0.09, 'sine', 0.09, 0.06);
          break;
        case 'tradeAccept':
          this.tone(523.25, 0.07, 'triangle', 0.11, 0);
          this.tone(659.25, 0.07, 'triangle', 0.11, 0.07);
          this.tone(1046.5, 0.16, 'triangle', 0.12, 0.14);
          break;
        case 'tradeReject':
          this.tone(311.13, 0.08, 'sawtooth', 0.06, 0);
          this.tone(233.08, 0.13, 'sawtooth', 0.06, 0.08);
          break;
        case 'auctionBid':
          this.tone(622.25, 0.065, 'sine', 0.095, 0);
          break;
        case 'auctionWin':
          this.tone(523.25, 0.08, 'triangle', 0.11, 0);
          this.tone(659.25, 0.08, 'triangle', 0.11, 0.08);
          this.tone(783.99, 0.16, 'triangle', 0.12, 0.16);
          break;
        case 'houseBuild':
          this.tone(392, 0.06, 'triangle', 0.1, 0);
          this.tone(523.25, 0.09, 'triangle', 0.11, 0.06);
          break;
        case 'hotelBuild':
          this.tone(392, 0.07, 'triangle', 0.11, 0);
          this.tone(523.25, 0.07, 'triangle', 0.11, 0.07);
          this.tone(659.25, 0.08, 'triangle', 0.12, 0.14);
          this.tone(783.99, 0.18, 'triangle', 0.13, 0.21);
          break;
        case 'mortgage':
          this.tone(440, 0.07, 'sine', 0.09, 0);
          this.tone(349.23, 0.09, 'sine', 0.09, 0.07);
          this.tone(293.66, 0.12, 'sine', 0.08, 0.14);
          break;
        case 'unmortgage':
          this.tone(349.23, 0.07, 'sine', 0.09, 0);
          this.tone(440, 0.08, 'sine', 0.09, 0.07);
          this.tone(587.33, 0.12, 'sine', 0.1, 0.14);
          break;
        case 'surpriseCard':
          this.tone(493.88, 0.06, 'sine', 0.1, 0);
          this.tone(659.25, 0.07, 'sine', 0.1, 0.06);
          this.tone(739.99, 0.11, 'sine', 0.1, 0.12);
          break;
        case 'treasuryCard':
          this.tone(440, 0.07, 'triangle', 0.1, 0);
          this.tone(554.37, 0.07, 'triangle', 0.1, 0.07);
          this.tone(659.25, 0.12, 'triangle', 0.1, 0.14);
          break;
        case 'jailEnter':
          this.tone(200, 0.16, 'sawtooth', 0.075, 0);
          this.tone(145, 0.24, 'sawtooth', 0.075, 0.15);
          break;
        case 'jailExit':
          this.tone(392, 0.07, 'sine', 0.1, 0);
          this.tone(587.33, 0.14, 'sine', 0.11, 0.07);
          break;
        case 'bankrupt':
          this.tone(293.66, 0.12, 'sawtooth', 0.075, 0);
          this.tone(246.94, 0.12, 'sawtooth', 0.075, 0.12);
          this.tone(196, 0.26, 'sawtooth', 0.08, 0.24);
          break;
        case 'victory':
          this.tone(523.25, 0.1, 'triangle', 0.12, 0);
          this.tone(659.25, 0.1, 'triangle', 0.12, 0.1);
          this.tone(783.99, 0.12, 'triangle', 0.13, 0.2);
          this.tone(1046.5, 0.3, 'triangle', 0.14, 0.32);
          break;
        case 'error':
          this.tone(195, 0.11, 'sawtooth', 0.07, 0);
          break;
        case 'playerJoin':
          this.tone(523.25, 0.055, 'sine', 0.08, 0);
          this.tone(659.25, 0.08, 'sine', 0.08, 0.055);
          break;
        case 'playerLeave':
          this.tone(440, 0.06, 'sine', 0.07, 0);
          this.tone(330, 0.09, 'sine', 0.07, 0.06);
          break;
      }
    } catch {
      // Never crash gameplay on audio failures
    }
  }

  private bindAutoplayUnlock(): void {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const handler = () => {
      this.unlock();
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    window.addEventListener('keydown', handler, { passive: true });
    window.addEventListener('touchstart', handler, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  private notify(): void {
    const snapshot = { muted: this.muted, volume: this.volume };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private tone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    baseVolume: number,
    delaySec: number,
  ): void {
    if (!this.ctx) return;
    const gainLevel = Math.max(0.0001, baseVolume * this.volume);
    const now = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainLevel, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }
}

export const soundService = new SoundService();
