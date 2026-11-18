import type { Timestamp } from 'firebase/firestore';

export type Team = 'A' | 'B';
export type Phase = 'lobby' | 'writing' | 'review' | 'leaderboard';
export type SentenceStep = 'present' | 'voting' | 'scoring' | 'revealed';
export type Score = 0 | 1 | 2;
export type VoteTally = { 0: number; 1: number; 2: number };

export interface Challenge {
  name: string;
  example: string;
}

export interface TableRow {
  aspect: string;
  left: string;
  right: string;
}

export interface RoundConfig {
  id: string; // letters/digits only, never "_"
  title: string;
  brief: string;
  type: 'choice' | 'table';
  options: [string, string]; // for "choice"
  aspects: string[]; // aspect chips for "choice"
  leftLabel: string;
  rightLabel: string;
  table: TableRow[]; // for "table"
  frames: string[];
  challenges: Challenge[];
  timerSeconds: number;
  maxPerStudent: number;
  closingLine: string;
}

export interface Room {
  code: string;
  hostUid: string;
  phase: Phase;
  currentRoundId: string | null;
  rounds: Record<string, RoundConfig>;
  roundOrder: string[];
  timerEndsAt: Timestamp | null;
  currentSentenceId: string | null;
  sentenceStep: SentenceStep | null;
  liveVoteCount: number;
  eligibleVoters: number;
  reviewQueue: string[];
  pinnedIds: string[];
  joinOpen: boolean;
  rejoinOpen: boolean;
  rejoinToken: string | null;
  rejoinExpiresAt: Timestamp | null;
  showWallLive: boolean;
  showDeletions: boolean;
  /** Hide the author's name until the reveal. Default (missing / false): shown. */
  hideAuthor?: boolean;
  /** Table rounds: students join without a team and pick a side after reading the table. */
  pickTeamLater?: boolean;
  teamNames: { A: string; B: string };
  hostSeenAt?: Timestamp | null;
  createdAt: Timestamp | null;
}

export interface Player {
  id: string; // playerId (doc id)
  nickname: string;
  team: Team;
  joinedAt: Timestamp | null;
  lastSeenAt: Timestamp | null;
  currentUid: string;
  /** The table round in which this player last chose their side (team). */
  sideRound?: string;
}

export interface Sentence {
  id: string;
  roundId: string;
  slot: number;
  authorPlayerId: string;
  authorNickname: string;
  team: Team;
  originalText: string;
  correctedText: string | null;
  teacherScore: Score | null;
  voteTally: VoteTally | null;
  studentAvg: number | null;
  finalScore: number | null;
  locked: boolean;
  challenge: boolean;
  createdAt: Timestamp | null;
}

export interface Vote {
  sentenceId: string;
  playerId: string;
  value: Score;
}

export interface Member {
  playerId: string;
  revoked: boolean;
}

export interface RejoinRequest {
  id: string; // requester uid
  playerId: string;
  token: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Timestamp | null;
}
