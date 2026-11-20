export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

export type MobileDrawerTab = 'board' | 'players' | 'chat' | 'log';

export type ActiveModalState =
  | { kind: 'NONE' }
  | { kind: 'DEED'; tileId: number }
  | { kind: 'TRADE_CREATE'; targetPlayerId?: string }
  | { kind: 'TRADE_VIEW'; tradeId: string }
  | { kind: 'MORTGAGE' }
  | { kind: 'SETTINGS_VIEW' }
  | { kind: 'THEME' }
  | { kind: 'BANKRUPTCY_CONFIRM' };