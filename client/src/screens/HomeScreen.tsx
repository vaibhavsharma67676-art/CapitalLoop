import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  type RoomSessionCredentials,
} from '@capitalloop/shared';
import { type FormEvent, useState } from 'react';
import {
  BrandDiceIcon,
  ChestIcon,
  LockIcon,
  PaletteIcon,
  VolumeIcon,
} from '../assets/icons';
import { loadNickname } from '../services/sessionStorage';
import { soundService } from '../services/soundService';

interface HomeScreenProps {
  initialJoinCode?: string;
  isConnected: boolean;
  isBusy: boolean;
  savedReconnectCreds: RoomSessionCredentials | null;
  onCreateRoom: (nickname: string) => Promise<boolean>;
  onJoinRoom: (roomCode: string, nickname: string) => Promise<boolean>;
  onReconnect: (creds: RoomSessionCredentials) => Promise<boolean>;
  onOpenTheme: () => void;
}

export function HomeScreen({
  initialJoinCode = '',
  isConnected,
  isBusy,
  savedReconnectCreds,
  onCreateRoom,
  onJoinRoom,
  onReconnect,
  onOpenTheme,
}: HomeScreenProps) {
  const [nickname, setNickname] = useState<string>(() => loadNickname());
  const [roomCode, setRoomCode] = useState<string>(initialJoinCode.toUpperCase());
  const [muted, setMuted] = useState<boolean>(() => soundService.isMuted());

  const validNickname =
    nickname.trim().length >= NICKNAME_MIN_LENGTH && nickname.trim().length <= NICKNAME_MAX_LENGTH;
  const validCode = roomCode.trim().length === ROOM_CODE_LENGTH;

  const handleCreate = async () => {
    if (!validNickname || isBusy) return;
    await onCreateRoom(nickname.trim());
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validNickname || !validCode || isBusy) return;
    await onJoinRoom(roomCode.trim().toUpperCase(), nickname.trim());
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
          {isConnected ? 'Server Online' : 'Connecting...'}
        </span>
        <button
          type="button"
          className="icon-btn"
          title="Customize Theme"
          onClick={onOpenTheme}
          aria-label="Customize Theme"
        >
          <PaletteIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={muted ? 'Unmute Sound' : 'Mute Sound'}
          onClick={() => setMuted(soundService.toggleMute())}
          aria-label="Toggle Sound"
        >
          <VolumeIcon muted={muted} size={16} />
        </button>
      </div>

      <div className="home-hero">
        <BrandDiceIcon className="home-brand-dice" size={72} />
        <h1 className="home-title">
          CAPITAL<span>LOOP</span>
        </h1>
        <p className="home-subtitle">Rule the economy — exclusively with your invited friends</p>

        <div className="panel-card home-card">
          <div className="home-private-banner">
            <LockIcon size={15} />
            <span>Private Rooms Only • No Random Players • No Bots</span>
          </div>

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

          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!validNickname || isBusy || !isConnected}
            onClick={() => void handleCreate()}
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
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              aria-label="5-character private room code"
            />
            <button
              type="submit"
              className="btn btn-secondary"
              style={{ whiteSpace: 'nowrap' }}
              disabled={!validNickname || !validCode || isBusy || !isConnected}
            >
              Join Room
            </button>
          </form>
        </div>
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