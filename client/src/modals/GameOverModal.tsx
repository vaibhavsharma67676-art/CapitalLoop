import type { ClientGameState } from '@capitalloop/shared';
import { CrownIcon } from '../assets/icons';
import { ModalShell } from './ModalShell';

interface GameOverModalProps {
  gameState: ClientGameState;
  isHost: boolean;
  onReturnToLobby: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

export function GameOverModal({
  gameState,
  isHost,
  onReturnToLobby,
  onLeaveRoom,
}: GameOverModalProps) {
  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : undefined;

  return (
    <ModalShell title="Game Over" subtitle={`Completed in ${gameState.turnNumber} turns`} dismissible={false}>
      <div
        style={{
          padding: 18,
          borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(124, 77, 255, 0.24), rgba(16, 185, 129, 0.18))',
          border: '1px solid var(--border-strong)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <CrownIcon size={34} style={{ color: '#facc15' }} />
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Winner
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: winner?.color ?? '#ffffff' }}>
          {winner?.nickname ?? 'Champion'}
        </div>
      </div>

      <table className="deed-rent-table">
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
            <th style={{ textAlign: 'left', padding: 6 }}>#</th>
            <th style={{ textAlign: 'left', padding: 6 }}>Player</th>
            <th style={{ textAlign: 'right', padding: 6 }}>Properties</th>
            <th style={{ textAlign: 'right', padding: 6 }}>Net Worth</th>
          </tr>
        </thead>
        <tbody>
          {gameState.rankings.map((row) => (
            <tr key={row.playerId}>
              <td>#{row.rank}</td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="color-dot" style={{ background: row.color }} />
                  <strong>{row.nickname}</strong>
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>{row.propertiesOwned}</td>
              <td style={{ textAlign: 'right', color: row.isBankrupt ? '#fb7185' : '#34d399' }}>
                {row.isBankrupt ? 'Bankrupt' : `$${row.netWorth}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-secondary" onClick={() => void onLeaveRoom()}>
          Leave Room
        </button>
        {isHost ? (
          <button type="button" className="btn btn-primary" onClick={() => void onReturnToLobby()}>
            Return to Lobby (Rematch)
          </button>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Waiting for host to start a rematch...
          </span>
        )}
      </div>
    </ModalShell>
  );
}