import type { GameLogEntry, PlayerGameState } from '@capitalloop/shared';

interface ActivityLogProps {
  entries: GameLogEntry[];
  players: Record<string, PlayerGameState>;
}

export function ActivityLog({ entries, players }: ActivityLogProps) {
  const recent = [...entries].reverse().slice(0, 40);

  return (
    <div className="activity-log" aria-label="Game activity log">
      {recent.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
          Game activity will appear here.
        </div>
      ) : (
        recent.map((entry) => {
          const actor = entry.actorId ? players[entry.actorId] : undefined;
          return (
            <div key={entry.id} className="activity-log-entry">
              <span
                className="activity-dot"
                style={{ background: actor?.color ?? 'var(--accent)' }}
              />
              <span>{entry.message}</span>
            </div>
          );
        })
      )}
    </div>
  );
}