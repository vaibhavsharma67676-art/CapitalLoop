import type { GameSessionController } from '../hooks/useGameSession';
import type { InfoModalTab } from '../modals/AboutLegalModal';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { JoinRedirectPage } from './JoinRedirectPage';

interface RoomRouterPageProps {
  session: GameSessionController;
  onOpenTheme: () => void;
  onOpenInfo: (tab?: InfoModalTab) => void;
}

export function RoomRouterPage({
  session,
  onOpenTheme,
  onOpenInfo,
}: RoomRouterPageProps) {
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
          onAddBot={session.addBot}
          onRemoveBot={session.removeBot}
          onUpdateBotDifficulty={session.updateBotDifficulty}
          onStartGame={session.startGame}
          onLeaveRoom={session.leaveRoom}
          onSendChat={session.sendChat}
          onOpenTheme={onOpenTheme}
          onOpenInfo={onOpenInfo}
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
        onOpenInfo={onOpenInfo}
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
        onOpenInfo={onOpenInfo}
      />
    );
  }

  return (
    <HomeScreen
      isConnected={session.isConnected}
      isBusy={session.isBusy}
      savedReconnectCreds={session.savedReconnectCreds}
      matchmakingStatus={session.matchmakingStatus}
      publicConfig={session.publicConfig}
      discordUser={session.discordUser}
      onCreateRoom={session.createPrivateRoom}
      onJoinRoom={session.joinPrivateRoom}
      onStartQuickMatch={session.startQuickMatch}
      onCancelQuickMatch={session.cancelQuickMatch}
      onReconnect={session.reconnectRoom}
      onDisconnectDiscord={session.disconnectDiscord}
      onOpenTheme={onOpenTheme}
      onOpenInfo={onOpenInfo}
    />
  );
}
