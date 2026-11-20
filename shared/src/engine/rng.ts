export interface RngProvider {
  /** Returns integer in [minInclusive, maxExclusive) */
  nextInt(minInclusive: number, maxExclusive: number): number;
  nextId(prefix: string): string;
  now(): number;
}

export function createDefaultRng(): RngProvider {
  let seq = 0;
  return {
    nextInt(minInclusive: number, maxExclusive: number): number {
      const span = maxExclusive - minInclusive;
      return minInclusive + Math.floor(Math.random() * span);
    },
    nextId(prefix: string): string {
      seq += 1;
      const rand = Math.random().toString(36).slice(2, 8);
      return `${prefix}_${Date.now().toString(36)}_${seq}_${rand}`;
    },
    now(): number {
      return Date.now();
    },
  };
}

export function createSeededRng(seed: number, fixedStartTime = 1_700_000_000_000): RngProvider {
  let state = seed >>> 0;
  let seq = 0;
  let clock = fixedStartTime;

  function nextFloat(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    nextInt(minInclusive: number, maxExclusive: number): number {
      const span = maxExclusive - minInclusive;
      return minInclusive + Math.floor(nextFloat() * span);
    },
    nextId(prefix: string): string {
      seq += 1;
      return `${prefix}_${seq}`;
    },
    now(): number {
      clock += 100;
      return clock;
    },
  };
}

export function shuffleArray<T>(items: readonly T[], rng: RngProvider): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(0, i + 1);
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}