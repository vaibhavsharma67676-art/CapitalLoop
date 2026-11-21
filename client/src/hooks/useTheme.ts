import type { ColorGroup } from '@capitalloop/shared';
import { useCallback, useEffect, useState } from 'react';
import { loadThemeConfig, saveThemeConfig } from '../services/sessionStorage';
import {
  DARK_THEME_PRESET,
  LIGHT_THEME_PRESET,
  type ThemeConfig,
  type ThemeMode,
} from '../types/theme';

function hexToRgba(hex: string, alpha: number): string | null {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const r = Number.parseInt(clean[0]! + clean[0]!, 16);
    const g = Number.parseInt(clean[1]! + clean[1]!, 16);
    const b = Number.parseInt(clean[2]! + clean[2]!, 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return null;
}

function applyThemeToDocument(theme: ThemeConfig): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.mode);
  root.style.setProperty('--bg-main', theme.mainBg);

  // Preserve frosted Glassmorphism translucency on panels while keeping solid surface for modals/nav
  const glassAlpha = theme.mode === 'light' ? 0.84 : 0.78;
  const translucentSurface = hexToRgba(theme.surfaceBg, glassAlpha);
  root.style.setProperty('--bg-surface', translucentSurface ?? theme.surfaceBg);
  root.style.setProperty('--bg-surface-solid', theme.surfaceBg);

  root.style.setProperty('--bg-board', theme.boardBg);
  root.style.setProperty('--accent', theme.accentColor);
  root.style.setProperty('--btn-primary', theme.buttonColor);

  for (const [group, hex] of Object.entries(theme.groupColors)) {
    root.style.setProperty(`--group-${group}`, hex);
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeConfig>(() => {
    const saved = loadThemeConfig();
    if (!saved) return DARK_THEME_PRESET;
    const fallback = saved.mode === 'light' ? LIGHT_THEME_PRESET : DARK_THEME_PRESET;
    return {
      ...fallback,
      ...saved,
      groupColors: { ...fallback.groupColors, ...(saved.groupColors ?? {}) },
    };
  });

  useEffect(() => {
    applyThemeToDocument(theme);
    saveThemeConfig(theme);
  }, [theme]);

  const setMode = useCallback((mode: ThemeMode) => {
    setTheme((prev) => {
      const preset = mode === 'light' ? LIGHT_THEME_PRESET : DARK_THEME_PRESET;
      return {
        ...preset,
        groupColors: prev.groupColors,
      };
    });
  }, []);

  const updateField = useCallback(
    (field: 'mainBg' | 'surfaceBg' | 'boardBg' | 'accentColor' | 'buttonColor', value: string) => {
      setTheme((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const updateGroupColor = useCallback((group: ColorGroup, value: string) => {
    setTheme((prev) => ({
      ...prev,
      groupColors: { ...prev.groupColors, [group]: value },
    }));
  }, []);

  const resetTheme = useCallback(() => {
    setTheme((prev) => (prev.mode === 'light' ? LIGHT_THEME_PRESET : DARK_THEME_PRESET));
  }, []);

  return {
    theme,
    setMode,
    updateField,
    updateGroupColor,
    resetTheme,
  };
}
