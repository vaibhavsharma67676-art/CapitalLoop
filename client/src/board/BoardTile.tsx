import {
  isPurchasableTile,
  HOTEL_LEVEL,
  type BoardTile as BoardTileData,
  type PlayerGameState,
  type PropertyState,
} from '@capitalloop/shared';
import type { CSSProperties } from 'react';
import { CountryFlag } from '../assets/countryFlags';
import { ChestIcon, PlaneIcon, SolarSunIcon, WaterDropIcon } from '../assets/icons';
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
  const isOwned = Boolean(owner);

  const tileStyle: CSSProperties = {
    gridColumn,
    gridRow,
  };

  const buildingLabel =
    houses >= HOTEL_LEVEL
      ? ' • Hotel'
      : houses > 0
        ? ` • ${houses} house${houses > 1 ? 's' : ''}`
        : '';

  const tooltipText =
    tile.type === 'STREET'
      ? `${tile.name} (${tile.country}) — $${tile.price}${owner ? ` • Owned by ${owner.nickname}` : ' • Unowned'}${buildingLabel}${mortgaged ? ' [MORTGAGED]' : ''}`
      : purchasable
        ? `${tile.name} — $${tile.price}${owner ? ` • Owned by ${owner.nickname}` : ' • Unowned'}${mortgaged ? ' [MORTGAGED]' : ''}`
        : tile.name;

  return (
    <button
      type="button"
      data-tile-id={tile.id}
      className={`board-tile tile-edge-${edge} ${isOwned ? 'tile-owned' : ''} ${mortgaged ? 'mortgaged' : ''}`}
      style={tileStyle}
      onClick={() => onInspect(tile.id)}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {/* Top Frosted Meta Bar: Shows Progressive Houses/Hotel when built, otherwise Price/Tax */}
      {(purchasable || tile.type === 'TAX') && (
        <div className="tile-meta-bar">
          {houses > 0 ? (
            <HouseIndicators houses={houses} />
          ) : purchasable ? (
            <span className="tile-price">${tile.price}</span>
          ) : (
            <span className="tile-price">${tile.flatAmount}</span>
          )}
        </div>
      )}

      {/* Inner Unified Glass Tile Body */}
      <div className="tile-body" data-tile-body={tile.id}>
        {tile.type === 'CHANCE' && (
          <>
            <span className="tile-special-glyph tile-chance-glyph">?</span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'COMMUNITY' && (
          <>
            <ChestIcon size={15} className="tile-chest-svg" />
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'TRANSIT' && (
          <>
            <div className="tile-flag-title-row">
              <CountryFlag
                code={tile.countryCode}
                countryName={tile.country}
                size={13}
                className="country-flag-svg tile-flag"
              />
              <span className="tile-glass-icon-badge" aria-hidden="true">
                <PlaneIcon size={9} />
              </span>
            </div>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'UTILITY' && (
          <>
            <span className="tile-glass-icon-badge tile-utility-badge" aria-hidden="true">
              {tile.utilityKind === 'ELECTRIC' ? (
                <SolarSunIcon size={11} />
              ) : (
                <WaterDropIcon size={11} />
              )}
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'TAX' && (
          <>
            <span className="tile-glass-icon-badge tile-tax-badge" aria-hidden="true">
              %
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'STREET' && (
          <div className="tile-street-content">
            <CountryFlag
              code={tile.countryCode}
              countryName={tile.country}
              size={14}
              className="country-flag-svg tile-flag"
            />
            <span className="tile-name">{tile.shortLabel}</span>
          </div>
        )}
      </div>

      {/* Mortgage Status Tag */}
      {mortgaged && (
        <div className="tile-mortgaged-tag" aria-label="Mortgaged">
          <span>MORT</span>
        </div>
      )}

      {/* Bottom-Edge Player Ownership Indicator ONLY — Glass Tile Background Remains Untouched */}
      {owner && (
        <span
          className="tile-owner-indicator"
          style={{
            backgroundColor: owner.color,
            boxShadow: `0 0 8px ${owner.color}`,
          }}
          aria-label={`Owned by ${owner.nickname}`}
        />
      )}
    </button>
  );
}
