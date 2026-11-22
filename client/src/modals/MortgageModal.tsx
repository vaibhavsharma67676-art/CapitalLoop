import {
  canLiquidateInPhase,
  getColorGroupTiles,
  getTileById,
  getUnmortgageCost,
  HOTEL_LEVEL,
  isPurchasableTile,
  type ClientGameState,
  type GameAction,
} from '@capitalloop/shared';
import { useState } from 'react';
import { CountryFlag } from '../assets/countryFlags';
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
  const [buyingPending, setBuyingPending] = useState(false);

  const me = gameState.players[myPlayerId];
  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? '';
  const isMyTurn = currentPlayerId === myPlayerId;
  const isDebtorRaisingFunds =
    gameState.phase === 'DEBT_RESOLUTION' && gameState.pendingDebt?.debtorId === myPlayerId;

  const canLiquidateNow = canLiquidateInPhase(gameState.phase, isMyTurn, isDebtorRaisingFunds);
  const canUnmortgageNow =
    isMyTurn &&
    (gameState.phase === 'WAITING_FOR_ROLL' ||
      gameState.phase === 'AWAITING_BUY_DECISION' ||
      gameState.phase === 'POST_ROLL_ACTIONS');

  const pendingTile =
    isMyTurn &&
    gameState.phase === 'AWAITING_BUY_DECISION' &&
    gameState.pendingPurchaseTileId !== null
      ? getTileById(gameState.settings.mapId, gameState.pendingPurchaseTileId)
      : null;

  const pendingPrice = pendingTile && isPurchasableTile(pendingTile) ? pendingTile.price : 0;
  const pendingShortfall = Math.max(0, pendingPrice - (me?.cash ?? 0));
  const canAffordPendingNow = Boolean(pendingTile && (me?.cash ?? 0) >= pendingPrice);

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

  const handleBuyPendingNow = async () => {
    setBuyingPending(true);
    try {
      const ok = await onAction({ type: 'BUY_PROPERTY' });
      if (ok) onClose();
    } finally {
      setBuyingPending(false);
    }
  };

  return (
    <ModalShell
      title={pendingTile ? 'Mortgage Properties to Raise Cash' : 'Property & Mortgage Manager'}
      subtitle={`Available Cash: $${me?.cash ?? 0} • Unmortgage Interest: ${gameState.settings.mortgageInterestPercent}%`}
      wide
      onClose={onClose}
    >
      {pendingTile && (
        <div className={`mortgage-purchase-banner ${canAffordPendingNow ? 'ready' : ''}`}>
          <div className="mortgage-purchase-info">
            <div className="mortgage-purchase-title">
              Pending Purchase: <strong>{pendingTile.name}</strong> (${pendingPrice})
            </div>
            <div className="mortgage-purchase-sub">
              {canAffordPendingNow
                ? `You now have $${me?.cash ?? 0} — ready to buy ${pendingTile.name}!`
                : `Need $${pendingShortfall} more cash. Mortgage eligible properties below without losing your turn.`}
            </div>
          </div>

          {canAffordPendingNow && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              disabled={buyingPending}
              onClick={() => void handleBuyPendingNow()}
            >
              {buyingPending ? 'Buying...' : `Buy Now ($${pendingPrice})`}
            </button>
          )}
        </div>
      )}

      {!gameState.settings.mortgageEnabled && (
        <div className="mortgage-notice-warn">
          Mortgaging is disabled in this room&apos;s settings.
        </div>
      )}

      {!canLiquidateNow && (
        <div className="mortgage-notice-warn">
          You can mortgage or sell buildings during your own turn (or while settling debt).
        </div>
      )}

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

            let groupHasBuildings = false;
            if (tile.type === 'STREET') {
              const groupTiles = getColorGroupTiles(gameState.settings.mapId, tile.colorGroup);
              groupHasBuildings = groupTiles.some(
                (t) => (gameState.properties[t.id]?.houses ?? 0) > 0,
              );
            }

            const canMortgageTile =
              gameState.settings.mortgageEnabled &&
              canLiquidateNow &&
              !prop.mortgaged &&
              !groupHasBuildings;

            const canUnmortgageTile =
              gameState.settings.mortgageEnabled &&
              canUnmortgageNow &&
              prop.mortgaged &&
              (me?.cash ?? 0) >= unmortgageCost;

            return (
              <div
                key={prop.tileId}
                className="lobby-player-row"
                style={{ opacity: prop.mortgaged ? 0.8 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className="color-dot" style={{ background: dotColor }} />
                  {(tile.type === 'STREET' || tile.type === 'TRANSIT') && (
                    <CountryFlag code={tile.countryCode} countryName={tile.country} size={17} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{tile.name}</span>
                      {prop.mortgaged && (
                        <span
                          className="badge-pill"
                          style={{ background: 'rgba(225, 29, 72, 0.2)', color: '#fda4af' }}
                        >
                          MORTGAGED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                      {prop.mortgaged
                        ? `Redeem cost: $${unmortgageCost} (incl. ${gameState.settings.mortgageInterestPercent}% interest)`
                        : groupHasBuildings
                          ? prop.houses > 0
                            ? `${prop.houses === HOTEL_LEVEL ? '1 Hotel' : `${prop.houses} House${prop.houses > 1 ? 's' : ''}`} — Sell buildings in group to mortgage`
                            : 'Group has buildings — sell group buildings first to mortgage'
                          : `Mortgage Value: +$${tile.mortgageValue}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {tile.type === 'STREET' && prop.houses > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={busyTile === prop.tileId || !canLiquidateNow}
                      onClick={() => void run(prop.tileId, { type: 'SELL_HOUSE', tileId: prop.tileId })}
                    >
                      Sell (+${Math.floor(tile.houseCost / 2)})
                    </button>
                  )}

                  {!prop.mortgaged && prop.houses === 0 && (
                    <button
                      type="button"
                      className="btn btn-warning btn-xs"
                      disabled={busyTile === prop.tileId || !canMortgageTile}
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
                      disabled={busyTile === prop.tileId || !canUnmortgageTile}
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
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          {pendingTile ? 'Return to Purchase' : 'Done'}
        </button>
      </div>
    </ModalShell>
  );
}
