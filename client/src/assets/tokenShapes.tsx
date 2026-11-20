import type { TokenShapeId } from '@capitalloop/shared';

interface TokenGlyphProps {
  shape: TokenShapeId;
  size?: number;
}

export function TokenGlyph({ shape, size = 14 }: TokenGlyphProps) {
  switch (shape) {
    case 'crown':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 18h18l-2-10-4.5 4L12 6l-2.5 6L5 8l-2 10Z" />
        </svg>
      );
    case 'diamond':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 21 12l-9 10L3 12 12 2Z" />
        </svg>
      );
    case 'rocket':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2c3.5 2 6 6.2 6 10.5l-3 2.5v4l-3-2-3 2v-4l-3-2.5C6 8.2 8.5 4 12 2Z" />
        </svg>
      );
    case 'bolt':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 4 14h7l-1 8 10-12h-7l0-8Z" />
        </svg>
      );
    case 'anchor':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2.2" />
          <line x1="12" y1="7.5" x2="12" y2="21" />
          <path d="M5 13a7 7 0 0 0 14 0" />
          <line x1="8" y1="11" x2="16" y2="11" />
        </svg>
      );
    case 'compass':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="9" />
          <polygon points="15.5 8.5 13 13 8.5 15.5 11 11 15.5 8.5" fill="currentColor" />
        </svg>
      );
    case 'shield':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 4 5v6c0 5.5 3.5 9.8 8 11 4.5-1.2 8-5.5 8-11V5l-8-3Z" />
        </svg>
      );
    case 'star':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1L12 2Z" />
        </svg>
      );
  }
}