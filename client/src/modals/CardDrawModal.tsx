import type { DrawnCardState, GameAction } from '@capitalloop/shared';
import { useState } from 'react';
import { ChestIcon } from '../assets/icons';

interface CardDrawModalProps {
  pendingCard: DrawnCardState;
  drawerName: string;
  isMyCard: boolean;
  onAction: (action: GameAction) => Promise<boolean>;
}

/**
 * Compact, non-blocking Glassmorphism notification for Surprise (Chance) and
 * Treasury (Community Chest) cards. Preserves all card text and game mechanics
 * without opening a blocking modal pop-up.
 */
export function CardDrawModal({
  pendingCard,
  drawerName,
  isMyCard,
  onAction,
}: CardDrawModalProps) {
  const [busy, setBusy] = useState(false);
  const isChance = pendingCard.card.deck === 'CHANCE';

  const handleAcknowledge = async () => {
    setBusy(true);
    try {
      await onAction({ type: 'ACKNOWLEDGE_CARD' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`inline-event-banner ${isChance ? 'event-chance' : 'event-community'}`}
      role="status"
      aria-live="polite"
    >
      <div className="inline-event-icon" aria-hidden="true">
        {isChance ? <span className="event-chance-mark">?</span> : <ChestIcon size={18} />}
      </div>

      <div className="inline-event-copy">
        <div className="inline-event-eyebrow">
          <span>{isChance ? 'Surprise Card' : 'Treasury Card'}</span>
          <span className="inline-event-dot">•</span>
          <span>{drawerName}</span>
        </div>
        <div className="inline-event-title">{pendingCard.card.title}</div>
        <p className="inline-event-desc">{pendingCard.card.description}</p>
      </div>

      <div className="inline-event-actions">
        {isMyCard ? (
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={busy}
            onClick={() => void handleAcknowledge()}
          >
            {busy ? '...' : 'Resolve'}
          </button>
        ) : (
          <span className="inline-event-wait">Waiting...</span>
        )}
      </div>
    </div>
  );
}
