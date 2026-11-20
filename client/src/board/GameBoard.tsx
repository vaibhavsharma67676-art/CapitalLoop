import {
  getBoardMap,
  type ClientGameState,
  type CornerTile as CornerTileType,
  type GameAction,
} from '@capitalloop/shared';
import { ActionBar } from '../components/ActionBar';
import { ActivityLog } from '../components/ActivityLog';
import { DiceRoller } from '../components/DiceRoller';
import { useCountdownSeconds } from '../hooks/useTurnTimer';
import { BoardTile, type BoardEdge } from './BoardTile';
import { CornerTile } from './CornerTile';
import { getTileGridCoords, PlayerTokenLayer } from './PlayerTokenLayer';

interface GameBoardProps {
  gameState: ClientGameState;
  myPlayerId: string;
  isRollingDice: boolean;
  onAction: (action: GameAction) => Promise<boolean>;
  onInspectTile: (tileId: number) => void;
  onOpenMortgage: () => void;
}

function getEdgeForTile(tileId: number): BoardEdge {
  if (tileId > 0 && tileId < 10) return 'top';
  if (tileId > 10 && tileId < 20) return 'right';
  if (tileId > 20 && tileId < 30) return 'bottom';
  return 'left';
}

export function GameBoard({
  gameState,
  myPlayerId,
  isRollingDice,
  onAction,
  onInspectTile,
  onOpenMortgage,
}: GameBoardProps) {
  const map = getBoardMap(gameState.settings.mapId);
  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? '';
  const currentPlayer = gameState.players[currentPlayerId];
  const remainingSeconds = useCountdownSeconds(gameState.turnDeadlineAt);
  const allPlayers = gameState.turnOrder
    .map((id) => gameState.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="board-square-wrapper">
      <div className="board-grid">
        {map.tiles.map((tile) => {
          const { colIndex, rowIndex } = getTileGridCoords(tile.id);
          const gridColumn = colIndex + 1;
          const gridRow = rowIndex + 1;

          if (
            tile.type === 'START' ||
            tile.type === 'JAIL' ||
            tile.type === 'VACATION' ||
            tile.type === 'GO_TO_JAIL'
          ) {
            return (
              <CornerTile
                key={tile.id}
                tile={tile as CornerTileType}
                gridColumn={gridColumn}
                gridRow={gridRow}
                passStartBonus={gameState.settings.passStartBonus}
                vacationPot={gameState.vacationPot}
                vacationPotEnabled={gameState.settings.vacationPotEnabled}
              />
            );
          }

          const propState = gameState.properties[tile.id];
          const owner = propState?.ownerId ? gameState.players[propState.ownerId] : undefined;

          return (
            <BoardTile
              key={tile.id}
              tile={tile}
              edge={getEdgeForTile(tile.id)}
              gridColumn={gridColumn}
              gridRow={gridRow}
              propertyState={propState}
              owner={owner}
              onInspect={onInspectTile}
            />
          );
        })}

        {/* Center Board Area (Richup-Style Dice, Primary Action & Activity Log) */}
        <div className="board-center">
          <div className="center-turn-header">
            <div className="turn-pill">
              <span
                className="color-dot"
                style={{ background: currentPlayer?.color ?? 'var(--accent)' }}
              />
              <span>
                {currentPlayerId === myPlayerId
                  ? 'Your Turn'
                  : `${currentPlayer?.nickname ?? 'Player'}'s Turn`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge-pill">Turn #{gameState.turnNumber}</span>
              {remainingSeconds !== null && (
                <span className={`timer-pill ${remainingSeconds <= 10 ? 'urgent' : ''}`}>
                  {remainingSeconds}s
                </span>
              )}
            </div>
          </div>

          <div className="center-dice-stage">
            <DiceRoller
              die1={gameState.lastDiceRoll?.die1 ?? 5}
              die2={gameState.lastDiceRoll?.die2 ?? 6}
              isRolling={isRollingDice}
              isDoubles={gameState.lastDiceRoll?.isDoubles ?? false}
            />

            <ActionBar
              gameState={gameState}
              myPlayerId={myPlayerId}
              onAction={onAction}
              onOpenMortgage={onOpenMortgage}
            />
          </div>

          <div className="center-log-box">
            <ActivityLog entries={gameState.log} players={gameState.players} />
          </div>
        </div>
      </div>

      <PlayerTokenLayer players={allPlayers} currentPlayerId={currentPlayerId} />
    </div>
  );
}