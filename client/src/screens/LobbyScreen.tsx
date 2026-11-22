import {
  BOT_DIFFICULTIES,
  MIN_PLAYERS,
  PLAYER_COLOR_PRESETS,
  TOKEN_SHAPES,
  type BotDifficulty,
  type PartialGameSettings,
  type PrivateRoomSnapshot,
  type TokenShapeId,
} from '@capitalloop/shared';
import { useState } from 'react';
import {
  CheckIcon,
  CopyIcon,
  CrownIcon,
  InfoIcon,
  LockIcon,
  PaletteIcon,
  RobotIcon,
  UnlockIcon,
} from '../assets/icons';
import { TokenGlyph } from '../assets/tokenShapes';
import { AudioControlPopover } from '../components/AudioControlPopover';
import { ChatPanel } from '../components/ChatPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import type { InfoModalTab } from '../modals/AboutLegalModal';

interface LobbyScreenProps {
  room: PrivateRoomSnapshot;
  myPlayerId: string;
  onSetReady: (isReady: boolean) => Promise<void>;
  onUpdateProfile: (updates: { color?: string; tokenShape?: TokenShapeId }) => Promise<void>;
  onUpdateSettings: (patch: PartialGameSettings) => Promise<void>;
  onToggleLock: (isLocked: boolean) => Promise<void>;
  onKickPlayer: (targetPlayerId: string) => Promise<void>;
  onAddBot: (difficulty: BotDifficulty, nickname?: string) => Promise<boolean>;
  onRemoveBot: (botId: string) => Promise<boolean>;
  onUpdateBotDifficulty: (botId: string, difficulty: BotDifficulty) => Promise<boolean>;
  onStartGame: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onSendChat: (text: string) => Promise<boolean>;
  onOpenTheme: () => void;
  onOpenInfo: (tab?: InfoModalTab) => void;
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
  onAddBot,
  onRemoveBot,
  onUpdateBotDifficulty,
  onStartGame,
  onLeaveRoom,
  onSendChat,
  onOpenTheme,
  onOpenInfo,
  onCopied,
}: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [newBotDifficulty, setNewBotDifficulty] = useState<BotDifficulty>('MEDIUM');
  const [addingBot, setAddingBot] = useState(false);

  const me = room.players.find((p) => p.id === myPlayerId);
  const isHost = room.hostId === myPlayerId;
  const inviteUrl = `${window.location.origin}/join/${room.roomCode}`;

  const usedColors = new Set(
    room.players.filter((p) => p.id !== myPlayerId).map((p) => p.color.toLowerCase()),
  );
  const usedTokens = new Set(
    room.players.filter((p) => p.id !== myPlayerId).map((p) => p.tokenShape),
  );

  const allGuestsReady = room.players
    .filter((p) => !p.isHost && !p.isBot)
    .every((p) => p.isReady);
  const canStart = isHost && room.players.length >= MIN_PLAYERS && allGuestsReady;
  const canAddMoreBots = isHost && room.players.length < room.settings.maxPlayers;

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

  const handleAddBot = async () => {
    if (!canAddMoreBots || addingBot) return;
    setAddingBot(true);
    try {
      await onAddBot(newBotDifficulty);
    } finally {
      setAddingBot(false);
    }
  };

  return (
    <div className="lobby-screen">
      <header className="panel-card lobby-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="brand-wordmark">
            CAPITAL<span>LOOP</span>
          </div>
          <span className="badge-pill">
            {room.isLocked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
            {room.visibility === 'PUBLIC_MATCH' ? 'Quick Match' : 'Private Lobby'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="icon-btn"
            title="Rules & About"
            onClick={() => onOpenInfo('rules')}
            aria-label="Rules and About"
          >
            <InfoIcon size={15} />
          </button>
          <button type="button" className="icon-btn" title="Customize Theme" onClick={onOpenTheme}>
            <PaletteIcon size={15} />
          </button>
          <AudioControlPopover />

          {isHost && room.visibility !== 'PUBLIC_MATCH' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void onToggleLock(!room.isLocked)}
            >
              {room.isLocked ? <UnlockIcon size={14} /> : <LockIcon size={14} />}
              {room.isLocked ? 'Unlock' : 'Lock'}
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
            Leave
          </button>
        </div>
      </header>

      <div className="lobby-grid">
        {/* Left Column: Invite, Players, AI Bots & Avatar Picker */}
        <section className="panel-card lobby-section">
          {room.visibility !== 'PUBLIC_MATCH' && (
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
          )}

          <div>
            <h3 className="section-heading" style={{ marginBottom: 10 }}>
              <span>
                Players ({room.players.length}/{room.settings.maxPlayers})
              </span>
              {room.players.length < MIN_PLAYERS && (
                <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>
                  Add friend or AI bot
                </span>
              )}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {room.players.map((player) => (
                <div key={player.id} className="lobby-player-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span className="player-avatar-dot" style={{ background: player.color }}>
                      <TokenGlyph shape={player.tokenShape} size={14} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {player.nickname}
                        </span>
                        {player.isHost && <CrownIcon size={13} style={{ color: '#facc15' }} />}
                        {player.isBot && (
                          <span className="bot-pill">
                            <RobotIcon size={11} />
                            AI
                          </span>
                        )}
                        {player.id === myPlayerId && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>(You)</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: player.isReady ? '#34d399' : 'var(--text-muted)' }}>
                        {player.isHost
                          ? 'Host'
                          : player.isBot
                            ? `${player.botDifficulty ?? 'MEDIUM'} AI • Ready`
                            : player.isReady
                              ? 'Ready'
                              : 'Not ready'}
                        {!player.isBot && !player.isConnected ? ' • Reconnecting...' : ''}
                      </div>
                    </div>
                  </div>

                  {isHost && player.isBot && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <select
                        className="select-field bot-diff-select"
                        aria-label={`Difficulty for ${player.nickname}`}
                        value={player.botDifficulty ?? 'MEDIUM'}
                        onChange={(e) =>
                          void onUpdateBotDifficulty(player.id, e.target.value as BotDifficulty)
                        }
                      >
                        {BOT_DIFFICULTIES.map((diff) => (
                          <option key={diff} value={diff}>
                            {diff.charAt(0) + diff.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        onClick={() => void onRemoveBot(player.id)}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {isHost && !player.isHost && !player.isBot && (
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

            {isHost && (
              <div className="lobby-add-bot-bar">
                <select
                  className="select-field"
                  style={{ flex: 1, padding: '7px 10px', fontSize: '0.82rem' }}
                  aria-label="New AI bot difficulty"
                  value={newBotDifficulty}
                  onChange={(e) => setNewBotDifficulty(e.target.value as BotDifficulty)}
                >
                  {BOT_DIFFICULTIES.map((diff) => (
                    <option key={diff} value={diff}>
                      {diff.charAt(0) + diff.slice(1).toLowerCase()} Bot
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!canAddMoreBots || addingBot}
                  onClick={() => void handleAddBot()}
                >
                  <RobotIcon size={14} />
                  + Add Bot
                </button>
              </div>
            )}
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

        {/* Right Column: Room Chat */}
        <div className="lobby-chat-wrap">
          <ChatPanel messages={room.chat} onSend={onSendChat} />
        </div>
      </div>
    </div>
  );
}
