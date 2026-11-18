import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUNDS, parseRounds } from './rounds';

describe('round templates', () => {
  it('round-trips the seeded rounds through export/import parsing', () => {
    const parsed = parseRounds(JSON.parse(JSON.stringify({ rounds: DEFAULT_ROUNDS })));
    expect(parsed).toEqual(DEFAULT_ROUNDS);
  });

  it('seeds Round 2 with four challenge structures and Round 1 with none', () => {
    expect(DEFAULT_ROUNDS[0].challenges).toHaveLength(0);
    expect(DEFAULT_ROUNDS[1].challenges.map((c) => c.name)).toHaveLength(4);
  });

  it('sanitises ids and clamps numbers', () => {
    const [r] = parseRounds([{ id: 'a_b', maxPerStudent: 99, timerSeconds: -5 }]);
    expect(r.id).toBe('ab');
    expect(r.maxPerStudent).toBe(5);
    expect(r.timerSeconds).toBe(15);
  });

  it('rejects garbage', () => {
    expect(() => parseRounds({ nope: true })).toThrow();
  });
});
