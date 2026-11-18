import type { Score, Team, VoteTally } from './types';

/** The minimum a sentence needs for scoring. */
export interface ScorableSentence {
  authorPlayerId: string;
  authorNickname: string;
  team: Team;
  finalScore: number | null;
  locked: boolean;
  challenge: boolean;
}

export const EMPTY_TALLY: VoteTally = { 0: 0, 1: 0, 2: 0 };

export function tallyVotes(values: Iterable<number>): VoteTally {
  const t: VoteTally = { 0: 0, 1: 0, 2: 0 };
  for (const v of values) {
    if (v === 0 || v === 1 || v === 2) t[v] += 1;
  }
  return t;
}

export function totalVotes(t: VoteTally): number {
  return t[0] + t[1] + t[2];
}

/** Mean of the student votes (0..2), or null when nobody voted. */
export function studentAverage(t: VoteTally): number | null {
  const n = totalVotes(t);
  if (n === 0) return null;
  return (t[1] * 1 + t[2] * 2) / n;
}

/** finalScore = 0.5 * studentAvg + 0.5 * teacherScore; with zero votes, finalScore = teacherScore. */
export function finalScore(t: VoteTally, teacherScore: Score): number {
  const avg = studentAverage(t);
  if (avg === null) return teacherScore;
  return round4(0.5 * avg + 0.5 * teacherScore);
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function fmt2(n: number | null | undefined): string {
  return n === null || n === undefined ? '-' : n.toFixed(2);
}

export interface TeamScore {
  team: Team;
  score: number | null; // average finalScore over locked sentences, null when none
  counted: number; // number of locked sentences counted
  stars: number;
}

export function teamScore(sentences: ScorableSentence[], team: Team): TeamScore {
  const locked = sentences.filter((s) => s.team === team && s.locked && typeof s.finalScore === 'number');
  const sum = locked.reduce((acc, s) => acc + (s.finalScore as number), 0);
  return {
    team,
    score: locked.length ? round4(sum / locked.length) : null,
    counted: locked.length,
    stars: locked.filter((s) => s.challenge).length,
  };
}

export interface Standings {
  A: TeamScore;
  B: TeamScore;
  winner: Team | null; // null = perfect tie (or nothing scored)
  decidedBy: 'score' | 'stars' | 'count' | 'tie';
}

/** Compare teams: higher average wins; tie-break more stars, then more locked sentences. */
export function standings(sentences: ScorableSentence[]): Standings {
  const A = teamScore(sentences, 'A');
  const B = teamScore(sentences, 'B');
  const a = A.score ?? -1;
  const b = B.score ?? -1;
  if (A.counted === 0 && B.counted === 0) return { A, B, winner: null, decidedBy: 'tie' };
  if (Math.abs(a - b) > 1e-9) return { A, B, winner: a > b ? 'A' : 'B', decidedBy: 'score' };
  if (A.stars !== B.stars) return { A, B, winner: A.stars > B.stars ? 'A' : 'B', decidedBy: 'stars' };
  if (A.counted !== B.counted) return { A, B, winner: A.counted > B.counted ? 'A' : 'B', decidedBy: 'count' };
  return { A, B, winner: null, decidedBy: 'tie' };
}

export interface EmployeeOfMonth {
  playerId: string;
  nickname: string;
  team: Team;
  total: number;
}

/** The student with the highest total of final scores over locked sentences. */
export function employeeOfMonth(sentences: ScorableSentence[]): EmployeeOfMonth | null {
  const totals = new Map<string, EmployeeOfMonth>();
  for (const s of sentences) {
    if (!s.locked || typeof s.finalScore !== 'number') continue;
    const cur = totals.get(s.authorPlayerId) ?? {
      playerId: s.authorPlayerId,
      nickname: s.authorNickname,
      team: s.team,
      total: 0,
    };
    cur.total = round4(cur.total + s.finalScore);
    totals.set(s.authorPlayerId, cur);
  }
  let best: EmployeeOfMonth | null = null;
  for (const e of totals.values()) if (!best || e.total > best.total) best = e;
  return best;
}

export function stampFor(score: number): 'REJECTED' | 'MAYBE' | 'HIRED' {
  if (score >= 1.5) return 'HIRED';
  if (score >= 0.75) return 'MAYBE';
  return 'REJECTED';
}
