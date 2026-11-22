import {
  BOT_DIFFICULTIES,
  getAllBoardMaps,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  type BotDifficulty,
  type DiscordUserProfile,
  type GameSpeed,
  type MapId,
  type MatchmakingPreferences,
  type MatchmakingStatusPayload,
  type RoomSessionCredentials,
} from '@capitalloop/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  BrandDiceIcon,
  ChestIcon,
  DiscordIcon,
  GlobeIcon,
  InfoIcon,
  LockIcon,
  PaletteIcon,
  RobotIcon,
} from '../assets/icons';
import { AudioControlPopover } from '../components/AudioControlPopover';
import type { InfoModalTab } from '../modals/AboutLegalModal';
import type { PublicAppConfig } from '../services/publicConfigService';
import { loadNickname } from '../services/sessionStorage';

type HomeModeTab = 'friends' | 'match' | 'bots';

interface HomeScreenProps {
  initialJoinCode?: string;
  isConnected: boolean;
  isBusy: boolean;
  savedReconnectCreds: RoomSessionCredentials | null;
  matchmakingStatus: MatchmakingStatusPayload | null;
  publicConfig: PublicAppConfig;
  discordUser: DiscordUserProfile | null;
  onCreateRoom: (
    nickname: string,
    options?: { bots?: Array<{ difficulty: BotDifficulty; nickname?: string }> },
  ) => Promise<boolean>;
  onJoinRoom: (roomCode: string, nickname: string) => Promise<boolean>;
  onStartQuickMatch: (prefs: MatchmakingPreferences) => Promise<boolean>;
  onCancelQuickMatch: () => Promise<void>;
  onReconnect: (creds: RoomSessionCredentials) => Promise<boolean>;
  onDisconnectDiscord: () => Promise<void>;
  onOpenTheme: () => void;
  onOpenInfo: (tab?: InfoModalTab) => void;
}

