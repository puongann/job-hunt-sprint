const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (they look like 1 and 0)

function randomInt(max: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

export function randomRoomCode(): string {
  return Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
}

export function randomPin(): string {
  return Array.from({ length: 6 }, () => String(randomInt(10))).join('');
}

export function randomToken(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[randomInt(chars.length)]).join('');
}

/** Round ids must be letters/digits only (they are part of sentence ids joined by "_"). */
export function newRoundId(): string {
  return 'r' + randomToken(6);
}

export function sentenceId(roundId: string, playerId: string, slot: number): string {
  return `${roundId}_${playerId}_${slot}`;
}

export function voteId(sentenceId: string, playerId: string): string {
  return `${sentenceId}_${playerId}`;
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
