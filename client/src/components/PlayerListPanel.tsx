import type { ClientGameState } from '@capitalloop/shared';
import { CrownIcon } from '../assets/icons';
import { TokenGlyph } from '../assets/tokenShapes';

interface PlayerListPanelProps {
  gameState: ClientGameState;
  hostId: string;
  myPlayerId: string;
  onQuickTrade: (targetPlayerId: string) => void;
}

export function PlayerListPanel({
  gameState,
  hostId,
  myPlayerId,
  onQuickTrade,
}: PlayerListPanelProps) {
  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex];

  return (
    <div className="panel-card players-panel">
      <div className="section-heading" style={{ marginBottom: 2 }}>
        <span>Players ({gameState.turnOrder.length})</span>
      </div>

      {gameState.turnOrder.map((playerId) => {
        const player = gameState.players[playerId];
        if (!player) return null;

        const isCurrent = playerId === currentPlayerId && gameState.phase !== 'GAME_OVER';
        const isMe = playerId === myPlayerId;
        const canTradeWith =
          !isMe &&
          !player.isBankrupt &&
          gameState.settings.tradingEnabled &&
          !gameState.players[myPlayerId]?.isBankrupt &&
          gameState.phase !== 'GAME_OVER';

        return (
          <div
            key={player.id}
            className={`player-card-row ${isCurrent ? 'active-turn' : ''} ${player.isBankrupt ? 'bankrupt' : ''}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span className="player-avatar-dot" style={{ background: player.color }}>
                <TokenGlyph shape={player.tokenShape} size={14} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: 700,
                    fontSize: '0.82rem',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.nickname}
                  </span>
                  {player.id === hostId && <CrownIcon size={12} style={{ color: '#facc15' }} />}
                  {isMe && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent)' }}>(You)</span>
                  )}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                  {player.isBankrupt ? (
                    <span style={{ color: '#fb7185' }}>Bankrupt</span>
                  ) : (
                    <>
                      {player.inJail && <span style={{ color: '#fbbf24' }}>In Prison</span>}
                      {!player.isConnected && <span style={{ color: '#f87171' }}>Offline</span>}
                      {player.jailFreeCards > 0 && <span>Card x{player.jailFreeCards}</span>}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span className="player-cash-badge">${player.cash}</span>
              {canTradeWith && (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => onQuickTrade(player.id)}
                  title={`Trade with ${player.nickname}`}
                >
                  Trade
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}