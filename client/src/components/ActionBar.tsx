import {
  getTileById,
  isPurchasableTile,
  JAIL_BAIL_AMOUNT,
  type ClientGameState,
  type GameAction,
} from '@capitalloop/shared';
import { useState } from 'react';
import { CountryFlag } from '../assets/countryFlags';
import { CheckIcon } from '../assets/icons';

interface ActionBarProps {
  gameState: ClientGameState;
  myPlayerId: string;
  hideBannerHandledActions?: boolean;
  onAction: (action: GameAction) => Promise<boolean>;
  onOpenMortgage: () => void;
}

export function ActionBar({
  gameState,
  myPlayerId,
  hideBannerHandledActions = false,
  onAction,
  onOpenMortgage,
}: ActionBarProps) {
  const [submitting, setSubmitting] = useState(false);

  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? '';
  const isMyTurn = currentPlayerId === myPlayerId;
  const me = gameState.players[myPlayerId];
  const currentPlayer = gameState.players[currentPlayerId];

  const dispatch = async (action: GameAction) => {
    setSubmitting(true);
    try {
      await onAction(action);
    } finally {
      setSubmitting(false);
    }
  };

  if (gameState.phase === 'GAME_OVER') {
    const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : undefined;
    return (
      <div className="center-action-deck">
        <span className="badge-pill" style={{ fontSize: '0.84rem', padding: '6px 14px' }}>
          Match Complete — Winner: {winner?.nickname ?? 'Champion'}
        </span>
      </div>
    );
  }

  if (!me || me.isBankrupt) {
    return (
      <div className="center-action-deck">
        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Spectating private match
        </span>
      </div>
    );
  }

  if (gameState.phase === 'CARD_REVEAL' && gameState.pendingCard) {
    if (hideBannerHandledActions) return null;

    const isMyCard = gameState.pendingCard.drawnByPlayerId === myPlayerId;
    const drawer = gameState.players[gameState.pendingCard.drawnByPlayerId];
    if (isMyCard) {
      return (
        <div className="center-action-deck">
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={() => void dispatch({ type: 'ACKNOWLEDGE_CARD' })}
          >
            Resolve Card
          </button>
        </div>
      );
    }
    return (
      <div className="center-action-deck">
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
          {drawer?.nickname ?? 'Player'} drew a card...
        </span>
      </div>
    );
  }

  if (gameState.phase === 'TAX_DECISION' && gameState.pendingTax) {
    const isMyTax = gameState.pendingTax.playerId === myPlayerId;
    if (isMyTax) {
      if (hideBannerHandledActions) return null;

      return (
        <div className="center-action-deck">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={submitting}
            onClick={() => void dispatch({ type: 'CHOOSE_TAX_OPTION', choice: 'FLAT' })}
          >
            Flat Tax (${gameState.pendingTax.flatAmount})
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={submitting}
            onClick={() => void dispatch({ type: 'CHOOSE_TAX_OPTION', choice: 'PERCENT' })}
          >
            10% Worth (${gameState.pendingTax.percentAmount})
          </button>
        </div>
      );
    }
    const taxPayer = gameState.players[gameState.pendingTax.playerId];
    return (
      <div className="center-action-deck">
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
          {taxPayer?.nickname ?? 'Player'} is choosing tax...
        </span>
      </div>
    );
  }

  if (gameState.phase === 'DEBT_RESOLUTION' && gameState.pendingDebt) {
    const isDebtor = gameState.pendingDebt.debtorId === myPlayerId;
    const canPayNow = me.cash >= gameState.pendingDebt.amount;
    if (!isDebtor) {
      const debtor = gameState.players[gameState.pendingDebt.debtorId];
      return (
        <div className="center-action-deck">
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Waiting for {debtor?.nickname ?? 'player'} to settle ${gameState.pendingDebt.amount}...
          </span>
        </div>
      );
    }

    return (
      <div className="center-action-deck">
        <button
          type="button"
          className="btn btn-success btn-sm"
          disabled={!canPayNow || submitting}
          onClick={() => void dispatch({ type: 'PAY_DEBT' })}
        >
          Pay ${gameState.pendingDebt.amount}
        </button>
        {gameState.settings.mortgageEnabled && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenMortgage}>
            Raise Funds
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={submitting}
          onClick={() => void dispatch({ type: 'DECLARE_BANKRUPTCY' })}
        >
          Bankrupt
        </button>
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className="center-action-deck">
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
          Waiting for {currentPlayer?.nickname ?? 'player'}...
        </span>
      </div>
    );
  }

  if (gameState.phase === 'WAITING_FOR_ROLL') {
    return (
      <div className="center-action-deck">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting}
          onClick={() => void dispatch({ type: 'ROLL_DICE' })}
        >
          {me.inJail ? 'Roll Doubles' : 'Roll Dice'}
        </button>

        {me.inJail && (
          <>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              disabled={submitting || me.cash < JAIL_BAIL_AMOUNT}
              onClick={() => void dispatch({ type: 'PAY_JAIL_BAIL' })}
            >
              Bail ${JAIL_BAIL_AMOUNT}
            </button>
            {me.jailFreeCards > 0 && (
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={submitting}
                onClick={() => void dispatch({ type: 'USE_JAIL_CARD' })}
              >
                Free Card ({me.jailFreeCards})
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (gameState.phase === 'AWAITING_BUY_DECISION' && gameState.pendingPurchaseTileId !== null) {
    const tile = getTileById(gameState.settings.mapId, gameState.pendingPurchaseTileId);
    const price = isPurchasableTile(tile) ? tile.price : 0;
    const canAfford = me.cash >= price;

    return (
      <div className="center-action-deck">
        <button
          type="button"
          className="btn btn-success"
          disabled={!canAfford || submitting}
          onClick={() => void dispatch({ type: 'BUY_PROPERTY' })}
        >
          {(tile.type === 'STREET' || tile.type === 'TRANSIT') && (
            <CountryFlag code={tile.countryCode} countryName={tile.country} size={16} />
          )}
          <span>
            Buy {tile.shortLabel} (${price})
          </span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={submitting}
          onClick={() => void dispatch({ type: 'DECLINE_PROPERTY' })}
        >
          {gameState.settings.auctionDeclinedProperties ? 'Auction' : 'Skip'}
        </button>
      </div>
    );
  }

  if (gameState.phase === 'POST_ROLL_ACTIONS') {
    return (
      <div className="center-action-deck">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting}
          onClick={() => void dispatch({ type: 'END_TURN' })}
        >
          <CheckIcon size={16} />
          End Turn
        </button>
        {gameState.settings.mortgageEnabled && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenMortgage}>
            Mortgages
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="center-action-deck">
      <span className="badge-pill">Action in progress...</span>
    </div>
  );
}
