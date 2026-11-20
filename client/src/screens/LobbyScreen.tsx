import {
  MIN_PLAYERS,
  PLAYER_COLOR_PRESETS,
  TOKEN_SHAPES,
  type PartialGameSettings,
  type PrivateRoomSnapshot,
  type TokenShapeId,
} from '@capitalloop/shared';
import { useState } from 'react';
import {
  CheckIcon,
  CopyIcon,
  CrownIcon,
  LockIcon,
  PaletteIcon,
  UnlockIcon,
} from '../assets/icons';
import { TokenGlyph } from '../assets/tokenShapes';
import { ChatPanel } from '../components/ChatPanel';
import { SettingsPanel } from '../components/SettingsPanel';

interface LobbyScreenProps {
  room: PrivateRoomSnapshot;
  myPlayerId: string;
  onSetReady: (isReady: boolean) => Promise<void>;
  onUpdateProfile: (updates: { color?: string; tokenShape?: TokenShapeId }) => Promise<void>;
  onUpdateSettings: (patch: PartialGameSettings) => Promise<void>;
  onToggleLock: (isLocked: boolean) => Promise<void>;
  onKickPlayer: (targetPlayerId: string) => Promise<void>;
  onStartGame: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onSendChat: (text: string) => Promise<boolean>;
  onOpenTheme: () => void;
  onCopied: (label: string) => void;
}

export function LobbyScreen({
  room,
  myPlayerId,
  onSetReady,
  onUpdateProfile,
  onUpdateSettings,
  onToggleLock,
  onKickPlayer,
  onStartGame,
  onLeaveRoom,
  onSendChat,
  onOpenTheme,
  onCopied,
}: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);

  const me = room.players.find((p) => p.id === myPlayerId);
  const isHost = room.hostId === myPlayerId;
  const inviteUrl = `${window.location.origin}/join/${room.roomCode}`;

  const usedColors = new Set(
    room.players.filter((p) => p.id !== myPlayerId).map((p) => p.color.toLowerCase()),
  );
  const usedTokens = new Set(
    room.players.filter((p) => p.id !== myPlayerId).map((p) => p.tokenShape),
  );

  const allGuestsReady = room.players.filter((p) => !p.isHost).every((p) => p.isReady);
  const canStart = isHost && room.players.length >= MIN_PLAYERS && allGuestsReady;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      onCopied('Invite link copied to clipboard!');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied(`Room code: ${room.roomCode}`);
    }
  };

  return (
    <div className="lobby-screen">
      <header className="panel-card lobby-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-wordmark">
            CAPITAL<span>LOOP</span>
          </div>
          <span className="badge-pill">
            {room.isLocked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
            Private Lobby
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="icon-btn" title="Customize Theme" onClick={onOpenTheme}>
            <PaletteIcon size={16} />
          </button>

          {isHost && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void onToggleLock(!room.isLocked)}
            >
              {room.isLocked ? <UnlockIcon size={14} /> : <LockIcon size={14} />}
              {room.isLocked ? 'Unlock Room' : 'Lock Room'}
            </button>
          )}

          {isHost ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canStart}
              onClick={() => void onStartGame()}
            >
              Start Game ({room.players.length}/{room.settings.maxPlayers})
            </button>
          ) : (
            <button
              type="button"
              className={`btn btn-sm ${me?.isReady ? 'btn-success' : 'btn-primary'}`}
              onClick={() => void onSetReady(!me?.isReady)}
            >
              <CheckIcon size={15} />
              {me?.isReady ? 'Ready!' : 'Click Ready'}
            </button>
          )}

          <button type="button" className="btn btn-danger btn-sm" onClick={() => void onLeaveRoom()}>
            Leave Room
          </button>
        </div>
      </header>

      <div className="lobby-grid">
        {/* Left Column: Invite & Players & Avatar Picker */}
        <section className="panel-card lobby-section">
          <div className="invite-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                PRIVATE ROOM CODE
              </span>
              <span className="invite-code-big">{room.roomCode}</span>
            </div>
            <div className="invite-url-row">
              <span className="invite-url-text" title={inviteUrl}>
                {inviteUrl}
              </span>
              <button type="button" className="btn btn-primary btn-xs" onClick={() => void copyInvite()}>
                {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="section-heading" style={{ marginBottom: 10 }}>
              <span>
                Players ({room.players.length}/{room.settings.maxPlayers})
              </span>
              {room.players.length < MIN_PLAYERS && (
                <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>Need {MIN_PLAYERS}+ friends</span>
              )}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {room.players.map((player) => (
                <div key={player.id} className="lobby-player-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="player-avatar-dot" style={{ background: player.color }}>
                      <TokenGlyph shape={player.tokenShape} size={14} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>{player.nickname}</span>
                        {player.isHost && <CrownIcon size={13} style={{ color: '#facc15' }} />}
                        {player.id === myPlayerId && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>(You)</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: player.isReady ? '#34d399' : 'var(--text-muted)' }}>
                        {player.isHost ? 'Host' : player.isReady ? 'Ready' : 'Not ready'}
                        {!player.isConnected ? ' • Reconnecting...' : ''}
                      </div>
                    </div>
                  </div>

                  {isHost && !player.isHost && (
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => void onKickPlayer(player.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {me && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <div className="setting-label">Your Token Color</div>
              <div className="color-swatch-grid">
                {PLAYER_COLOR_PRESETS.map((preset) => {
                  const selected = me.color.toLowerCase() === preset.hex.toLowerCase();
                  const taken = usedColors.has(preset.hex.toLowerCase());
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`color-swatch ${selected ? 'selected' : ''} ${taken ? 'taken' : ''}`}
                      style={{ background: preset.hex }}
                      disabled={taken}
                      title={taken ? `${preset.name} (Taken)` : preset.name}
                      onClick={() => void onUpdateProfile({ color: preset.hex })}
                    />
                  );
                })}
              </div>

              <div className="setting-label">Your Token Shape</div>
              <div className="token-picker-grid">
                {TOKEN_SHAPES.map((shape) => {
                  const selected = me.tokenShape === shape;
                  const taken = usedTokens.has(shape);
                  return (
                    <button
                      key={shape}
                      type="button"
                      className={`token-picker-btn ${selected ? 'selected' : ''}`}
                      disabled={taken}
                      title={taken ? `${shape} (Taken)` : shape}
                      onClick={() => void onUpdateProfile({ tokenShape: shape })}
                    >
                      <TokenGlyph shape={shape} size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Center Column: Host-Controlled Game Settings */}
        <section className="panel-card lobby-section">
          <h3 className="section-heading">
            <span>Game Settings</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {isHost ? 'Host Controls Active' : 'View Only (Host edits)'}
            </span>
          </h3>
          <SettingsPanel
            settings={room.settings}
            editable={isHost}
            currentPlayerCount={room.players.length}
            onChange={(patch) => void onUpdateSettings(patch)}
          />
        </section>

        {/* Right Column: Private Room Chat */}
        <div style={{ height: 540, display: 'flex', flexDirection: 'column' }}>
          <ChatPanel messages={room.chat} onSend={onSendChat} />
        </div>
      </div>
    </div>
  );
}