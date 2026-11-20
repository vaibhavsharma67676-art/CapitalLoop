import {
  getTileById,
  HOTEL_LEVEL,
  type ClientGameState,
  type GameAction,
  type PrivateRoomSnapshot,
} from '@capitalloop/shared';
import { useEffect, useState } from 'react';
import { CountryFlag } from '../assets/countryFlags';
import {
  CheckIcon,
  CopyIcon,
  PaletteIcon,
  SettingsIcon,
  TradeArrowsIcon,
  VolumeIcon,
} from '../assets/icons';
import { GameBoard } from '../board/GameBoard';
import { ActionBar } from '../components/ActionBar';
import { ActivityLog } from '../components/ActivityLog';
import { ChatPanel } from '../components/ChatPanel';
import { PlayerListPanel } from '../components/PlayerListPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { useCountdownSeconds } from '../hooks/useTurnTimer';
import { AuctionModal } from '../modals/AuctionModal';
import { BankruptcyModal } from '../modals/BankruptcyModal';
import { CardDrawModal } from '../modals/CardDrawModal';
import { GameOverModal } from '../modals/GameOverModal';
import { JailModal } from '../modals/JailModal';
import { ModalShell } from '../modals/ModalShell';
import { MortgageModal } from '../modals/MortgageModal';
import { PropertyDeedModal } from '../modals/PropertyDeedModal';
import { TaxModal } from '../modals/TaxModal';
import { TradeModal } from '../modals/TradeModal';
import { soundService } from '../services/soundService';
import type { ActiveModalState, MobileDrawerTab } from '../types/ui';

interface GameScreenProps {
  room: PrivateRoomSnapshot;
  gameState: ClientGameState;
  myPlayerId: string;
  isRollingDice: boolean;
  onAction: (action: GameAction) => Promise<boolean>;
  onSendChat: (text: string) => Promise<boolean>;
  onReturnToLobby: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onOpenTheme: () => void;
  onCopied: (label: string) => void;
}

