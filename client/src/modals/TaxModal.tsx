import type { GameAction, PendingTaxState } from '@capitalloop/shared';
import { useState } from 'react';
import { ModalShell } from './ModalShell';

interface TaxModalProps {
  pendingTax: PendingTaxState;
  onAction: (action: GameAction) => Promise<boolean>;
}

export function TaxModal({ pendingTax, onAction }: TaxModalProps) {
  const [busy, setBusy] = useState(false);

  const choose = async (choice: 'FLAT' | 'PERCENT') => {
    setBusy(true);
    try {
      await onAction({ type: 'CHOOSE_TAX_OPTION', choice });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Income Tax Assessment"
      subtitle="Select your preferred tax calculation"
      dismissible={false}
    >
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        You landed on Income Tax. Choose whether to pay the flat rate or 10% of your total net worth:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          style={{ flexDirection: 'column', gap: 4 }}
          disabled={busy}
          onClick={() => void choose('FLAT')}
        >
          <span style={{ fontSize: '1.25rem' }}>${pendingTax.flatAmount}</span>
          <span style={{ fontSize: '0.76rem', opacity: 0.9 }}>Flat Tax</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-lg"
          style={{ flexDirection: 'column', gap: 4 }}
          disabled={busy}
          onClick={() => void choose('PERCENT')}
        >
          <span style={{ fontSize: '1.25rem' }}>${pendingTax.percentAmount}</span>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>10% Net Worth</span>
        </button>
      </div>
    </ModalShell>
  );
}