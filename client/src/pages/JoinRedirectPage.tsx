import { useEffect, useState } from 'react';
import type { GameSessionController } from '../hooks/useGameSession';
import { HomeScreen } from '../screens/HomeScreen';

interface JoinRedirectPageProps {
  roomCode: string;
  session: GameSessionController;
  onOpenTheme: () => void;
}

export function JoinRedirectPage({
  roomCode,
  session,
  onOpenTheme,
}: JoinRedirectPageProps) {
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const normalized = roomCode.trim().toUpperCase();
    fetch(`/api/rooms/${encodeURIComponent(normalized)}/validate`)
      .then((res) => res.json() as Promise<{ exists: boolean; joinable: boolean; reason?: string }>)
      .then((data) => {
        if (!active) return;
        if (!data.joinable && data.reason) {
          setInviteNote(data.reason);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [roomCode]);

  useEffect(() => {
    if (inviteNote) {
      session.pushToast('warning', inviteNote);
    }
  }, [inviteNote, session]);

  return (
    <HomeScreen
      initialJoinCode={roomCode}
      isConnected={session.isConnected}
      isBusy={session.isBusy}
      savedReconnectCreds={session.savedReconnectCreds}
      onCreateRoom={session.createPrivateRoom}
      onJoinRoom={session.joinPrivateRoom}
      onReconnect={session.reconnectRoom}
      onOpenTheme={onOpenTheme}
    />
  );
}