export function GameScreen({
  room,
  gameState,
  myPlayerId,
  isRollingDice,
  onAction,
  onSendChat,
  onReturnToLobby,
  onLeaveRoom,
  onOpenTheme,
  onCopied,
}: GameScreenProps) {
  const [modal, setModal] = useState<ActiveModalState>({ kind: 'NONE' });
  const [mobileTab, setMobileTab] = useState<MobileDrawerTab>('board');
  const [mobileZoomed, setMobileZoomed] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(() => soundService.isMuted());
  const [copied, setCopied] = useState(false);
  const [dismissedJailTurn, setDismissedJailTurn] = useState<number>(-1);

  const me = gameState.players[myPlayerId];
  const isHost = room.hostId === myPlayerId;
  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? '';
  const currentPlayer = gameState.players[currentPlayerId];
  const isMyTurn = currentPlayerId === myPlayerId;
  const remainingSeconds = useCountdownSeconds(gameState.turnDeadlineAt);
  const inviteUrl = `${window.location.origin}/join/${room.roomCode}`;

  const myProperties = Object.values(gameState.properties)
    .filter((p) => p.ownerId === myPlayerId)
    .sort((a, b) => a.tileId - b.tileId);

  const pendingTrades = gameState.trades.filter(
    (t) => t.status === 'PENDING' && (t.proposerId === myPlayerId || t.recipientId === myPlayerId),
  );

  // Automatically close voluntary modals if game ends
  useEffect(() => {
    if (gameState.phase === 'GAME_OVER') {
      setModal({ kind: 'NONE' });
    }
  }, [gameState.phase]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      onCopied('Invite URL copied!');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onCopied(`Room code: ${room.roomCode}`);
    }
  };

  const showJailModal =
    isMyTurn &&
    gameState.phase === 'WAITING_FOR_ROLL' &&
    Boolean(me?.inJail) &&
    dismissedJailTurn !== gameState.turnNumber &&
    modal.kind === 'NONE';

  const showMandatoryDebtModal =
    gameState.phase === 'DEBT_RESOLUTION' &&
    gameState.pendingDebt?.debtorId === myPlayerId &&
    modal.kind !== 'MORTGAGE' &&
    modal.kind !== 'DEED' &&
    modal.kind !== 'TRADE_CREATE' &&
    modal.kind !== 'TRADE_VIEW';

  const activeTradeForView =
    modal.kind === 'TRADE_VIEW'
      ? gameState.trades.find((t) => t.id === modal.tradeId)
      : undefined;

  return (
    <div className="game-shell">
      {/* MOBILE TOP COMPACT HUD (visible on <= 860px portrait) */}
      <header className="panel-card mobile-top-hud">
        <div className="mobile-hud-left">
          <span
            className="color-dot"
            style={{ background: currentPlayer?.color ?? 'var(--accent)', width: 10, height: 10 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isMyTurn ? 'Your Turn' : `${currentPlayer?.nickname ?? 'Player'}'s Turn`}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700 }}>
              Cash: ${me?.cash ?? 0}
              {remainingSeconds !== null ? ` • ${remainingSeconds}s` : ''}
            </div>
          </div>
        </div>

        <div className="mobile-hud-actions">
          {mobileTab === 'board' && (
            <button
              type="button"
              className={`btn btn-xs ${mobileZoomed ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMobileZoomed((z) => !z)}
              title="Toggle board zoom for closer tile reading"
            >
              {mobileZoomed ? 'Fit' : 'Zoom'}
            </button>
          )}
          {gameState.settings.tradingEnabled && me && !me.isBankrupt && gameState.phase !== 'GAME_OVER' && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setModal({ kind: 'TRADE_CREATE' })}
              aria-label="Create trade"
            >
              <TradeArrowsIcon size={12} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={() => setModal({ kind: 'SETTINGS_VIEW' })}
            aria-label="View room settings"
          >
            <SettingsIcon size={13} />
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={onOpenTheme}
            aria-label="Customize theme"
          >
            <PaletteIcon size={13} />
          </button>
        </div>
      </header>

      {/* LEFT RAIL: Brand Bar, Share Private Room, Room Chat */}
      <aside
        className={`game-rail rail-left ${
          mobileTab === 'chat' || mobileTab === 'log' ? 'mobile-active' : 'mobile-hidden'
        }`}
      >
        <div className="panel-card game-brand-bar">
          <div className="brand-wordmark">
            CAPITAL<span>LOOP</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="icon-btn" title="Theme Customizer" onClick={onOpenTheme}>
              <PaletteIcon size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={muted ? 'Unmute Sound' : 'Mute Sound'}
              onClick={() => setMuted(soundService.toggleMute())}
            >
              <VolumeIcon muted={muted} size={15} />
            </button>
          </div>
        </div>

        <div className="panel-card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Share this game</span>
            <span className="badge-pill">{room.roomCode}</span>
          </div>
          <div className="invite-url-row">
            <span className="invite-url-text">{inviteUrl}</span>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => void copyInvite()}>
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              style={{ flex: 1 }}
              onClick={() => setModal({ kind: 'SETTINGS_VIEW' })}
            >
              <SettingsIcon size={13} />
              View room settings
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => void onLeaveRoom()}
            >
              Leave
            </button>
          </div>
        </div>

        {mobileTab === 'log' ? (
          <div className="panel-card chat-panel">
            <div className="section-heading">
              <span>Activity Log</span>
            </div>
            <ActivityLog entries={gameState.log} players={gameState.players} />
          </div>
        ) : (
          <ChatPanel messages={room.chat} onSend={onSendChat} />
        )}
      </aside>

      {/* CENTER STAGE: Square Clockwise Monopoly Board */}
      <main
        className={`game-board-stage ${mobileTab === 'board' ? '' : 'mobile-hidden'}`}
      >
        <GameBoard
          gameState={gameState}
          myPlayerId={myPlayerId}
          isRollingDice={isRollingDice}
          mobileZoomed={mobileZoomed}
          onAction={onAction}
          onInspectTile={(tileId) => setModal({ kind: 'DEED', tileId })}
          onOpenMortgage={() => setModal({ kind: 'MORTGAGE' })}
        />
      </main>

      {/* MOBILE THUMB-FRIENDLY ACTION DOCK (visible on <= 860px when on board tab) */}
      {mobileTab === 'board' && (
        <div className="panel-card mobile-action-dock">
          <ActionBar
            gameState={gameState}
            myPlayerId={myPlayerId}
            onAction={onAction}
            onOpenMortgage={() => setModal({ kind: 'MORTGAGE' })}
          />
        </div>
      )}

      {/* RIGHT RAIL: Players List, Bankrupt/Trades, My Properties */}
      <aside
        className={`game-rail rail-right ${mobileTab === 'players' ? 'mobile-active' : 'mobile-hidden'}`}
      >
        <PlayerListPanel
          gameState={gameState}
          hostId={room.hostId}
          myPlayerId={myPlayerId}
          onQuickTrade={(targetPlayerId) => setModal({ kind: 'TRADE_CREATE', targetPlayerId })}
        />

        <div className="panel-card trades-quick-panel">
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="setting-label">Trades ({pendingTrades.length})</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {me && !me.isBankrupt && gameState.phase !== 'GAME_OVER' && (
                <button
                  type="button"
                  className="btn btn-warning btn-xs"
                  onClick={() => setModal({ kind: 'BANKRUPTCY_CONFIRM' })}
                >
                  Bankrupt
                </button>
              )}
              {gameState.settings.tradingEnabled && me && !me.isBankrupt && gameState.phase !== 'GAME_OVER' && (
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => setModal({ kind: 'TRADE_CREATE' })}
                >
                  <TradeArrowsIcon size={12} />
                  + Create
                </button>
              )}
            </div>
          </div>

          {pendingTrades.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 105, overflowY: 'auto' }}>
              {pendingTrades.map((trade) => {
                const proposer = gameState.players[trade.proposerId];
                const recipient = gameState.players[trade.recipientId];
                const incoming = trade.recipientId === myPlayerId;
                return (
                  <div key={trade.id} className="trade-mini-card">
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {incoming ? `From ${proposer?.nickname}` : `To ${recipient?.nickname}`}
                    </span>
                    <button
                      type="button"
                      className={`btn btn-xs ${incoming ? 'btn-success' : 'btn-secondary'}`}
                      onClick={() => setModal({ kind: 'TRADE_VIEW', tradeId: trade.id })}
                    >
                      {incoming ? 'Review' : 'View'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-card properties-panel">
          <div className="section-heading">
            <span>My properties ({myProperties.length})</span>
            {gameState.settings.mortgageEnabled && myProperties.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setModal({ kind: 'MORTGAGE' })}
              >
                Manage
              </button>
            )}
          </div>

          <div className="properties-list">
            {myProperties.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', marginTop: 12 }}>
                No properties owned yet
              </div>
            ) : (
              myProperties.map((prop) => {
                const tile = getTileById(gameState.settings.mapId, prop.tileId);
                const dotColor =
                  tile.type === 'STREET' ? `var(--group-${tile.colorGroup})` : '#94a3b8';
                return (
                  <button
                    key={prop.tileId}
                    type="button"
                    className="property-mini-row"
                    onClick={() => setModal({ kind: 'DEED', tileId: prop.tileId })}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span className="color-dot" style={{ background: dotColor }} />
                      {(tile.type === 'STREET' || tile.type === 'TRANSIT') && (
                        <CountryFlag code={tile.countryCode} countryName={tile.country} size={15} />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tile.name}
                      </span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: prop.mortgaged ? '#fb7185' : 'var(--text-secondary)', flexShrink: 0 }}>
                      {prop.mortgaged
                        ? 'MORT'
                        : prop.houses === HOTEL_LEVEL
                          ? 'Hotel'
                          : prop.houses > 0
                            ? `${prop.houses}H`
                            : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-drawer-bar" aria-label="Mobile navigation">
        {(['board', 'players', 'chat', 'log'] as MobileDrawerTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`mobile-tab-btn ${mobileTab === tab ? 'active' : ''}`}
            onClick={() => setMobileTab(tab)}
          >
            <span style={{ textTransform: 'capitalize' }}>
              {tab === 'players' && pendingTrades.length > 0 ? `Players (${pendingTrades.length})` : tab}
            </span>
          </button>
        ))}
      </nav>

      {/* SERVER-DRIVEN PHASE MODALS */}
      {gameState.phase === 'AUCTION_ACTIVE' && gameState.activeAuction && (
        <AuctionModal
          auction={gameState.activeAuction}
          gameState={gameState}
          myPlayerId={myPlayerId}
          onAction={onAction}
        />
      )}

      {gameState.phase === 'TAX_DECISION' &&
        gameState.pendingTax &&
        gameState.pendingTax.playerId === myPlayerId && (
          <TaxModal pendingTax={gameState.pendingTax} onAction={onAction} />
        )}

      {gameState.phase === 'CARD_REVEAL' && gameState.pendingCard && (
        <CardDrawModal
          pendingCard={gameState.pendingCard}
          drawerName={gameState.players[gameState.pendingCard.drawnByPlayerId]?.nickname ?? 'Player'}
          isMyCard={gameState.pendingCard.drawnByPlayerId === myPlayerId}
          onAction={onAction}
        />
      )}

      {showJailModal && me && (
        <JailModal
          player={me}
          onAction={onAction}
          onClose={() => setDismissedJailTurn(gameState.turnNumber)}
        />
      )}

      {showMandatoryDebtModal && gameState.pendingDebt && (
        <BankruptcyModal
          gameState={gameState}
          myPlayerId={myPlayerId}
          debt={gameState.pendingDebt}
          onAction={onAction}
          onOpenLiquidation={() => setModal({ kind: 'MORTGAGE' })}
        />
      )}

      {gameState.phase === 'GAME_OVER' && (
        <GameOverModal
          gameState={gameState}
          isHost={isHost}
          onReturnToLobby={onReturnToLobby}
          onLeaveRoom={onLeaveRoom}
        />
      )}

      {/* USER-OPENED MODALS */}
      {modal.kind === 'DEED' && (
        <PropertyDeedModal
          tileId={modal.tileId}
          gameState={gameState}
          myPlayerId={myPlayerId}
          onAction={onAction}
          onClose={() => setModal({ kind: 'NONE' })}
        />
      )}

      {modal.kind === 'TRADE_CREATE' && (
        <TradeModal
          gameState={gameState}
          myPlayerId={myPlayerId}
          mode="CREATE"
          initialTargetPlayerId={modal.targetPlayerId}
          onAction={onAction}
          onClose={() => setModal({ kind: 'NONE' })}
        />
      )}

      {modal.kind === 'TRADE_VIEW' && activeTradeForView && (
        <TradeModal
          gameState={gameState}
          myPlayerId={myPlayerId}
          mode="VIEW"
          existingTrade={activeTradeForView}
          onAction={onAction}
          onClose={() => setModal({ kind: 'NONE' })}
        />
      )}

      {modal.kind === 'MORTGAGE' && (
        <MortgageModal
          gameState={gameState}
          myPlayerId={myPlayerId}
          onAction={onAction}
          onClose={() => setModal({ kind: 'NONE' })}
        />
      )}

      {modal.kind === 'BANKRUPTCY_CONFIRM' && (
        <BankruptcyModal
          gameState={gameState}
          myPlayerId={myPlayerId}
          onAction={onAction}
          onOpenLiquidation={() => setModal({ kind: 'MORTGAGE' })}
          onClose={() => setModal({ kind: 'NONE' })}
        />
      )}

      {modal.kind === 'SETTINGS_VIEW' && (
        <ModalShell
          title="Active Room Settings"
          subtitle={`Private Room ${room.roomCode}`}
          wide
          onClose={() => setModal({ kind: 'NONE' })}
        >
          <SettingsPanel
            settings={room.settings}
            editable={false}
            currentPlayerCount={room.players.length}
          />
          <div className="modal-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'NONE' })}>
              Close
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
