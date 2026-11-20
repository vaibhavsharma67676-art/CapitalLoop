import type { CountryCode } from '@capitalloop/shared';
import { useId } from 'react';

interface CountryFlagProps {
  code: CountryCode;
  countryName?: string;
  size?: number;
  className?: string;
}

/**
 * Crisp inline SVG national flags for all 8 city countries + 2 airport nations.
 * Renders consistently across Windows, Linux, macOS, Android, and iOS without
 * relying on OS-dependent emoji font support.
 */
export function CountryFlag({
  code,
  countryName,
  size = 18,
  className = 'country-flag-svg',
}: CountryFlagProps) {
  const uid = useId().replace(/:/g, '');
  const clipId = `flag-clip-${code}-${uid}`;
  const height = Math.round(size * 0.7);
  const label = countryName ? `${countryName} flag` : `${code} flag`;

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 28 20"
      className={className}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="28" height="20" rx="3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {code === 'BR' && (
          <>
            <rect width="28" height="20" fill="#009c3b" />
            <polygon points="14,2.2 25.2,10 14,17.8 2.8,10" fill="#ffdf00" />
            <circle cx="14" cy="10" r="4.4" fill="#002776" />
            <path d="M10.2,9.2 Q14,7.6 17.8,10.5" stroke="#ffffff" strokeWidth="1.1" fill="none" />
          </>
        )}

        {code === 'IT' && (
          <>
            <rect x="0" width="9.4" height="20" fill="#009246" />
            <rect x="9.3" width="9.4" height="20" fill="#ffffff" />
            <rect x="18.6" width="9.4" height="20" fill="#ce2b37" />
          </>
        )}

        {code === 'DE' && (
          <>
            <rect y="0" width="28" height="6.7" fill="#111111" />
            <rect y="6.6" width="28" height="6.8" fill="#dd0000" />
            <rect y="13.3" width="28" height="6.7" fill="#ffce00" />
          </>
        )}

        {code === 'IN' && (
          <>
            <rect y="0" width="28" height="6.7" fill="#ff9933" />
            <rect y="6.6" width="28" height="6.8" fill="#ffffff" />
            <rect y="13.3" width="28" height="6.7" fill="#138808" />
            <circle cx="14" cy="10" r="2.4" fill="none" stroke="#000080" strokeWidth="0.9" />
            <circle cx="14" cy="10" r="0.6" fill="#000080" />
          </>
        )}

        {code === 'JP' && (
          <>
            <rect width="28" height="20" fill="#ffffff" />
            <circle cx="14" cy="10" r="5.5" fill="#bc002d" />
          </>
        )}

        {code === 'FR' && (
          <>
            <rect x="0" width="9.4" height="20" fill="#0055a4" />
            <rect x="9.3" width="9.4" height="20" fill="#ffffff" />
            <rect x="18.6" width="9.4" height="20" fill="#ef4135" />
          </>
        )}

        {code === 'GB' && (
          <>
            <rect width="28" height="20" fill="#012169" />
            <path d="M0,0 L28,20 M28,0 L0,20" stroke="#ffffff" strokeWidth="4" />
            <path d="M0,0 L28,20 M28,0 L0,20" stroke="#c8102e" strokeWidth="2" />
            <path d="M14,0 V20 M0,10 H28" stroke="#ffffff" strokeWidth="5.6" />
            <path d="M14,0 V20 M0,10 H28" stroke="#c8102e" strokeWidth="3.2" />
          </>
        )}

        {code === 'US' && (
          <>
            <rect width="28" height="20" fill="#ffffff" />
            <rect y="0" width="28" height="2.2" fill="#b22234" />
            <rect y="4.4" width="28" height="2.2" fill="#b22234" />
            <rect y="8.8" width="28" height="2.2" fill="#b22234" />
            <rect y="13.2" width="28" height="2.2" fill="#b22234" />
            <rect y="17.6" width="28" height="2.4" fill="#b22234" />
            <rect width="12.5" height="11" fill="#3c3b6e" />
            <circle cx="3" cy="3" r="0.8" fill="#ffffff" />
            <circle cx="6.2" cy="3" r="0.8" fill="#ffffff" />
            <circle cx="9.4" cy="3" r="0.8" fill="#ffffff" />
            <circle cx="4.6" cy="5.5" r="0.8" fill="#ffffff" />
            <circle cx="7.8" cy="5.5" r="0.8" fill="#ffffff" />
            <circle cx="3" cy="8" r="0.8" fill="#ffffff" />
            <circle cx="6.2" cy="8" r="0.8" fill="#ffffff" />
            <circle cx="9.4" cy="8" r="0.8" fill="#ffffff" />
          </>
        )}

        {code === 'AE' && (
          <>
            <rect x="7" y="0" width="21" height="6.7" fill="#00732f" />
            <rect x="7" y="6.6" width="21" height="6.8" fill="#ffffff" />
            <rect x="7" y="13.3" width="21" height="6.7" fill="#111111" />
            <rect x="0" y="0" width="7.2" height="20" fill="#ff0000" />
          </>
        )}

        {code === 'SG' && (
          <>
            <rect y="0" width="28" height="10" fill="#ef3340" />
            <rect y="10" width="28" height="10" fill="#ffffff" />
            <circle cx="6.4" cy="5" r="3.1" fill="#ffffff" />
            <circle cx="7.6" cy="5" r="2.7" fill="#ef3340" />
            <circle cx="9.8" cy="3.6" r="0.7" fill="#ffffff" />
            <circle cx="11.4" cy="4.6" r="0.7" fill="#ffffff" />
            <circle cx="10.8" cy="6.4" r="0.7" fill="#ffffff" />
            <circle cx="9" cy="6.4" r="0.7" fill="#ffffff" />
            <circle cx="8.5" cy="4.6" r="0.7" fill="#ffffff" />
          </>
        )}
      </g>
      <rect
        x="0.4"
        y="0.4"
        width="27.2"
        height="19.2"
        rx="2.8"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="0.8"
      />
    </svg>
  );
}
