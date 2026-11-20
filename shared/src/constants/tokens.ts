export const TOKEN_SHAPES = [
  'crown',
  'diamond',
  'rocket',
  'bolt',
  'anchor',
  'compass',
  'shield',
  'star',
] as const;

export type TokenShapeId = (typeof TOKEN_SHAPES)[number];

export interface PlayerColorPreset {
  id: string;
  name: string;
  hex: string;
  glow: string;
}

export const PLAYER_COLOR_PRESETS: readonly PlayerColorPreset[] = [
  { id: 'emerald', name: 'Emerald', hex: '#2dd4bf', glow: 'rgba(45, 212, 191, 0.45)' },
  { id: 'amber', name: 'Amber', hex: '#facc15', glow: 'rgba(250, 204, 21, 0.45)' },
  { id: 'coral', name: 'Coral', hex: '#fb7185', glow: 'rgba(251, 113, 133, 0.45)' },
  { id: 'sky', name: 'Sky', hex: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)' },
  { id: 'violet', name: 'Violet', hex: '#a78bfa', glow: 'rgba(167, 139, 250, 0.45)' },
  { id: 'lime', name: 'Lime', hex: '#a3e635', glow: 'rgba(163, 230, 53, 0.45)' },
  { id: 'orange', name: 'Tangerine', hex: '#fb923c', glow: 'rgba(251, 146, 60, 0.45)' },
  { id: 'fuchsia', name: 'Fuchsia', hex: '#e879f9', glow: 'rgba(232, 121, 249, 0.45)' },
] as const;

export const DEFAULT_GROUP_COLORS = {
  brown: '#9a5b3b',
  lightBlue: '#38bdf8',
  pink: '#ec4899',
  orange: '#f97316',
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  darkBlue: '#6366f1',
} as const;