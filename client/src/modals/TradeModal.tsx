import {
  getColorGroupTiles,
  getTileById,
  isPurchasableTile,
  type ClientGameState,
  type GameAction,
  type TradeOffer,
  type TradeOfferItem,
} from '@capitalloop/shared';
import { useMemo, useState } from 'react';
import { TradeArrowsIcon } from '../assets/icons';
import { ModalShell } from './ModalShell';

interface TradeModalProps {
  gameState: ClientGameState;
  myPlayerId: string;
  mode: 'CREATE' | 'VIEW';
  initialTargetPlayerId?: string;
  existingTrade?: TradeOffer;
  onAction: (action: GameAction) => Promise<boolean>;
  onClose: () => void;
}

function getTradableTileIds(gameState: ClientGameState, playerId: string): number[] {
  const result: number[] = [];
  for (const prop of Object.values(gameState.properties)) {
    if (prop.ownerId !== playerId) continue;
    const tile = getTileById(gameState.settings.mapId, prop.tileId);
    if (!isPurchasableTile(tile)) continue;
    if (tile.type === 'STREET') {
      const groupTiles = getColorGroupTiles(gameState.settings.mapId, tile.colorGroup);
      const hasBuildings = groupTiles.some((t) => (gameState.properties[t.id]?.houses ?? 0) > 0);
      if (hasBuildings) continue;
    }
    result.push(prop.tileId);
  }
  return result.sort((a, b) => a - b);
}

