import type { PlayerGameState } from '@capitalloop/shared';
import { TokenGlyph } from '../assets/tokenShapes';

interface PlayerTokenLayerProps {
  players: PlayerGameState[];
  currentPlayerId: string;
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

const CLUSTER_OFFSETS: readonly [number, number][] = [
  [-1.2, -1.2],
  [1.2, -1.2],
  [-1.2, 1.2],
  [1.2, 1.2],
  [0, -1.7],
  [0, 1.7],
  [-1.7, 0],
  [1.7, 0],
];

export function PlayerTokenLayer({ players, currentPlayerId }: PlayerTokenLayerProps) {
  const activePlayers = players.filter((p) => !p.isBankrupt);

  // Group players sharing the exact same tile so they spread cleanly
  const occupantsByTile = new Map<number, PlayerGameState[]>();
  for (const player of activePlayers) {
    const list = occupantsByTile.get(player.position) ?? [];
    list.push(player);
    occupantsByTile.set(player.position, list);
  }

  return (
    <div className="token-overlay-layer" aria-label="Player positions">
      {activePlayers.map((player) => {
        const { colIndex, rowIndex } = getTileGridCoords(player.position);
        const baseLeft = trackCenterPercent(colIndex);
        const baseTop = trackCenterPercent(rowIndex);

        const peers = occupantsByTile.get(player.position) ?? [player];
        const peerIndex = peers.findIndex((p) => p.id === player.id);
        const [dx, dy] =
          peers.length > 1
            ? (CLUSTER_OFFSETS[peerIndex % CLUSTER_OFFSETS.length] ?? [0, 0])
            : [0, 0];

        const isCurrent = player.id === currentPlayerId;

        return (
          <div
            key={player.id}
            className={`board-player-token ${isCurrent ? 'active-mover' : ''}`}
            style={{
              left: `${baseLeft + dx}%`,
              top: `${baseTop + dy}%`,
              background: player.color,
            }}
            title={`${player.nickname}${player.inJail ? ' (In Prison)' : ''}`}
          >
            <TokenGlyph shape={player.tokenShape} size={13} />
          </div>
        );
      })}
    </div>
  );
}