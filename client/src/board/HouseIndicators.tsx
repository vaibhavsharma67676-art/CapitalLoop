import { HOTEL_LEVEL, MAX_HOUSES_BEFORE_HOTEL } from '@capitalloop/shared';

interface HouseIndicatorsProps {
  houses: number;
}

function HouseIcon() {
  return (
    <svg
      className="house-svg"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2.1L2 7.1V13.8C2 14.2 2.3 14.5 2.7 14.5H13.3C13.7 14.5 14 14.2 14 13.8V7.1L8 2.1Z"
        fill="#22c55e"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <rect x="6.5" y="9.3" width="3" height="5.2" rx="0.6" fill="#052e16" />
      <path
        d="M1.4 7.4L8 1.8L14.6 7.4"
        stroke="#bbf7d0"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HotelIcon() {
  return (
    <svg
      className="hotel-svg"
      viewBox="0 0 20 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="3"
        width="16"
        height="11.8"
        rx="1.8"
        fill="#f43f5e"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1.1"
      />
      <path
        d="M5.5 3V1.7C5.5 1.3 5.8 1 6.2 1H13.8C14.2 1 14.5 1.3 14.5 1.7V3"
        fill="#fbbf24"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="0.9"
      />
      <rect x="4.6" y="5.4" width="2.2" height="2" rx="0.4" fill="#fef08a" />
      <rect x="8.9" y="5.4" width="2.2" height="2" rx="0.4" fill="#fef08a" />
      <rect x="13.2" y="5.4" width="2.2" height="2" rx="0.4" fill="#fef08a" />
      <rect x="4.6" y="8.8" width="2.2" height="2" rx="0.4" fill="#fef08a" />
      <rect x="13.2" y="8.8" width="2.2" height="2" rx="0.4" fill="#fef08a" />
      <rect x="8.5" y="9.2" width="3" height="5.6" rx="0.6" fill="#4c0519" />
    </svg>
  );
}

export function HouseIndicators({ houses }: HouseIndicatorsProps) {
  if (!Number.isFinite(houses) || houses <= 0) return null;

  // Strictly replace 4 houses with 1 hotel icon at HOTEL_LEVEL (5)
  if (houses >= HOTEL_LEVEL) {
    return (
      <span className="house-indicators hotel-state" title="Hotel" aria-label="1 Hotel">
        <HotelIcon />
      </span>
    );
  }

  // Strictly clamp to 1..4 matching actual house count
  const houseCount = Math.min(Math.floor(houses), MAX_HOUSES_BEFORE_HOTEL);

  return (
    <span
      className="house-indicators"
      title={`${houseCount} house${houseCount > 1 ? 's' : ''}`}
      aria-label={`${houseCount} house${houseCount > 1 ? 's' : ''}`}
    >
      {Array.from({ length: houseCount }).map((_, index) => (
        <HouseIcon key={index} />
      ))}
    </span>
  );
}
