import { DEFAULT_GROUP_COLORS, type ColorGroup } from '@capitalloop/shared';

export type ThemeMode = 'dark' | 'light';

export interface ThemeConfig {
  mode: ThemeMode;
  mainBg: string;
  surfaceBg: string;
  boardBg: string;
  accentColor: string;
  buttonColor: string;
  groupColors: Record<ColorGroup, string>;
}

export const DARK_THEME_PRESET: ThemeConfig = {
  mode: 'dark',
  mainBg: '#0c0e1a',
  surfaceBg: '#161a2c',
  boardBg: '#111526',
  accentColor: '#8b5cf6',
  buttonColor: '#7c4dff',
  groupColors: { ...DEFAULT_GROUP_COLORS },
};

export const LIGHT_THEME_PRESET: ThemeConfig = {
  mode: 'light',
  mainBg: '#e8edf7',
  surfaceBg: '#ffffff',
  boardBg: '#dfe6f5',
  accentColor: '#6d28d9',
  buttonColor: '#7c3aed',
  groupColors: { ...DEFAULT_GROUP_COLORS },
};
