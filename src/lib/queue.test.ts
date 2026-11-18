import { describe, expect, it } from 'vitest';
import { buildReviewQueue } from './queue';

describe('buildReviewQueue', () => {
  it('reviews one sentence per student before anyone gets a second', () => {
    const items = [
      { id: 'a1', authorPlayerId: 'a', slot: 1 },
      { id: 'a2', authorPlayerId: 'a', slot: 2 },
      { id: 'a3', authorPlayerId: 'a', slot: 3 },
      { id: 'b1', authorPlayerId: 'b', slot: 1 },
      { id: 'c1', authorPlayerId: 'c', slot: 1 },
      { id: 'c2', authorPlayerId: 'c', slot: 2 },
    ];
    for (let run = 0; run < 20; run++) {
      const q = buildReviewQueue(items);
      expect(q).toHaveLength(6);
      expect(new Set(q.slice(0, 3).map((id) => id[0]))).toEqual(new Set(['a', 'b', 'c']));
      expect(new Set(q.slice(3, 5).map((id) => id[0]))).toEqual(new Set(['a', 'c']));
      expect(q[5][0]).toBe('a');
    }
  });

  it('handles an empty round', () => {
    expect(buildReviewQueue([])).toEqual([]);
  });
});
