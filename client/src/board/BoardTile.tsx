import {
  isPurchasableTile,
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

function parseHexRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return `rgba(139, 92, 246, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function getContrastingTextColor(hex: string): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return '#ffffff';
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.62 ? '#120e1e' : '#ffffff';
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

  let stripBackground = 'rgba(139, 92, 246, 0.25)';
  let stripTextColor = '#ffffff';

  if (owner) {
    stripBackground = owner.color;
    stripTextColor = getContrastingTextColor(owner.color);
  } else if (tile.type === 'STREET') {
    stripBackground = `var(--group-${tile.colorGroup})`;
  } else if (tile.type === 'TRANSIT') {
    stripBackground = '#334155';
  } else if (tile.type === 'UTILITY') {
    stripBackground = tile.utilityKind === 'ELECTRIC' ? '#d97706' : '#0284c7';
  } else if (tile.type === 'TAX') {
    stripBackground = '#be123c';
  }

  const ownedTileStyle: CSSProperties = {
    gridColumn,
    gridRow,
    ...(owner
      ? {
          background: `linear-gradient(160deg, ${hexToRgba(owner.color, mortgaged ? 0.14 : 0.28)} 0%, ${hexToRgba(owner.color, mortgaged ? 0.08 : 0.16)} 100%), var(--bg-tile)`,
          borderColor: owner.color,
          boxShadow: mortgaged
            ? `inset 0 0 0 1.5px ${hexToRgba(owner.color, 0.65)}`
            : `inset 0 0 0 1.5px ${owner.color}, 0 0 10px ${hexToRgba(owner.color, 0.24)}`,
        }
      : {}),
  };

  const tooltipText =
    tile.type === 'STREET'
      ? `${tile.countryFlag} ${tile.name} (${tile.country}) — $${tile.price}${owner ? ` • Owned by ${owner.nickname}` : ' • Unowned'}${mortgaged ? ' [MORTGAGED]' : ''}`
      : purchasable
        ? `${tile.name} — $${tile.price}${owner ? ` • Owned by ${owner.nickname}` : ' • Unowned'}${mortgaged ? ' [MORTGAGED]' : ''}`
        : tile.name;

  return (
    <button
      type="button"
      data-tile-id={tile.id}
      className={`board-tile tile-edge-${edge} ${isOwned ? 'tile-owned' : ''} ${mortgaged ? 'mortgaged' : ''}`}
      style={ownedTileStyle}
      onClick={() => onInspect(tile.id)}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {/* Outer Strip: Owner Color when owned (with auto-contrast text), Country Group Color when unowned */}
      {(purchasable || tile.type === 'TAX') && (
        <div
          className="tile-strip"
          style={{
            background: stripBackground,
            color: stripTextColor,
            textShadow: stripTextColor === '#ffffff' ? '0 1px 2px rgba(0, 0, 0, 0.55)' : 'none',
          }}
        >
          {houses > 0 ? (
            <HouseIndicators houses={houses} />
          ) : purchasable ? (
            <span>${tile.price}</span>
          ) : (
            <span>${tile.flatAmount}</span>
          )}
        </div>
      )}

      {/* Inner Tile Body */}
      <div className="tile-body" data-tile-body={tile.id}>
        {tile.type === 'CHANCE' && (
          <>
            <span className="tile-special-glyph tile-chance-glyph">?</span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'COMMUNITY' && (
          <>
            <ChestIcon size={17} />
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'TRANSIT' && (
          <>
            <div className="tile-icon-row">
              <span className="tile-emblem tile-emblem-airport">
                <PlaneIcon size={11} />
              </span>
              <CountryFlag code={tile.countryCode} countryName={tile.country} size={15} />
            </div>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'UTILITY' && (
          <>
            <span
              className="tile-emblem"
              style={{
                background: tile.utilityKind === 'ELECTRIC' ? '#d97706' : '#0284c7',
              }}
            >
              {tile.utilityKind === 'ELECTRIC' ? (
                <SolarSunIcon size={12} />
              ) : (
                <WaterDropIcon size={12} />
              )}
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'TAX' && (
          <>
            <span className="tile-emblem" style={{ background: '#9f1239' }}>
              %
            </span>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}

        {tile.type === 'STREET' && (
          <>
            <div className="tile-country-header">
              <span
                className="tile-group-indicator"
                style={{ background: `var(--group-${tile.colorGroup})` }}
                title={`${tile.country} group`}
              />
              <CountryFlag code={tile.countryCode} countryName={tile.country} size={16} />
            </div>
            <span className="tile-name">{tile.shortLabel}</span>
          </>
        )}
      </div>

      {/* Clear Mortgage Indicator while keeping owner border & identity visible */}
      {mortgaged && (
        <div
          className="tile-mortgaged-tag"
          style={owner ? { borderColor: owner.color } : undefined}
        >
          <span>MORT</span>
        </div>
      )}
    </button>
  );
}
