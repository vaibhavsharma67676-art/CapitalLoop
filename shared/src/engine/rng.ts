export interface RngProvider {
  /** Returns integer in [minInclusive, maxExclusive) */
  nextInt(minInclusive: number, maxExclusive: number): number;
  nextId(prefix: string): string;
  now(): number;
}

interface CryptoRandomSource {
  getRandomValues: <T extends ArrayBufferView>(array: T) => T;
}

function getCryptoSource(): CryptoRandomSource {
  const candidate = (globalThis as { crypto?: Partial<CryptoRandomSource> }).crypto;
  if (!candidate || typeof candidate.getRandomValues !== 'function') {
    throw new Error('Cryptographic RNG (crypto.getRandomValues) is unavailable in this runtime.');
  }
  return candidate as CryptoRandomSource;
}

function unbiasedCryptoInt(minInclusive: number, maxExclusive: number): number {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxExclusive);
  const span = max - min;
  if (span <= 1) {
    return min;
  }

  const cryptoSource = getCryptoSource();
  const maxUint32 = 0x1_0000_0000;
  if (span > maxUint32) {
    throw new RangeError('RNG span exceeds 32-bit unsigned integer range.');
  }

  // Rejection sampling eliminates modulo bias completely
  const limit = maxUint32 - (maxUint32 % span);
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    cryptoSource.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);

  return min + (value % span);
}

export function createDefaultRng(): RngProvider {
  let seq = 0;
  return {
    nextInt(minInclusive: number, maxExclusive: number): number {
      return unbiasedCryptoInt(minInclusive, maxExclusive);
    },
    nextId(prefix: string): string {
      seq += 1;
      const rand = unbiasedCryptoInt(0, 0x7fffffff).toString(36);
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
