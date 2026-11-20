import {
  getTileById,
  isPurchasableTile,
  JAIL_BAIL_AMOUNT,
  type ClientGameState,
  type GameAction,
} from '@capitalloop/shared';
import { useState } from 'react';
import { CheckIcon } from '../assets/icons';

interface ActionBarProps {
  gameState: ClientGameState;
  myPlayerId: string;
  onAction: (action: GameAction) => Promise<boolean>;
  onOpenMortgage: () => void;
}

export function ActionBar({
  gameState,
  myPlayerId,
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
        <span className="badge-pill" style={{ fontSize: '0.88rem', padding: '6px 14px' }}>
          Match Complete — Winner: {winner?.nickname ?? 'Champion'}
        </span>
      </div>
    );
  }

  if (!me || me.isBankrupt) {
    return (
      <div className="center-action-deck">
        <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
          You are spectating this private match.
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
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
            Waiting for {debtor?.nickname ?? 'player'} to settle ${gameState.pendingDebt.amount}...
          </span>
        </div>
      );
    }

    return (
      <div className="center-action-deck">
        <button
          type="button"
          className="btn btn-success"
          disabled={!canPayNow || submitting}
          onClick={() => void dispatch({ type: 'PAY_DEBT' })}
        >
          Pay ${gameState.pendingDebt.amount} Debt
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
          Declare Bankruptcy
        </button>
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className="center-action-deck">
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', fontWeight: 600 }}>
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
          {me.inJail ? 'Roll for Doubles' : 'Roll Dice'}
        </button>

        {me.inJail && (
          <>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              disabled={submitting || me.cash < JAIL_BAIL_AMOUNT}
              onClick={() => void dispatch({ type: 'PAY_JAIL_BAIL' })}
            >
              Pay ${JAIL_BAIL_AMOUNT} Bail
            </button>
            {me.jailFreeCards > 0 && (
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={submitting}
                onClick={() => void dispatch({ type: 'USE_JAIL_CARD' })}
              >
                Use Prison Card ({me.jailFreeCards})
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
          Buy {tile.shortLabel} (${price})
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={submitting}
          onClick={() => void dispatch({ type: 'DECLINE_PROPERTY' })}
        >
          {gameState.settings.auctionDeclinedProperties ? 'Send to Auction' : 'Skip'}
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
      <span className="badge-pill">Resolve active popup...</span>
    </div>
  );
}