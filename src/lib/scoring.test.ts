import { describe, expect, it } from 'vitest';
import { employeeOfMonth, finalScore, standings, studentAverage, tallyVotes, teamScore, type ScorableSentence } from './scoring';

const s = (p: Partial<ScorableSentence>): ScorableSentence => ({
  authorPlayerId: 'p1',
  authorNickname: 'Mai',
  team: 'A',
  finalScore: null,
  locked: false,
  challenge: false,
  ...p,
});

describe('scoring', () => {
  it('matches the worked example: votes {0:2,1:3,2:9}, teacher 2 -> 1.75', () => {
    const t = { 0: 2, 1: 3, 2: 9 };
    expect(studentAverage(t)).toBe(1.5);
    expect(finalScore(t, 2)).toBe(1.75);
  });

  it('uses teacherScore when nobody voted', () => {
    expect(finalScore({ 0: 0, 1: 0, 2: 0 }, 1)).toBe(1);
    expect(studentAverage({ 0: 0, 1: 0, 2: 0 })).toBeNull();
  });

  it('tallies vote values', () => {
    expect(tallyVotes([0, 2, 2, 1, 2])).toEqual({ 0: 1, 1: 1, 2: 3 });
  });

  it('team score averages only locked sentences and counts them', () => {
    const list = [
      s({ team: 'A', locked: true, finalScore: 2 }),
      s({ team: 'A', locked: true, finalScore: 1 }),
      s({ team: 'A', locked: false, finalScore: null }),
      s({ team: 'A', locked: false, finalScore: 0 }), // unlocked: excluded even with a value
    ];
    expect(teamScore(list, 'A')).toEqual({ team: 'A', score: 1.5, counted: 2, stars: 0 });
    expect(teamScore(list, 'B').score).toBeNull();
  });

  it('stars never change the score but break ties, then locked count', () => {
    const star = s({ team: 'A', locked: true, finalScore: 1.75, challenge: true });
    const plain = s({ team: 'A', locked: true, finalScore: 1.75, challenge: false });
    expect(teamScore([star], 'A').score).toBe(teamScore([plain], 'A').score);
    const tieStars = standings([star, s({ team: 'B', locked: true, finalScore: 1.75 })]);
    expect(tieStars.winner).toBe('A');
    expect(tieStars.decidedBy).toBe('stars');
    const tieCount = standings([
      s({ team: 'A', locked: true, finalScore: 1 }),
      s({ team: 'B', locked: true, finalScore: 1 }),
      s({ team: 'B', locked: true, finalScore: 1 }),
    ]);
    expect(tieCount.winner).toBe('B');
    expect(tieCount.decidedBy).toBe('count');
    expect(standings([]).winner).toBeNull();
  });

  it('picks the employee of the month by total final score', () => {
    const e = employeeOfMonth([
      s({ authorPlayerId: 'a', authorNickname: 'Long', locked: true, finalScore: 1.5 }),
      s({ authorPlayerId: 'a', authorNickname: 'Long', locked: true, finalScore: 1.5 }),
      s({ authorPlayerId: 'b', authorNickname: 'Hana', locked: true, finalScore: 2 }),
    ]);
    expect(e?.nickname).toBe('Long');
    expect(e?.total).toBe(3);
  });
});
