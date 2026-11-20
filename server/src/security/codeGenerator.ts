import crypto from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RngProvider,
} from '@capitalloop/shared';

export function generatePrivateRoomCode(existingCodes: ReadonlySet<string>): string {
  const alphabetLen = ROOM_CODE_ALPHABET.length;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      const idx = crypto.randomInt(0, alphabetLen);
      code += ROOM_CODE_ALPHABET[idx]!;
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  throw new Error('Unable to generate unique room code.');
}

export function generateSecureId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function createCryptoRng(): RngProvider {
  return {
    nextInt(minInclusive: number, maxExclusive: number): number {
      return crypto.randomInt(minInclusive, maxExclusive);
    },
    nextId(prefix: string): string {
      return generateSecureId(prefix);
    },
    now(): number {
      return Date.now();
    },
  };
}