import type { PlayerGameState } from '@capitalloop/shared';
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { TokenGlyph } from '../assets/tokenShapes';

interface PlayerTokenLayerProps {
  players: PlayerGameState[];
  currentPlayerId: string;
  boardGridRef: RefObject<HTMLDivElement | null>;
}

interface TileCenterMetric {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOTAL_GRID_UNITS = 11.9; // 1.45 + 9 * 1 + 1.45

function trackCenterPercent(trackIndexZeroBased: number): number {
  if (trackIndexZeroBased === 0) {
    return (0.725 / TOTAL_GRID_UNITS) * 100;
  }
  if (trackIndexZeroBased === 10) {
    return (11.175 / TOTAL_GRID_UNITS) * 100;
  }
  return ((0.95 + trackIndexZeroBased) / TOTAL_GRID_UNITS) * 100;
}

export function getTileGridCoords(tileId: number): { colIndex: number; rowIndex: number } {
  if (tileId >= 0 && tileId <= 10) {
    return { colIndex: tileId, rowIndex: 0 };
  }
  if (tileId >= 11 && tileId <= 20) {
    return { colIndex: 10, rowIndex: tileId - 10 };
  }
  if (tileId >= 21 && tileId <= 30) {
    return { colIndex: 30 - tileId, rowIndex: 10 };
  }
  return { colIndex: 0, rowIndex: 40 - tileId };
}

/**
 * Arranges multiple players occupying the same tile in a compact, balanced circular formation
 * inside the exact center of the tile so tokens remain inside tile bounds and avoid heavy overlap.
 */
function getFormationOffsetPx(
  peerIndex: number,
  peerCount: number,
  tileWidth: number,
  tileHeight: number,
): [number, number] {
  if (peerCount <= 1) {
    return [0, 0];
  }

  const maxRadius = Math.max(5, Math.min(tileWidth, tileHeight) * 0.24);
  if (peerCount === 2) {
    const spread = Math.min(maxRadius, tileWidth * 0.2);
    return peerIndex === 0 ? [-spread, 0] : [spread, 0];
  }

  const angle = -Math.PI / 2 + (2 * Math.PI * peerIndex) / peerCount;
  const rx = Math.min(maxRadius, tileWidth * 0.26);
  const ry = Math.min(maxRadius, tileHeight * 0.26);
  return [Math.cos(angle) * rx, Math.sin(angle) * ry];
}

export function PlayerTokenLayer({
  players,
  currentPlayerId,
  boardGridRef,
}: PlayerTokenLayerProps) {
  const [tileCenters, setTileCenters] = useState<Record<number, TileCenterMetric>>({});

  const measureTiles = useCallback(() => {
    const gridEl = boardGridRef.current;
    if (!gridEl) return;

    const gridRect = gridEl.getBoundingClientRect();
    if (gridRect.width === 0 || gridRect.height === 0) return;

    const nextMetrics: Record<number, TileCenterMetric> = {};
    const tileNodes = gridEl.querySelectorAll<HTMLElement>('[data-tile-id]');

    tileNodes.forEach((tileEl) => {
      const idRaw = tileEl.getAttribute('data-tile-id');
      if (!idRaw) return;
      const tileId = Number.parseInt(idRaw, 10);
      if (Number.isNaN(tileId)) return;

      // Measure the inner tile body when present so tokens center inside the playable
      // tile surface rather than overlapping the outer price/house bar.
      const bodyEl = tileEl.querySelector<HTMLElement>('[data-tile-body]') ?? tileEl;
      const rect = bodyEl.getBoundingClientRect();

      nextMetrics[tileId] = {
        x: rect.left - gridRect.left + rect.width / 2,
        y: rect.top - gridRect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    });

    setTileCenters(nextMetrics);
  }, [boardGridRef]);

  useLayoutEffect(() => {
    measureTiles();
  }, [measureTiles]);

  useEffect(() => {
    const gridEl = boardGridRef.current;
    if (!gridEl) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measureTiles);
    };

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(gridEl);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
    };
  }, [boardGridRef, measureTiles]);

  const activePlayers = players.filter((p) => !p.isBankrupt);

  const occupantsByTile = new Map<number, PlayerGameState[]>();
  for (const player of activePlayers) {
    const list = occupantsByTile.get(player.position) ?? [];
    list.push(player);
    occupantsByTile.set(player.position, list);
  }

  return (
    <div className="token-overlay-layer" aria-label="Player positions">
      {activePlayers.map((player) => {
        const peers = occupantsByTile.get(player.position) ?? [player];
        const peerIndex = peers.findIndex((p) => p.id === player.id);
        const isCurrent = player.id === currentPlayerId;
        const metric = tileCenters[player.position];

        if (metric) {
          const [dx, dy] = getFormationOffsetPx(
            peerIndex,
            peers.length,
            metric.width,
            metric.height,
          );

          return (
            <div
              key={player.id}
              className={`board-player-token ${isCurrent ? 'active-mover' : ''} ${peers.length > 2 ? 'compact-token' : ''}`}
              style={{
                transform: `translate3d(${metric.x + dx}px, ${metric.y + dy}px, 0) translate(-50%, -50%)`,
                background: player.color,
              }}
              title={`${player.nickname}${player.inJail ? ' (In Prison)' : ''}`}
            >
              <TokenGlyph shape={player.tokenShape} size={peers.length > 2 ? 10 : 12} />
            </div>
          );
        }

        // Instant grid-based fallback before initial ResizeObserver pass
        const { colIndex, rowIndex } = getTileGridCoords(player.position);
        const baseLeft = trackCenterPercent(colIndex);
        const baseTop = trackCenterPercent(rowIndex);

        return (
          <div
            key={player.id}
            className={`board-player-token fallback-pos ${isCurrent ? 'active-mover' : ''}`}
            style={{
              left: `${baseLeft}%`,
              top: `${baseTop}%`,
              background: player.color,
            }}
            title={`${player.nickname}${player.inJail ? ' (In Prison)' : ''}`}
          >
            <TokenGlyph shape={player.tokenShape} size={12} />
          </div>
        );
      })}
    </div>
  );
}
