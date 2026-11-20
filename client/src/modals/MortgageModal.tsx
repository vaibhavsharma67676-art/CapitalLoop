import {
  getTileById,
  getUnmortgageCost,
  HOTEL_LEVEL,
  isPurchasableTile,
  type ClientGameState,
  type GameAction,
} from '@capitalloop/shared';
import { useState } from 'react';
import { ModalShell } from './ModalShell';

interface MortgageModalProps {
  gameState: ClientGameState;
  myPlayerId: string;
  onAction: (action: GameAction) => Promise<boolean>;
  onClose: () => void;
}

export function MortgageModal({
  gameState,
  myPlayerId,
  onAction,
  onClose,
}: MortgageModalProps) {
  const [busyTile, setBusyTile] = useState<number | null>(null);
  const me = gameState.players[myPlayerId];

  const myProperties = Object.values(gameState.properties)
    .filter((p) => p.ownerId === myPlayerId)
    .sort((a, b) => a.tileId - b.tileId);

  const run = async (tileId: number, action: GameAction) => {
    setBusyTile(tileId);
    try {
      await onAction(action);
    } finally {
      setBusyTile(null);
    }
  };

  return (
    <ModalShell
      title="Mortgages & Liquidation"
      subtitle={`Available Cash: $${me?.cash ?? 0} • Unmortgage Interest: ${gameState.settings.mortgageInterestPercent}%`}
      wide
      onClose={onClose}
    >
      {myProperties.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 18 }}>
          You do not own any properties yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {myProperties.map((prop) => {
            const tile = getTileById(gameState.settings.mapId, prop.tileId);
            if (!isPurchasableTile(tile)) return null;

            const unmortgageCost = getUnmortgageCost(tile, gameState.settings.mortgageInterestPercent);
            const dotColor =
              tile.type === 'STREET' ? `var(--group-${tile.colorGroup})` : '#94a3b8';

            return (
              <div
                key={prop.tileId}
                className="lobby-player-row"
                style={{ opacity: prop.mortgaged ? 0.78 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="color-dot" style={{ background: dotColor }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{tile.name}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {prop.mortgaged
                        ? `Mortgaged • Redeem for $${unmortgageCost}`
                        : prop.houses > 0
                          ? prop.houses === HOTEL_LEVEL
                            ? '1 Hotel built'
                            : `${prop.houses} House${prop.houses > 1 ? 's' : ''} built`
                          : `Mortgage Value: $${tile.mortgageValue}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {tile.type === 'STREET' && prop.houses > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={busyTile === prop.tileId}
                      onClick={() => void run(prop.tileId, { type: 'SELL_HOUSE', tileId: prop.tileId })}
                    >
                      Sell Building (+${Math.floor(tile.houseCost / 2)})
                    </button>
                  )}

                  {!prop.mortgaged && prop.houses === 0 && (
                    <button
                      type="button"
                      className="btn btn-warning btn-xs"
                      disabled={busyTile === prop.tileId}
                      onClick={() =>
                        void run(prop.tileId, { type: 'MORTGAGE_PROPERTY', tileId: prop.tileId })
                      }
                    >
                      Mortgage (+${tile.mortgageValue})
                    </button>
                  )}

                  {prop.mortgaged && (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      disabled={busyTile === prop.tileId || (me?.cash ?? 0) < unmortgageCost}
                      onClick={() =>
                        void run(prop.tileId, { type: 'UNMORTGAGE_PROPERTY', tileId: prop.tileId })
                      }
                    >
                      Unmortgage (-${unmortgageCost})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </ModalShell>
  );
}