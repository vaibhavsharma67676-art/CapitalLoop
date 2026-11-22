import { useEffect, useRef, useState } from 'react';
import { VolumeIcon } from '../assets/icons';
import { soundService } from '../services/soundService';

interface AudioControlPopoverProps {
  compact?: boolean;
}

export function AudioControlPopover({ compact = false }: AudioControlPopoverProps) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => soundService.isMuted());
  const [volume, setVolume] = useState<number>(() => soundService.getVolume());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return soundService.subscribe((next) => {
      setMuted(next.muted);
      setVolume(next.volume);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const percent = Math.round((muted ? 0 : volume) * 100);

  return (
    <div className="audio-control-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`icon-btn ${compact ? 'mobile-hud-icon-btn' : ''}`}
        title={muted ? 'Sound Muted — Click for Audio Controls' : `Volume ${percent}% — Click for Audio Controls`}
        aria-label="Sound and Volume Controls"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <VolumeIcon muted={muted || volume <= 0.005} size={compact ? 13 : 15} />
      </button>

      {open && (
        <div className="panel-card audio-popover" role="dialog" aria-label="Audio settings">
          <div className="audio-popover-row">
            <span className="setting-label">Master Audio</span>
            <span className="badge-pill">{muted ? 'Muted' : `${percent}%`}</span>
          </div>

          <input
            type="range"
            className="trade-range-slider"
            min={0}
            max={100}
            step={5}
            value={percent}
            aria-label="Master sound volume"
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              soundService.setVolume(next);
            }}
          />

          <div className="audio-popover-actions">
            <button
              type="button"
              className={`btn btn-xs ${muted ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => soundService.toggleMute()}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              disabled={muted}
              onClick={() => soundService.play('buy')}
            >
              Test Sound
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
