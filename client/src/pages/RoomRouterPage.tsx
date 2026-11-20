import type { GameSessionController } from '../hooks/useGameSession';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { JoinRedirectPage } from './JoinRedirectPage';

interface RoomRouterPageProps {
  session: GameSessionController;
  onOpenTheme: () => void;
}

export function RoomRouterPage({ session, onOpenTheme }: RoomRouterPageProps) {
  const { room, credentials } = session;

  if (room && credentials) {
    if (room.status === 'LOBBY' || !room.gameState) {
      return (
        <LobbyScreen
          room={room}
          myPlayerId={credentials.playerId}
          onSetReady={session.setReady}
          onUpdateProfile={session.updateProfile}
          onUpdateSettings={session.updateSettings}
          onToggleLock={session.toggleLock}
          onKickPlayer={session.kickPlayer}
          onStartGame={session.startGame}
          onLeaveRoom={session.leaveRoom}
          onSendChat={session.sendChat}
          onOpenTheme={onOpenTheme}
          onCopied={(label) => session.pushToast('success', label)}
        />
      );
    }

    return (
      <GameScreen
        room={room}
        gameState={room.gameState}
        myPlayerId={credentials.playerId}
        isRollingDice={session.isRollingDice}
        onAction={session.sendGameAction}
        onSendChat={session.sendChat}
        onReturnToLobby={session.returnToLobby}
        onLeaveRoom={session.leaveRoom}
        onOpenTheme={onOpenTheme}
        onCopied={(label) => session.pushToast('success', label)}
      />
    );
  }

  const joinMatch = window.location.pathname.match(/^\/(?:join|room)\/([A-Za-z0-9]{5})$/i);
  if (joinMatch && joinMatch[1]) {
    return (
      <JoinRedirectPage
        roomCode={joinMatch[1].toUpperCase()}
        session={session}
        onOpenTheme={onOpenTheme}
      />
    );
  }

  return (
    <HomeScreen
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