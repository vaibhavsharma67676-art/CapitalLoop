import {
  getColorGroupTiles,
  getTileById,
  getUnmortgageCost,
  HOTEL_LEVEL,
  isPurchasableTile,
  MAX_HOUSES_BEFORE_HOTEL,
  TRANSIT_RENT_SCHEDULE,
  UTILITY_MULTIPLIERS,
  type ClientGameState,
  type GameAction,
} from '@capitalloop/shared';
import { useState } from 'react';
import { ModalShell } from './ModalShell';

interface PropertyDeedModalProps {
  tileId: number;
  gameState: ClientGameState;
  myPlayerId: string;
  onAction: (action: GameAction) => Promise<boolean>;
  onClose: () => void;
}

export function PropertyDeedModal({
  tileId,
  gameState,
  myPlayerId,
  onAction,
  onClose,
}: PropertyDeedModalProps) {
  const [busy, setBusy] = useState(false);
  const tile = getTileById(gameState.settings.mapId, tileId);
  const prop = gameState.properties[tileId];
  const owner = prop?.ownerId ? gameState.players[prop.ownerId] : undefined;
  const me = gameState.players[myPlayerId];

  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayerId === myPlayerId;
  const isMyProp = Boolean(prop && prop.ownerId === myPlayerId);
  const isDebtorRaisingFunds =
    gameState.phase === 'DEBT_RESOLUTION' && gameState.pendingDebt?.debtorId === myPlayerId;
  const canManageNormal =
    isMyTurn && (gameState.phase === 'WAITING_FOR_ROLL' || gameState.phase === 'POST_ROLL_ACTIONS');

  const runAction = async (action: GameAction) => {
    setBusy(true);
    try {
      await onAction(action);
    } finally {
      setBusy(false);
    }
  };

  let bannerBg = 'var(--accent)';
  if (tile.type === 'STREET') {
    bannerBg = `var(--group-${tile.colorGroup})`;
  } else if (tile.type === 'TRANSIT') {
    bannerBg = '#334155';
  } else if (tile.type === 'UTILITY') {
    bannerBg = '#0284c7';
  } else if (tile.type === 'TAX') {
    bannerBg = '#be123c';
  }

  let ownsFullSet = false;
  let groupHasMortgaged = false;
  let groupHasBuildings = false;
  let canBuildEvenly = true;
  let canSellEvenly = true;

  if (tile.type === 'STREET' && prop && isMyProp) {
    const groupTiles = getColorGroupTiles(gameState.settings.mapId, tile.colorGroup);
    ownsFullSet = groupTiles.every((t) => gameState.properties[t.id]?.ownerId === myPlayerId);
    groupHasMortgaged = groupTiles.some((t) => gameState.properties[t.id]?.mortgaged === true);
    groupHasBuildings = groupTiles.some((t) => (gameState.properties[t.id]?.houses ?? 0) > 0);
    if (gameState.settings.evenBuilding) {
      const minH = Math.min(...groupTiles.map((t) => gameState.properties[t.id]?.houses ?? 0));
      const maxH = Math.max(...groupTiles.map((t) => gameState.properties[t.id]?.houses ?? 0));
      canBuildEvenly = prop.houses <= minH;
      canSellEvenly = prop.houses >= maxH;
    }
  }

  const nextBuildCost =
    tile.type === 'STREET' && prop
      ? prop.houses === MAX_HOUSES_BEFORE_HOTEL
        ? tile.hotelCost
        : tile.houseCost
      : 0;

  const canBuild =
    tile.type === 'STREET' &&
    Boolean(prop && me) &&
    isMyProp &&
    canManageNormal &&
    ownsFullSet &&
    !groupHasMortgaged &&
    (prop?.houses ?? 0) < HOTEL_LEVEL &&
    canBuildEvenly &&
    (me?.cash ?? 0) >= nextBuildCost;

  const canSell =
    tile.type === 'STREET' &&
    Boolean(prop) &&
    isMyProp &&
    (canManageNormal || isDebtorRaisingFunds) &&
    (prop?.houses ?? 0) > 0 &&
    canSellEvenly;

  const canMortgage =
    isPurchasableTile(tile) &&
    gameState.settings.mortgageEnabled &&
    Boolean(prop) &&
    isMyProp &&
    (canManageNormal || isDebtorRaisingFunds) &&
    !prop?.mortgaged &&
    !groupHasBuildings;

  const unmortgageCost = isPurchasableTile(tile)
    ? getUnmortgageCost(tile, gameState.settings.mortgageInterestPercent)
    : 0;

  const canUnmortgage =
    isPurchasableTile(tile) &&
    gameState.settings.mortgageEnabled &&
    Boolean(prop && me) &&
    isMyProp &&
    canManageNormal &&
    Boolean(prop?.mortgaged) &&
    (me?.cash ?? 0) >= unmortgageCost;

  return (
    <ModalShell title="Property Deed" subtitle={`Tile #${tile.id}`} onClose={onClose}>
      <div className="deed-banner" style={{ background: bannerBg }}>
        {tile.name}
      </div>

      {!isPurchasableTile(tile) ? (
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {tile.type === 'TAX'
            ? `Landing here assesses ${tile.name} ($${tile.flatAmount} flat or configured rule).`
            : tile.type === 'CHANCE'
              ? 'Draw a Surprise card and follow its instructions.'
              : tile.type === 'COMMUNITY'
                ? 'Draw a Treasury card and follow its instructions.'
                : `Special corner tile: ${tile.name}.`}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.86rem' }}>
            <span>
              Price: <strong>${tile.price}</strong>
            </span>
            <span>
              Owner:{' '}
              <strong style={{ color: owner?.color ?? 'var(--text-muted)' }}>
                {owner ? owner.nickname : 'Bank (Unowned)'}
              </strong>
            </span>
          </div>

          {prop?.mortgaged && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(225, 29, 72, 0.16)',
                color: '#fda4af',
                fontSize: '0.82rem',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              MORTGAGED — Collects $0 rent until redeemed for ${unmortgageCost}
            </div>
          )}

          {tile.type === 'STREET' && (
            <table className="deed-rent-table">
              <tbody>
                <tr>
                  <td>Base Rent</td>
                  <td>${tile.baseRent}</td>
                </tr>
                {gameState.settings.doubleRentOnColorSet && (
                  <tr>
                    <td>Full Color Set (Unimproved)</td>
                    <td>${tile.baseRent * 2}</td>
                  </tr>
                )}
                <tr>
                  <td>With 1 House</td>
                  <td>${tile.rent1House}</td>
                </tr>
                <tr>
                  <td>With 2 Houses</td>
                  <td>${tile.rent2Houses}</td>
                </tr>
                <tr>
                  <td>With 3 Houses</td>
                  <td>${tile.rent3Houses}</td>
                </tr>
                <tr>
                  <td>With 4 Houses</td>
                  <td>${tile.rent4Houses}</td>
                </tr>
                <tr>
                  <td>With Hotel</td>
                  <td>${tile.rentHotel}</td>
                </tr>
                <tr>
                  <td>House / Hotel Cost</td>
                  <td>
                    ${tile.houseCost} / ${tile.hotelCost}
                  </td>
                </tr>
                <tr>
                  <td>Mortgage Value</td>
                  <td>${tile.mortgageValue}</td>
                </tr>
              </tbody>
            </table>
          )}

          {tile.type === 'TRANSIT' && (
            <table className="deed-rent-table">
              <tbody>
                {TRANSIT_RENT_SCHEDULE.map((rent, idx) => (
                  <tr key={idx}>
                    <td>
                      {idx + 1} Transit Hub{idx > 0 ? 's' : ''} Owned
                    </td>
                    <td>${rent}</td>
                  </tr>
                ))}
                <tr>
                  <td>Mortgage Value</td>
                  <td>${tile.mortgageValue}</td>
                </tr>
              </tbody>
            </table>
          )}

          {tile.type === 'UTILITY' && (
            <table className="deed-rent-table">
              <tbody>
                <tr>
                  <td>1 Utility Owned</td>
                  <td>{UTILITY_MULTIPLIERS[0]}x Dice Roll</td>
                </tr>
                <tr>
                  <td>2 Utilities Owned</td>
                  <td>{UTILITY_MULTIPLIERS[1]}x Dice Roll</td>
                </tr>
                <tr>
                  <td>Mortgage Value</td>
                  <td>${tile.mortgageValue}</td>
                </tr>
              </tbody>
            </table>
          )}

          {isMyProp && (
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tile.type === 'STREET' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      disabled={!canBuild || busy}
                      onClick={() => void runAction({ type: 'BUILD_HOUSE', tileId: tile.id })}
                    >
                      {prop?.houses === MAX_HOUSES_BEFORE_HOTEL
                        ? `Build Hotel ($${tile.hotelCost})`
                        : `Build House ($${tile.houseCost})`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!canSell || busy}
                      onClick={() => void runAction({ type: 'SELL_HOUSE', tileId: tile.id })}
                    >
                      Sell Building (+${Math.floor(tile.houseCost / 2)})
                    </button>
                  </>
                )}
                {gameState.settings.mortgageEnabled && !prop?.mortgaged && (
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    disabled={!canMortgage || busy}
                    onClick={() => void runAction({ type: 'MORTGAGE_PROPERTY', tileId: tile.id })}
                  >
                    Mortgage (+${tile.mortgageValue})
                  </button>
                )}
                {gameState.settings.mortgageEnabled && prop?.mortgaged && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!canUnmortgage || busy}
                    onClick={() => void runAction({ type: 'UNMORTGAGE_PROPERTY', tileId: tile.id })}
                  >
                    Unmortgage (-${unmortgageCost})
                  </button>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}