export function HomeScreen({
  initialJoinCode = '',
  isConnected,
  isBusy,
  savedReconnectCreds,
  matchmakingStatus,
  publicConfig,
  discordUser,
  onCreateRoom,
  onJoinRoom,
  onStartQuickMatch,
  onCancelQuickMatch,
  onReconnect,
  onDisconnectDiscord,
  onOpenTheme,
  onOpenInfo,
}: HomeScreenProps) {
  const [mode, setMode] = useState<HomeModeTab>('friends');
  const [nickname, setNickname] = useState<string>(() => loadNickname());
  const [roomCode, setRoomCode] = useState<string>(initialJoinCode.toUpperCase());

  // Quick Match preferences
  const [matchMapId, setMatchMapId] = useState<MapId>('classic-metro');
  const [matchSpeed, setMatchSpeed] = useState<GameSpeed>('NORMAL');
  const [matchTargetPlayers, setMatchTargetPlayers] = useState<number>(2);

  // Play With Bots setup
  const [botCount, setBotCount] = useState<number>(1);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('MEDIUM');

  // Auto-fill nickname from Discord only once per Discord login so user can freely edit/clear it
  const discordAutofilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!discordUser) {
      discordAutofilledRef.current = null;
      return;
    }
    if (discordAutofilledRef.current === discordUser.id) return;
    discordAutofilledRef.current = discordUser.id;
    const candidate = (discordUser.globalName || discordUser.username)
      .replace(/[<>]/g, '')
      .slice(0, NICKNAME_MAX_LENGTH);
    if (candidate.length >= NICKNAME_MIN_LENGTH) {
      setNickname((prev) => (prev.trim() ? prev : candidate));
    }
  }, [discordUser]);

  const maps = getAllBoardMaps();
  const validNickname =
    nickname.trim().length >= NICKNAME_MIN_LENGTH && nickname.trim().length <= NICKNAME_MAX_LENGTH;
  const validCode = roomCode.trim().length === ROOM_CODE_LENGTH;
  const isSearching = matchmakingStatus?.status === 'SEARCHING';

  const handleCreatePrivate = async () => {
    if (!validNickname || isBusy) return;
    await onCreateRoom(nickname.trim());
  };

  const handleCreateWithBots = async () => {
    if (!validNickname || isBusy) return;
    const bots = Array.from({ length: botCount }).map(() => ({ difficulty: botDifficulty }));
    await onCreateRoom(nickname.trim(), { bots });
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validNickname || !validCode || isBusy) return;
    await onJoinRoom(roomCode.trim().toUpperCase(), nickname.trim());
  };

  const handleStartMatch = async () => {
    if (!validNickname || isBusy || isSearching) return;
    await onStartQuickMatch({
      nickname: nickname.trim(),
      mapId: matchMapId,
      gameSpeed: matchSpeed,
      targetPlayers: matchTargetPlayers,
    });
  };

  return (
    <div className="home-screen">
      <div className="home-topbar">
        <span
          className="badge-pill"
          style={{
            background: isConnected ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
            color: isConnected ? '#34d399' : '#fbbf24',
          }}
        >
          {isConnected ? 'Online' : 'Connecting...'}
        </span>
        <button
          type="button"
          className="icon-btn"
          title="About, Rules & Legal"
          onClick={() => onOpenInfo('about')}
          aria-label="About and Rules"
        >
          <InfoIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Customize Theme"
          onClick={onOpenTheme}
          aria-label="Customize Theme"
        >
          <PaletteIcon size={16} />
        </button>
        <AudioControlPopover />
      </div>

      <div className="home-hero">
        <BrandDiceIcon className="home-brand-dice" size={64} />
        <h1 className="home-title">
          CAPITAL<span>LOOP</span>
        </h1>
        <p className="home-subtitle">
          Play with friends, match online, or challenge fair AI opponents
        </p>

        <div className="panel-card home-card">
          {savedReconnectCreds && (
            <button
              type="button"
              className="btn btn-success"
              disabled={isBusy || !isConnected}
              onClick={() => void onReconnect(savedReconnectCreds)}
            >
              Reconnect to Room {savedReconnectCreds.roomCode}
            </button>
          )}

          {/* Shared Nickname Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="setting-label" htmlFor="home-nickname">
              Your Nickname
            </label>
            <input
              id="home-nickname"
              type="text"
              className="input-field"
              placeholder="Enter nickname (2–18 chars)"
              maxLength={NICKNAME_MAX_LENGTH}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          {/* 3-Mode Portrait Selector */}
          <div className="home-mode-tabs" role="tablist" aria-label="Play modes">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'friends'}
              className={`home-mode-tab ${mode === 'friends' ? 'active' : ''}`}
              onClick={() => setMode('friends')}
            >
              <LockIcon size={14} />
              <span>Friends</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'match'}
              className={`home-mode-tab ${mode === 'match' ? 'active' : ''}`}
              onClick={() => setMode('match')}
            >
              <GlobeIcon size={14} />
              <span>Quick Match</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'bots'}
              className={`home-mode-tab ${mode === 'bots' ? 'active' : ''}`}
              onClick={() => setMode('bots')}
            >
              <RobotIcon size={14} />
              <span>vs Bots</span>
            </button>
          </div>

          {/* MODE A: PLAY WITH FRIENDS */}
          {mode === 'friends' && (
            <div className="home-mode-panel">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={!validNickname || isBusy || !isConnected}
                onClick={() => void handleCreatePrivate()}
              >
                <LockIcon size={17} />
                Create Private Room
              </button>

              <div className="home-divider">or join with invite code</div>

              <form className="join-row" onSubmit={(e) => void handleJoinSubmit(e)}>
                <input
                  type="text"
                  className="input-field code-input"
                  placeholder="5-CHAR"
                  maxLength={ROOM_CODE_LENGTH}
                  value={roomCode}
                  onChange={(e) =>
                    setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  aria-label="5-character private room code"
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  style={{ whiteSpace: 'nowrap' }}
                  disabled={!validNickname || !validCode || isBusy || !isConnected}
                >
                  Join
                </button>
              </form>
            </div>
          )}

          {/* MODE B: PLAY WITH RANDOM PLAYERS */}
          {mode === 'match' && (
            <div className="home-mode-panel">
              {!publicConfig.matchmakingEnabled ? (
                <div className="home-private-banner">
                  Public Quick Match is currently disabled on this server.
                </div>
              ) : isSearching && matchmakingStatus ? (
                <div className="matchmaking-status-card">
                  <div className="matchmaking-spinner" aria-hidden="true" />
                  <div style={{ fontWeight: 800, fontSize: '0.94rem' }}>
                    Searching for players...
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Found {matchmakingStatus.queueSize} / {matchmakingStatus.targetPlayers} players •{' '}
                    {matchmakingStatus.gameSpeed === 'FAST' ? 'Fast' : 'Normal'} speed
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void onCancelQuickMatch()}
                  >
                    Cancel Search
                  </button>
                </div>
              ) : (
                <>
                  <div className="home-compact-grid">
                    <div>
                      <label className="setting-label" htmlFor="mm-map">
                        Map
                      </label>
                      <select
                        id="mm-map"
                        className="select-field"
                        value={matchMapId}
                        onChange={(e) => setMatchMapId(e.target.value as MapId)}
                      >
                        {maps.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="setting-label" htmlFor="mm-players">
                        Players
                      </label>
                      <select
                        id="mm-players"
                        className="select-field"
                        value={matchTargetPlayers}
                        onChange={(e) => setMatchTargetPlayers(Number(e.target.value))}
                      >
                        <option value={2}>2 Players</option>
                        <option value={3}>3 Players</option>
                        <option value={4}>4 Players</option>
                      </select>
                    </div>
                    <div>
                      <label className="setting-label" htmlFor="mm-speed">
                        Speed
                      </label>
                      <select
                        id="mm-speed"
                        className="select-field"
                        value={matchSpeed}
                        onChange={(e) => setMatchSpeed(e.target.value as GameSpeed)}
                      >
                        <option value="NORMAL">Normal</option>
                        <option value="FAST">Fast</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    disabled={!validNickname || isBusy || !isConnected}
                    onClick={() => void handleStartMatch()}
                  >
                    <GlobeIcon size={17} />
                    Find Quick Match
                  </button>
                </>
              )}
            </div>
          )}

          {/* MODE C: PLAY WITH BOTS */}
          {mode === 'bots' && (
            <div className="home-mode-panel">
              <div className="home-compact-grid two-col">
                <div>
                  <label className="setting-label" htmlFor="bot-count">
                    AI Opponents
                  </label>
                  <select
                    id="bot-count"
                    className="select-field"
                    value={botCount}
                    onChange={(e) => setBotCount(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} AI Bot{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="setting-label" htmlFor="bot-diff">
                    Difficulty
                  </label>
                  <select
                    id="bot-diff"
                    className="select-field"
                    value={botDifficulty}
                    onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                  >
                    {BOT_DIFFICULTIES.map((diff) => (
                      <option key={diff} value={diff}>
                        {diff.charAt(0) + diff.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="home-mode-note">
                Fair AI bots follow identical rules and random dice. You can customize settings or
                invite friends in the lobby before starting.
              </p>

              <button
                type="button"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={!validNickname || isBusy || !isConnected}
                onClick={() => void handleCreateWithBots()}
              >
                <RobotIcon size={17} />
                Create Bot Match
              </button>
            </div>
          )}

          {/* Optional Discord Login & Community Strip */}
          {(publicConfig.discord.oauthEnabled ||
            publicConfig.discord.communityEnabled ||
            discordUser) && (
            <div className="home-discord-row">
              {discordUser ? (
                <div className="discord-connected-pill">
                  {discordUser.avatarUrl && (
                    <img
                      src={discordUser.avatarUrl}
                      alt=""
                      className="discord-avatar-img"
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {discordUser.globalName || discordUser.username}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => void onDisconnectDiscord()}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                publicConfig.discord.oauthEnabled && (
                  <a href="/api/auth/discord/login" className="btn btn-discord btn-sm">
                    <DiscordIcon size={15} />
                    Connect Discord
                  </a>
                )
              )}

              {publicConfig.discord.inviteUrl && (
                <a
                  href={publicConfig.discord.inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <DiscordIcon size={15} />
                  Community
                </a>
              )}
            </div>
          )}
        </div>

        {/* Official CAPITALLOOP Footer & Legal Links */}
        <footer className="home-footer">
          <div className="home-footer-links">
            <button type="button" className="footer-link-btn" onClick={() => onOpenInfo('about')}>
              About
            </button>
            <span>•</span>
            <button type="button" className="footer-link-btn" onClick={() => onOpenInfo('rules')}>
              How to Play
            </button>
            <span>•</span>
            <button type="button" className="footer-link-btn" onClick={() => onOpenInfo('privacy')}>
              Privacy
            </button>
            <span>•</span>
            <button type="button" className="footer-link-btn" onClick={() => onOpenInfo('terms')}>
              Terms
            </button>
          </div>
          <div className="home-copyright">
            © 2026 Vaibhav Kumar Sharma. All rights reserved.
          </div>
        </footer>
      </div>

      <div className="home-floating-icons" aria-hidden="true">
        <ChestIcon size={44} />
        <span style={{ fontSize: '2.6rem', fontWeight: 900, color: '#f472b6' }}>?</span>
        <BrandDiceIcon size={44} />
        <span style={{ fontSize: '2.4rem', fontWeight: 900, color: '#facc15' }}>$</span>
      </div>
    </div>
  );
}
