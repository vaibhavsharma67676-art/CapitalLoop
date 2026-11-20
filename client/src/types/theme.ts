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
  mainBg: '#120e1e',
  surfaceBg: '#1c172e',
  boardBg: '#171226',
  accentColor: '#8b5cf6',
  buttonColor: '#7c4dff',
  groupColors: { ...DEFAULT_GROUP_COLORS },
};

export const LIGHT_THEME_PRESET: ThemeConfig = {
  mode: 'light',
  mainBg: '#eef1f8',
  surfaceBg: '#ffffff',
  boardBg: '#f6f7fc',
  accentColor: '#6d28d9',
  buttonColor: '#7c3aed',
  groupColors: { ...DEFAULT_GROUP_COLORS },
};