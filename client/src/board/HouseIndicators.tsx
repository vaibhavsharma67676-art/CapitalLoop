import { HOTEL_LEVEL } from '@capitalloop/shared';

interface HouseIndicatorsProps {
  houses: number;
}

export function HouseIndicators({ houses }: HouseIndicatorsProps) {
  if (houses <= 0) return null;

  if (houses >= HOTEL_LEVEL) {
    return (
      <span className="house-indicators" title="Hotel">
        <span className="hotel-pip">H</span>
      </span>
    );
  }

  return (
    <span className="house-indicators" title={`${houses} house${houses > 1 ? 's' : ''}`}>
      {Array.from({ length: houses }).map((_, index) => (
        <span key={index} className="house-pip" />
      ))}
    </span>
  );
}