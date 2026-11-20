import {
  getTileById,
  isPurchasableTile,
  type AuctionState,
  type ClientGameState,
  type GameAction,
} from '@capitalloop/shared';
import { useState } from 'react';
import { useCountdownSeconds } from '../hooks/useTurnTimer';
import { ModalShell } from './ModalShell';

interface AuctionModalProps {
  auction: AuctionState;
  gameState: ClientGameState;
  myPlayerId: string;
  onAction: (action: GameAction) => Promise<boolean>;
}

export function AuctionModal({
  auction,
  gameState,
  myPlayerId,
  onAction,
}: AuctionModalProps) {
  const [customBid, setCustomBid] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const secondsLeft = useCountdownSeconds(auction.endsAt) ?? 0;
  const tile = getTileById(gameState.settings.mapId, auction.tileId);
  const me = gameState.players[myPlayerId];
  const highestBidder = auction.highestBidderId
    ? gameState.players[auction.highestBidderId]
    : undefined;

  const isEligible = auction.eligiblePlayerIds.includes(myPlayerId);
  const hasPassed = auction.passedPlayerIds.includes(myPlayerId);
  const amHighest = auction.highestBidderId === myPlayerId;
  const minNextBid = auction.currentBid + 1;

  const submitBid = async (amount: number) => {
    setBusy(true);
    try {
      const ok = await onAction({ type: 'PLACE_BID', amount });
      if (ok) setCustomBid('');
    } finally {
      setBusy(false);
    }
  };

  const handlePass = async () => {
    setBusy(true);
    try {
      await onAction({ type: 'PASS_AUCTION' });
    } finally {
      setBusy(false);
    }
  };

  const listPrice = isPurchasableTile(tile) ? tile.price : 0;

  return (
    <ModalShell
      title={`Live Auction — ${tile.name}`}
      subtitle={`List Price: $${listPrice} • Ends in ${secondsLeft}s`}
      dismissible={false}
    >
      <div
        className="panel-card"
        style={{
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface-elevated)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Highest Bid</div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#34d399' }}>
            ${auction.currentBid}
          </div>
          <div style={{ fontSize: '0.82rem', color: highestBidder?.color ?? 'var(--text-muted)' }}>
            {highestBidder ? `Leading: ${highestBidder.nickname}` : 'No bids yet — starting at $1'}
          </div>
        </div>

        <div
          className={`timer-pill ${secondsLeft <= 4 ? 'urgent' : ''}`}
          style={{ fontSize: '1.2rem', padding: '8px 16px' }}
        >
          {secondsLeft}s
        </div>
      </div>

      {isEligible && me && !me.isBankrupt && !hasPassed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Your Cash: <strong>${me.cash}</strong>
            {amHighest && (
              <span className="badge-pill" style={{ marginLeft: 8 }}>
                You are the highest bidder
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 10, 50, 100].map((inc) => {
              const target = auction.currentBid + inc;
              return (
                <button
                  key={inc}
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || me.cash < target}
                  onClick={() => void submitBid(target)}
                >
                  +${inc} (${target})
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              className="input-field"
              min={minNextBid}
              max={me.cash}
              placeholder={`Custom bid (min $${minNextBid})`}
              value={customBid}
              onChange={(e) => setCustomBid(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-success btn-sm"
              disabled={busy || !customBid || Number(customBid) < minNextBid || Number(customBid) > me.cash}
              onClick={() => void submitBid(Math.floor(Number(customBid)))}
            >
              Bid
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || amHighest}
              onClick={() => void handlePass()}
            >
              Pass
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {hasPassed ? 'You passed on this auction. Watching remaining bids...' : 'Spectating auction...'}
        </div>
      )}

      {auction.bidHistory.length > 0 && (
        <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[...auction.bidHistory].reverse().slice(0, 6).map((entry, idx) => {
            const bidder = gameState.players[entry.playerId];
            return (
              <div key={idx} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: bidder?.color ?? 'var(--text-primary)', fontWeight: 700 }}>
                  {bidder?.nickname ?? 'Player'}
                </span>
                <span>${entry.amount}</span>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}