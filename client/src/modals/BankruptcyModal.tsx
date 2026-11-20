import type { ClientGameState, GameAction, PendingDebt } from '@capitalloop/shared';
import { useState } from 'react';
import { ModalShell } from './ModalShell';

interface BankruptcyModalProps {
  gameState: ClientGameState;
  myPlayerId: string;
  debt?: PendingDebt | null;
  onAction: (action: GameAction) => Promise<boolean>;
  onOpenLiquidation: () => void;
  onClose?: () => void;
}

export function BankruptcyModal({
  gameState,
  myPlayerId,
  debt,
  onAction,
  onOpenLiquidation,
  onClose,
}: BankruptcyModalProps) {
  const [busy, setBusy] = useState(false);
  const me = gameState.players[myPlayerId];
  const creditor = debt?.creditorId ? gameState.players[debt.creditorId] : undefined;
  const canPayDebt = Boolean(debt && me && me.cash >= debt.amount);

  const run = async (action: GameAction) => {
    setBusy(true);
    try {
      const ok = await onAction(action);
      if (ok && onClose) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={debt ? 'Debt Settlement Required' : 'Declare Bankruptcy?'}
      subtitle={debt ? debt.reason : 'This permanently exits you from the current match'}
      dismissible={!debt}
      onClose={onClose}
    >
      {debt ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            className="panel-card"
            style={{
              padding: 14,
              background: 'rgba(225, 29, 72, 0.14)',
              borderColor: 'rgba(225, 29, 72, 0.35)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Amount Owed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fda4af' }}>
                ${debt.amount}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                To: {creditor ? creditor.nickname : 'The Bank'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Your Cash</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>${me?.cash ?? 0}</div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            {canPayDebt
              ? 'You now have enough cash to settle this debt and continue playing.'
              : 'Sell buildings, mortgage properties, or make a quick trade to raise funds — or declare bankruptcy.'}
          </p>

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenLiquidation}>
              Sell / Mortgage Assets
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-success"
                disabled={!canPayDebt || busy}
                onClick={() => void run({ type: 'PAY_DEBT' })}
              >
                Pay ${debt.amount}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void run({ type: 'DECLARE_BANKRUPTCY' })}
              >
                Declare Bankruptcy
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
            Are you sure you want to declare bankruptcy? Your properties will be{' '}
            {gameState.settings.bankruptcyTransferMode === 'CREDITOR'
              ? 'transferred per room bankruptcy rules'
              : 'returned to the Bank'}{' '}
            and you will spectate the rest of the match.
          </p>
          <div className="modal-actions">
            {onClose && (
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void run({ type: 'DECLARE_BANKRUPTCY' })}
            >
              Confirm Bankruptcy
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}