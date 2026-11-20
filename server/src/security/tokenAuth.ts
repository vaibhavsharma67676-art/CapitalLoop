import crypto from 'node:crypto';

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifySessionToken(candidateToken: string, storedHash: string): boolean {
  if (!candidateToken || !storedHash) {
    return false;
  }
  const candidateHash = hashSessionToken(candidateToken);
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}