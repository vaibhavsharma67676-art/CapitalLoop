import type { CornerTile as CornerTileType } from '@capitalloop/shared';
import { PalmIcon, PrisonBarsIcon } from '../assets/icons';

interface CornerTileProps {
  tile: CornerTileType;
  gridColumn: number;
  gridRow: number;
  passStartBonus: number;
  vacationPot: number;
  vacationPotEnabled: boolean;
}

export function CornerTile({
  tile,
  gridColumn,
  gridRow,
  passStartBonus,
  vacationPot,
  vacationPotEnabled,
}: CornerTileProps) {
  const isStart = tile.type === 'START';

  return (
    <div
      data-tile-id={tile.id}
      className={`corner-tile ${isStart ? 'corner-start' : ''}`}
      style={{ gridColumn, gridRow }}
      title={tile.name}
    >
      {tile.type === 'START' && (
        <>
          <span className="corner-label">START</span>
          <span className="corner-arrow" aria-hidden="true">
            &raquo;
          </span>
          <span className="corner-sub">+${passStartBonus}</span>
        </>
      )}

      {tile.type === 'JAIL' && (
        <>
          <PrisonBarsIcon size={18} />
          <span className="corner-label">PRISON</span>
          <span className="corner-sub">Visiting</span>
        </>
      )}

      {tile.type === 'VACATION' && (
        <>
          <PalmIcon size={18} />
          <span className="corner-label">VACATION</span>
          {vacationPotEnabled ? (
            <span className="corner-vacation-pot">${vacationPot}</span>
          ) : (
            <span className="corner-sub">Free Rest</span>
          )}
        </>
      )}

      {tile.type === 'GO_TO_JAIL' && (
        <>
          <span className="corner-siren" aria-hidden="true">
            &#x1F6A8;
          </span>
          <span className="corner-label">GO TO</span>
          <span className="corner-sub">Prison</span>
        </>
      )}
    </div>
  );
}