export function TradeModal({
  gameState,
  myPlayerId,
  mode,
  initialTargetPlayerId,
  existingTrade,
  onAction,
  onClose,
}: TradeModalProps) {
  const [isCountering, setIsCountering] = useState(false);
  const [busy, setBusy] = useState(false);

  const otherActivePlayers = useMemo(
    () =>
      gameState.turnOrder
        .map((id) => gameState.players[id])
        .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.isBankrupt && p.id !== myPlayerId)),
    [gameState.players, gameState.turnOrder, myPlayerId],
  );

  const isViewOnly = mode === 'VIEW' && Boolean(existingTrade) && !isCountering;
  const amRecipient = existingTrade?.recipientId === myPlayerId;
  const amProposer = existingTrade?.proposerId === myPlayerId;

  const [targetPlayerId, setTargetPlayerId] = useState<string>(() => {
    if (existingTrade) {
      return existingTrade.proposerId === myPlayerId
        ? existingTrade.recipientId
        : existingTrade.proposerId;
    }
    return initialTargetPlayerId ?? otherActivePlayers[0]?.id ?? '';
  });

  const [myOffer, setMyOffer] = useState<TradeOfferItem>(() => {
    if (existingTrade) {
      return existingTrade.proposerId === myPlayerId
        ? { ...existingTrade.offered, propertyIds: [...existingTrade.offered.propertyIds] }
        : { ...existingTrade.requested, propertyIds: [...existingTrade.requested.propertyIds] };
    }
    return { cash: 0, propertyIds: [], jailFreeCards: 0 };
  });

  const [theirOffer, setTheirOffer] = useState<TradeOfferItem>(() => {
    if (existingTrade) {
      return existingTrade.proposerId === myPlayerId
        ? { ...existingTrade.requested, propertyIds: [...existingTrade.requested.propertyIds] }
        : { ...existingTrade.offered, propertyIds: [...existingTrade.offered.propertyIds] };
    }
    return { cash: 0, propertyIds: [], jailFreeCards: 0 };
  });

  const leftPlayerId = isViewOnly && existingTrade ? existingTrade.proposerId : myPlayerId;
  const rightPlayerId = isViewOnly && existingTrade ? existingTrade.recipientId : targetPlayerId;

  const leftPlayer = gameState.players[leftPlayerId];
  const rightPlayer = gameState.players[rightPlayerId];

  const leftItems = isViewOnly && existingTrade ? existingTrade.offered : myOffer;
  const rightItems = isViewOnly && existingTrade ? existingTrade.requested : theirOffer;

  const leftTradable = useMemo(
    () => (leftPlayer ? getTradableTileIds(gameState, leftPlayer.id) : []),
    [gameState, leftPlayer],
  );
  const rightTradable = useMemo(
    () => (rightPlayer ? getTradableTileIds(gameState, rightPlayer.id) : []),
    [gameState, rightPlayer],
  );

  const toggleProperty = (side: 'left' | 'right', tileId: number) => {
    if (isViewOnly) return;
    const setter = side === 'left' ? setMyOffer : setTheirOffer;
    setter((prev) => ({
      ...prev,
      propertyIds: prev.propertyIds.includes(tileId)
        ? prev.propertyIds.filter((id) => id !== tileId)
        : [...prev.propertyIds, tileId],
    }));
  };

  const handleSubmit = async () => {
    if (!rightPlayer) return;
    setBusy(true);
    try {
      const ok =
        isCountering && existingTrade
          ? await onAction({
              type: 'COUNTER_TRADE',
              tradeId: existingTrade.id,
              offered: myOffer,
              requested: theirOffer,
            })
          : await onAction({
              type: 'PROPOSE_TRADE',
              recipientId: rightPlayer.id,
              offered: myOffer,
              requested: theirOffer,
            });
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleTradeDecision = async (action: GameAction) => {
    setBusy(true);
    try {
      const ok = await onAction(action);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const title = isCountering
    ? 'Counter Trade Offer'
    : isViewOnly
      ? 'View Trade'
      : 'Create Trade Offer';

  return (
    <ModalShell title={title} wide onClose={onClose}>
      {!isViewOnly && !isCountering && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="setting-label" htmlFor="trade-partner-select" style={{ whiteSpace: 'nowrap' }}>
            Trade With:
          </label>
          <select
            id="trade-partner-select"
            className="select-field"
            value={targetPlayerId}
            onChange={(e) => {
              setTargetPlayerId(e.target.value);
              setTheirOffer({ cash: 0, propertyIds: [], jailFreeCards: 0 });
            }}
          >
            {otherActivePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname} (${p.cash})
              </option>
            ))}
          </select>
        </div>
      )}

      {leftPlayer && rightPlayer ? (
        <div className="trade-columns">
          {/* Left Column */}
          <TradeColumn
            player={leftPlayer}
            gameState={gameState}
            tradableIds={leftTradable}
            items={leftItems}
            readOnly={isViewOnly}
            onCashChange={(cash) => setMyOffer((prev) => ({ ...prev, cash }))}
            onJailCardChange={(jailFreeCards) => setMyOffer((prev) => ({ ...prev, jailFreeCards }))}
            onToggleProperty={(id) => toggleProperty('left', id)}
          />

          {/* Right Column */}
          <TradeColumn
            player={rightPlayer}
            gameState={gameState}
            tradableIds={rightTradable}
            items={rightItems}
            readOnly={isViewOnly}
            onCashChange={(cash) => setTheirOffer((prev) => ({ ...prev, cash }))}
            onJailCardChange={(jailFreeCards) => setTheirOffer((prev) => ({ ...prev, jailFreeCards }))}
            onToggleProperty={(id) => toggleProperty('right', id)}
          />
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 16 }}>
          No active players available for trading.
        </div>
      )}

      <div className="modal-actions" style={{ justifyContent: 'center' }}>
        {isViewOnly && existingTrade ? (
          <>
            {amRecipient && existingTrade.status === 'PENDING' && (
              <>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={busy}
                  onClick={() => void handleTradeDecision({ type: 'ACCEPT_TRADE', tradeId: existingTrade.id })}
                >
                  Accept Trade
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => setIsCountering(true)}
                >
                  <TradeArrowsIcon size={15} />
                  Counteroffer
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void handleTradeDecision({ type: 'REJECT_TRADE', tradeId: existingTrade.id })}
                >
                  Reject
                </button>
              </>
            )}
            {amProposer && existingTrade.status === 'PENDING' && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void handleTradeDecision({ type: 'CANCEL_TRADE', tradeId: existingTrade.id })}
              >
                Cancel Trade
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !rightPlayer}
              onClick={() => void handleSubmit()}
            >
              <TradeArrowsIcon size={15} />
              {isCountering ? 'Send Counteroffer' : 'Send Trade Offer'}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function TradeColumn({
  player,
  gameState,
  tradableIds,
  items,
  readOnly,
  onCashChange,
  onJailCardChange,
  onToggleProperty,
}: {
  player: ClientGameState['players'][string];
  gameState: ClientGameState;
  tradableIds: number[];
  items: TradeOfferItem;
  readOnly: boolean;
  onCashChange: (cash: number) => void;
  onJailCardChange: (cards: number) => void;
  onToggleProperty: (tileId: number) => void;
}) {
  const displayTileIds = readOnly ? items.propertyIds : tradableIds;

  return (
    <div className="trade-side-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span className="color-dot" style={{ background: player.color }} />
        <strong>{player.nickname}</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span>$0</span>
          <span>${player.cash}</span>
        </div>
        <input
          type="range"
          className="trade-range-slider"
          min={0}
          max={Math.max(0, player.cash)}
          step={10}
          disabled={readOnly}
          value={Math.min(items.cash, Math.max(0, player.cash))}
          onChange={(e) => onCashChange(Number(e.target.value))}
        />
        <span className="trade-cash-pill">${items.cash}</span>
      </div>

      {player.jailFreeCards > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span>Prison Free Cards ({player.jailFreeCards})</span>
          <input
            type="number"
            className="input-field"
            style={{ width: 64, padding: '4px 8px', textAlign: 'center' }}
            min={0}
            max={player.jailFreeCards}
            disabled={readOnly}
            value={items.jailFreeCards}
            onChange={(e) =>
              onJailCardChange(Math.max(0, Math.min(player.jailFreeCards, Number(e.target.value) || 0)))
            }
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {displayTileIds.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', padding: 10 }}>
            {readOnly ? 'No properties included' : 'No unimproved properties'}
          </div>
        ) : (
          displayTileIds.map((tileId) => {
            const tile = getTileById(gameState.settings.mapId, tileId);
            const selected = items.propertyIds.includes(tileId);
            const price = isPurchasableTile(tile) ? tile.price : 0;
            const dotColor =
              tile.type === 'STREET' ? `var(--group-${tile.colorGroup})` : '#94a3b8';

            return (
              <button
                key={tileId}
                type="button"
                className={`trade-prop-chip ${selected ? 'selected' : ''}`}
                disabled={readOnly}
                onClick={() => onToggleProperty(tileId)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="color-dot" style={{ background: dotColor }} />
                  <span>{tile.name}</span>
                </span>
                <span>${price}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}