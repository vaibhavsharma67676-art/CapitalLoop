import type { DrawnCardState, GameAction } from '@capitalloop/shared';
import { useState } from 'react';
import { ChestIcon } from '../assets/icons';
import { ModalShell } from './ModalShell';

interface CardDrawModalProps {
  pendingCard: DrawnCardState;
  drawerName: string;
  isMyCard: boolean;
  onAction: (action: GameAction) => Promise<boolean>;
}

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
    <ModalShell
      title={isChance ? 'Surprise Card' : 'Treasury Card'}
      subtitle={`Drawn by ${drawerName}`}
      dismissible={false}
    >
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: isChance
            ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(124, 77, 255, 0.24))'
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(124, 77, 255, 0.22))',
          border: '1px solid var(--border-strong)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {isChance ? (
          <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f472b6', lineHeight: 1 }}>
            ?
          </span>
        ) : (
          <ChestIcon size={36} />
        )}
        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{pendingCard.card.title}</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.45 }}>
          {pendingCard.card.description}
        </p>
      </div>

      <div className="modal-actions" style={{ justifyContent: 'center' }}>
        {isMyCard ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void handleAcknowledge()}
          >
            Resolve Card
          </button>
        ) : (
          <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            Waiting for {drawerName} to resolve this card...
          </span>
        )}
      </div>
    </ModalShell>
  );
}