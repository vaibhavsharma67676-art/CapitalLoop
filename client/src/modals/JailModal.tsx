import {
  JAIL_BAIL_AMOUNT,
  MAX_JAIL_TURNS,
  type PlayerGameState,
} from '@capitalloop/shared';
import { CloseIcon, PrisonBarsIcon } from '../assets/icons';

interface JailModalProps {
  player: PlayerGameState;
  onClose: () => void;
}

/**
 * Compact, non-blocking Glassmorphism Prison status notice.
 * Action buttons (Roll Doubles, Pay Bail, Free Card) stay unified in ActionBar
 * so mobile and desktop never show duplicate controls.
 */
export function JailModal({ player, onClose }: JailModalProps) {
  return (
    <div className="inline-event-banner event-jail" role="status" aria-live="polite">
      <div className="inline-event-icon" aria-hidden="true">
        <PrisonBarsIcon size={17} />
      </div>

      <div className="inline-event-copy">
        <div className="inline-event-eyebrow">
          In Prison • Turn {player.jailTurns + 1}/{MAX_JAIL_TURNS}
        </div>
        <p className="inline-event-desc">
          Roll doubles to escape, pay ${JAIL_BAIL_AMOUNT} bail, or use a Prison Free card below.
        </p>
      </div>

      <div className="inline-event-actions">
        <button
          type="button"
          className="icon-btn inline-event-dismiss"
          onClick={onClose}
          aria-label="Dismiss prison notice"
        >
          <CloseIcon size={12} />
        </button>
      </div>
    </div>
  );
}
