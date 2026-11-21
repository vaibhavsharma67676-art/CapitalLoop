import type { GameAction, PendingTaxState } from '@capitalloop/shared';
import { useState } from 'react';

interface TaxModalProps {
  pendingTax: PendingTaxState;
  onAction: (action: GameAction) => Promise<boolean>;
}

/**
 * Compact, non-blocking Glassmorphism notification for Income Tax decisions.
 */
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
    <div className="inline-event-banner event-tax" role="status" aria-live="polite">
      <div className="inline-event-icon" aria-hidden="true">
        <span className="event-tax-mark">%</span>
      </div>

      <div className="inline-event-copy">
        <div className="inline-event-eyebrow">Income Tax Assessment</div>
        <div className="inline-event-title">Choose Tax Payment</div>
        <p className="inline-event-desc">
          Pay ${pendingTax.flatAmount} flat or 10% net worth (${pendingTax.percentAmount}).
        </p>
      </div>

      <div className="inline-event-actions inline-event-actions-row">
        <button
          type="button"
          className="btn btn-primary btn-xs"
          disabled={busy}
          onClick={() => void choose('FLAT')}
        >
          ${pendingTax.flatAmount} Flat
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          disabled={busy}
          onClick={() => void choose('PERCENT')}
        >
          ${pendingTax.percentAmount} (10%)
        </button>
      </div>
    </div>
  );
}
