interface DiceRollerProps {
  die1: number;
  die2: number;
  isRolling: boolean;
  isDoubles: boolean;
}

const PIP_MAP: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = PIP_MAP[value] ?? PIP_MAP[1]!;
  return (
    <div className={`die-cube ${rolling ? 'rolling' : ''}`} aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }).map((_, idx) => (
        <span
          key={idx}
          className={pips.includes(idx) ? 'die-pip' : undefined}
          style={pips.includes(idx) ? undefined : { visibility: 'hidden' }}
        />
      ))}
    </div>
  );
}

export function DiceRoller({ die1, die2, isRolling, isDoubles }: DiceRollerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div className="dice-pair">
        <DieFace value={die1} rolling={isRolling} />
        <DieFace value={die2} rolling={isRolling} />
      </div>
      {isDoubles && !isRolling && (
        <span className="badge-pill" style={{ background: 'rgba(52, 211, 153, 0.2)', color: '#34d399' }}>
          Doubles! ({die1 + die2})
        </span>
      )}
    </div>
  );
}