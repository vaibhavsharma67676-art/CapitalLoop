import {
  isPurchasableTile,
  type BoardTile as BoardTileData,
  type PlayerGameState,
  type PropertyState,
} from '@capitalloop/shared';
import { BoltIcon, ChestIcon, PlaneIcon, WaterDropIcon } from '../assets/icons';
import { HouseIndicators } from './HouseIndicators';

export type BoardEdge = 'top' | 'right' | 'bottom' | 'left';

interface BoardTileProps {
  tile: BoardTileData;
  edge: BoardEdge;
  gridColumn: number;
  gridRow: number;
  propertyState?: PropertyState;
  owner?: PlayerGameState;
  onInspect: (tileId: number) => void;
}

export function BoardTile({
  tile,
  edge,
  gridColumn,
  gridRow,
  propertyState,
  owner,
  onInspect,
}: BoardTileProps) {
  const purchasable = isPurchasableTile(tile);
  const houses = propertyState?.houses ?? 0;
  const mortgaged = propertyState?.mortgaged ?? false;

  let stripBackground = 'rgba(139, 92, 246, 0.25)';
  if (owner) {
    stripBackground = owner.color;
  } else if (tile.type === 'STREET') {
    stripBackground = `var(--group-${tile.colorGroup})`;
  } else if (tile.type === 'TRANSIT') {
    stripBackground = '#475569';
  } else if (tile.type === 'UTILITY') {
    stripBackground = '#0ea5e9';
  } else if (tile.type === 'TAX') {
    stripBackground = '#be123c';
  }

  let emblemBackground = '#332b54';
  if (tile.type === 'STREET') {
    emblemBackground = `var(--group-${tile.colorGroup})`;
  } else if (tile.type === 'TRANSIT') {
    emblemBackground = '#334155';
  } else if (tile.type === 'UTILITY') {
    emblemBackground = tile.utilityKind === 'ELECTRIC' ? '#d97706' : '#0284c7';
  } else if (tile.type === 'TAX') {
    emblemBackground = '#9f1239';
  }

  return (
    <button
      type="button"
      className={`board-tile tile-edge-${edge} ${mortgaged ? 'mortgaged' : ''}`}
      style={{ gridColumn, gridRow }}
      onClick={() => onInspect(tile.id)}
      title={`${tile.name}${purchasable ? ` ($${tile.price})` : ''}`}
    >
      {/* Outer Color/Owner Strip */}
      {(purchasable || tile.type === 'TAX') && (
        <div className="tile-strip" style={{ background: stripBackground }}>
          {houses > 0 ? (
            <HouseIndicators houses={houses} />
          ) : purchasable ? (
            <span>${tile.price}</span>
          ) : (
            <span>${tile.flatAmount}</span>
          )}
        </div>
      )}

      {/* Center Tile Body */}
      <div className="tile-body">
        {tile.type === 'CHANCE' && (
          <>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f472b6', lineHeight: 1 }}>
              ?
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'COMMUNITY' && (
          <>
            <ChestIcon size={18} />
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'TRANSIT' && (
          <>
            <span className="tile-emblem" style={{ background: emblemBackground }}>
              <PlaneIcon size={12} />
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'UTILITY' && (
          <>
            <span className="tile-emblem" style={{ background: emblemBackground }}>
              {tile.utilityKind === 'ELECTRIC' ? (
                <BoltIcon size={12} />
              ) : (
                <WaterDropIcon size={12} />
              )}
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'TAX' && (
          <>
            <span className="tile-emblem" style={{ background: emblemBackground }}>
              %
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'STREET' && (
          <>
            <span className="tile-name">{tile.shortLabel}</span>
            <span className="tile-emblem" style={{ background: emblemBackground }}>
              {tile.badgeCode}
            </span>
          </>
        )}
      </div>

      {owner && (
        <div
          className="tile-owner-ribbon"
          style={{ borderColor: owner.color }}
          aria-hidden="true"
        />
      )}

      {mortgaged && <div className="tile-mortgaged-tag">MORT</div>}
    </button>
  );
}