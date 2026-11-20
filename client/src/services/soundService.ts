import { loadSoundMuted, saveSoundMuted } from './sessionStorage';

type SoundCue = 'dice' | 'buy' | 'rent' | 'card' | 'jail' | 'auction' | 'victory' | 'error';

class SoundService {
  private ctx: AudioContext | null = null;
  private muted: boolean = loadSoundMuted();

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveSoundMuted(this.muted);
    return this.muted;
  }

  play(cue: SoundCue): void {
    if (this.muted || typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      switch (cue) {
        case 'dice':
          this.tone(240, 0.05, 'triangle', 0.08, 0);
          this.tone(320, 0.05, 'triangle', 0.08, 0.06);
          this.tone(410, 0.07, 'triangle', 0.08, 0.12);
          break;
        case 'buy':
          this.tone(523, 0.09, 'sine', 0.11, 0);
          this.tone(659, 0.14, 'sine', 0.11, 0.08);
          break;
        case 'rent':
          this.tone(392, 0.08, 'sine', 0.09, 0);
          this.tone(330, 0.12, 'sine', 0.09, 0.08);
          break;
        case 'card':
          this.tone(440, 0.07, 'sine', 0.09, 0);
          this.tone(587, 0.11, 'sine', 0.09, 0.07);
          break;
        case 'jail':
          this.tone(180, 0.18, 'sawtooth', 0.08, 0);
          this.tone(130, 0.24, 'sawtooth', 0.08, 0.14);
          break;
        case 'auction':
          this.tone(660, 0.08, 'sine', 0.08, 0);
          break;
        case 'victory':
          this.tone(523, 0.12, 'triangle', 0.12, 0);
          this.tone(659, 0.12, 'triangle', 0.12, 0.12);
          this.tone(784, 0.14, 'triangle', 0.12, 0.24);
          this.tone(1046, 0.3, 'triangle', 0.14, 0.38);
          break;
        case 'error':
          this.tone(190, 0.12, 'sawtooth', 0.07, 0);
          break;
      }
    } catch {
      // Audio playback blocked before user gesture
    }
  }

  private tone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec: number,
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }
}

export const soundService = new SoundService();