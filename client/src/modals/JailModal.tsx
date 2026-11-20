import {
  JAIL_BAIL_AMOUNT,
  MAX_JAIL_TURNS,
  type GameAction,
  type PlayerGameState,
} from '@capitalloop/shared';
import { useState } from 'react';
import { PrisonBarsIcon } from '../assets/icons';
import { ModalShell } from './ModalShell';

interface JailModalProps {
  player: PlayerGameState;
  onAction: (action: GameAction) => Promise<boolean>;
  onClose: () => void;
}

export function JailModal({ player, onAction, onClose }: JailModalProps) {
  const [busy, setBusy] = useState(false);

  const run = async (action: GameAction) => {
    setBusy(true);
    try {
      const ok = await onAction(action);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="You Are in Prison"
      subtitle={`Turn ${player.jailTurns + 1} of ${MAX_JAIL_TURNS}`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: 'var(--bg-surface-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PrisonBarsIcon size={28} />
        </div>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          Choose how to escape Prison this turn. Rolling doubles frees you immediately. On your
          3rd failed attempt, ${JAIL_BAIL_AMOUNT} bail is charged automatically.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void run({ type: 'ROLL_DICE' })}
        >
          Roll Dice for Doubles
        </button>

        <button
          type="button"
          className="btn btn-warning"
          disabled={busy || player.cash < JAIL_BAIL_AMOUNT}
          onClick={() => void run({ type: 'PAY_JAIL_BAIL' })}
        >
          Pay ${JAIL_BAIL_AMOUNT} Bail (Cash: ${player.cash})
        </button>

        {player.jailFreeCards > 0 && (
          <button
            type="button"
            className="btn btn-success"
            disabled={busy}
            onClick={() => void run({ type: 'USE_JAIL_CARD' })}
          >
            Use Get Out of Prison Free Card ({player.jailFreeCards} owned)
          </button>
        )}
      </div>
    </ModalShell>
  );
}