import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { teamNamesFromRounds } from '../config/brand';
import { offsetFrom, serverNow, setServerOffset } from './clock';
import { fb } from './firebase';
import { randomPin, randomRoomCode, randomToken, sentenceId as makeSentenceId, voteId as makeVoteId } from './ids';
import { buildReviewQueue } from './queue';
import { finalScore, studentAverage, tallyVotes } from './scoring';
import type { Player, RejoinRequest, Room, RoundConfig, Score, Sentence, Team } from './types';

const rRoom = (db: Firestore, roomId: string) => doc(db, 'rooms', roomId);
const rSub = (db: Firestore, roomId: string, coll: string, id: string) => doc(db, 'rooms', roomId, coll, id);

export function isPermissionError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'permission-denied';
}

// ---------------------------------------------------------------- host: rooms

export async function createRoom(uid: string, rounds: RoundConfig[]): Promise<{ code: string; pin: string }> {
  const { db } = fb();
  const roundsMap: Record<string, RoundConfig> = {};
  rounds.forEach((r) => (roundsMap[r.id] = r));
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomRoomCode();
    const pin = randomPin();
    const room: Omit<Room, 'createdAt' | 'timerEndsAt' | 'rejoinExpiresAt'> & Record<string, unknown> = {
      code,
      hostUid: uid,
      phase: 'lobby',
      currentRoundId: null,
      rounds: roundsMap,
      roundOrder: rounds.map((r) => r.id),
      timerEndsAt: null,
      currentSentenceId: null,
      sentenceStep: null,
      liveVoteCount: 0,
      eligibleVoters: 0,
      reviewQueue: [],
      pinnedIds: [],
      joinOpen: true,
      rejoinOpen: false,
      rejoinToken: null,
      rejoinExpiresAt: null,
      showWallLive: false,
      showDeletions: true,
      hideAuthor: false,
      pickTeamLater: rounds[0]?.type === 'table',
      teamNames: teamNamesFromRounds(rounds),
      createdAt: serverTimestamp(),
    };
    const b = writeBatch(db);
    b.set(rRoom(db, code), room);
    b.set(doc(db, 'roomSecrets', code), { pin });
    try {
      await b.commit();
      rememberHostedRoom(code);
      return { code, pin };
    } catch (e) {
      if (!isPermissionError(e)) throw e; // code already taken -> try another one
    }
  }
  throw new Error('Could not find a free room code. Please try again.');
}

/** Take the main screen back on a new browser with the room code + host PIN. */
export async function claimHost(roomId: string, uid: string, pin: string): Promise<void> {
  const { db } = fb();
  const snap = await getDoc(rRoom(db, roomId));
  if (!snap.exists()) throw new Error('No room with that code.');
  try {
    await setDoc(rSub(db, roomId, 'hostClaims', uid), { pin, claimedAt: serverTimestamp() });
  } catch (e) {
    if (isPermissionError(e)) throw new Error('That PIN does not match this room.');
    throw e;
  }
  await updateDoc(rRoom(db, roomId), { hostUid: uid });
  rememberHostedRoom(roomId);
}

const HOSTED_KEY = 'hirer.hostedRooms';
export function rememberHostedRoom(code: string) {
  try {
    const list = hostedRooms().filter((c) => c !== code);
    localStorage.setItem(HOSTED_KEY, JSON.stringify([code, ...list].slice(0, 6)));
  } catch {
    /* ignore */
  }
}
export function hostedRooms(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HOSTED_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateRoom(roomId: string, patch: Record<string, any>) {
  const { db } = fb();
  await updateDoc(rRoom(db, roomId), patch);
}

/** Host clock sync: write a server timestamp on the room and read it back. */
export async function syncHostClock(roomId: string) {
  const { db } = fb();
  const t0 = Date.now();
  await updateDoc(rRoom(db, roomId), { hostSeenAt: serverTimestamp() });
  const snap = await getDoc(rRoom(db, roomId));
  const t1 = Date.now();
  const ts = snap.get('hostSeenAt') as Timestamp | null;
  if (ts) setServerOffset(offsetFrom(ts.toMillis(), t0, t1));
}

export async function startRound(room: Room, roundId: string) {
  const r = room.rounds[roundId];
  await updateRoom(room.code, {
    phase: 'writing',
    currentRoundId: roundId,
    teamNames: teamNamesFromRounds([r]), // the two teams are the two sides of this round
    pickTeamLater: r.type === 'table', // table round: students read first, then pick a side
    sideKey: `${roundId}~${Date.now().toString(36)}`, // new key each run: sides are chosen again
    timerEndsAt: Timestamp.fromMillis(serverNow() + r.timerSeconds * 1000),
    currentSentenceId: null,
    sentenceStep: null,
    reviewQueue: [],
    pinnedIds: [],
    liveVoteCount: 0,
    joinOpen: false, // brand-new players can only join in the lobby (teacher can reopen)
    showWallLive: false,
  });
}

export async function addTime(room: Room, seconds: number) {
  const base = Math.max(serverNow(), room.timerEndsAt?.toMillis() ?? 0);
  await updateRoom(room.code, { timerEndsAt: Timestamp.fromMillis(base + seconds * 1000) });
}

export async function endWritingNow(room: Room) {
  await updateRoom(room.code, { timerEndsAt: Timestamp.fromMillis(serverNow() - 500) });
}

export async function startReview(room: Room, sentences: Sentence[]) {
  const roundSentences = sentences.filter((s) => s.roundId === room.currentRoundId);
  const queue = buildReviewQueue(
    roundSentences.map((s) => ({ id: s.id, authorPlayerId: s.authorPlayerId, slot: s.slot })),
  );
  const first = queue.find((id) => !roundSentences.find((s) => s.id === id)?.locked) ?? null;
  await updateRoom(room.code, {
    phase: 'review',
    timerEndsAt: Timestamp.fromMillis(Math.min(room.timerEndsAt?.toMillis() ?? 0, serverNow() - 500)),
    reviewQueue: queue,
    currentSentenceId: first,
    sentenceStep: first ? 'present' : null,
    liveVoteCount: 0,
  });
}

export async function goToSentence(room: Room, s: Sentence | undefined) {
  await updateRoom(room.code, {
    currentSentenceId: s?.id ?? null,
    sentenceStep: s ? (s.locked ? 'revealed' : 'present') : null,
    liveVoteCount: 0,
  });
}

export async function openVoting(room: Room, eligibleVoters: number) {
  await updateRoom(room.code, { sentenceStep: 'voting', liveVoteCount: 0, eligibleVoters });
}

export async function fetchVoteValues(roomId: string, sentenceId: string): Promise<number[]> {
  const { db } = fb();
  const snap = await getDocs(query(collection(db, 'rooms', roomId, 'votes'), where('sentenceId', '==', sentenceId)));
  return snap.docs.map((d) => d.get('value') as number);
}

/** Close voting: the host is the single writer of the tally. */
export async function closeVoting(room: Room, sentenceId: string) {
  const { db } = fb();
  // Stop new votes first, then count.
  await updateDoc(rRoom(db, room.code), { sentenceStep: 'scoring' });
  const values = await fetchVoteValues(room.code, sentenceId);
  const tally = tallyVotes(values);
  const b = writeBatch(db);
  b.update(rSub(db, room.code, 'sentences', sentenceId), { voteTally: tally, studentAvg: studentAverage(tally) });
  b.update(rRoom(db, room.code), { liveVoteCount: values.length });
  await b.commit();
}

export async function setTeacherScore(roomId: string, sentenceId: string, score: Score | null) {
  const { db } = fb();
  await updateDoc(rSub(db, roomId, 'sentences', sentenceId), { teacherScore: score });
}

export async function setChallenge(roomId: string, sentenceId: string, on: boolean) {
  const { db } = fb();
  await updateDoc(rSub(db, roomId, 'sentences', sentenceId), { challenge: on });
}

export async function setCorrection(roomId: string, sentenceId: string, text: string | null) {
  const { db } = fb();
  await updateDoc(rSub(db, roomId, 'sentences', sentenceId), { correctedText: text });
}

export async function lockAndReveal(room: Room, s: Sentence) {
  const { db } = fb();
  if (s.teacherScore === null) throw new Error('Pick a score (0, 1 or 2) first.');
  let tally = s.voteTally;
  if (!tally) {
    // Voting was never closed explicitly: count now.
    tally = tallyVotes(await fetchVoteValues(room.code, s.id));
  }
  const b = writeBatch(db);
  b.update(rSub(db, room.code, 'sentences', s.id), {
    voteTally: tally,
    studentAvg: studentAverage(tally),
    finalScore: finalScore(tally, s.teacherScore),
    locked: true,
  });
  b.update(rRoom(db, room.code), { sentenceStep: 'revealed' });
  await b.commit();
}

export async function unlockSentence(room: Room, s: Sentence) {
  const { db } = fb();
  const b = writeBatch(db);
  b.update(rSub(db, room.code, 'sentences', s.id), { locked: false, finalScore: null });
  b.update(rRoom(db, room.code), { sentenceStep: 'scoring', currentSentenceId: s.id });
  await b.commit();
}

export async function movePlayerTeam(roomId: string, player: Player, team: Team, sentences: Sentence[]) {
  const { db } = fb();
  const b = writeBatch(db);
  b.update(rSub(db, roomId, 'players', player.id), { team });
  sentences
    .filter((s) => s.authorPlayerId === player.id)
    .forEach((s) => b.update(rSub(db, roomId, 'sentences', s.id), { team }));
  await b.commit();
}

// ---------------------------------------------------------------- host: rejoin

export async function openRejoin(roomId: string, minutes = 3) {
  await updateRoom(roomId, {
    rejoinOpen: true,
    rejoinToken: randomToken(),
    rejoinExpiresAt: Timestamp.fromMillis(serverNow() + minutes * 60_000),
  });
}

export async function extendRejoin(room: Room, minutes = 1) {
  const base = Math.max(serverNow(), room.rejoinExpiresAt?.toMillis() ?? 0);
  await updateRoom(room.code, { rejoinExpiresAt: Timestamp.fromMillis(base + minutes * 60_000) });
}

export async function closeRejoin(roomId: string) {
  await updateRoom(roomId, { rejoinOpen: false, rejoinToken: null, rejoinExpiresAt: null });
}

/** One batch: new uid -> old playerId, revoke the old uid, mark approved. */
export async function approveRejoin(roomId: string, req: RejoinRequest, player: Player) {
  const { db } = fb();
  const b = writeBatch(db);
  b.set(rSub(db, roomId, 'members', req.id), { playerId: req.playerId, revoked: false });
  if (player.currentUid && player.currentUid !== req.id) {
    b.set(rSub(db, roomId, 'members', player.currentUid), { revoked: true }, { merge: true });
  }
  b.update(rSub(db, roomId, 'players', req.playerId), { currentUid: req.id, lastSeenAt: serverTimestamp() });
  b.update(rSub(db, roomId, 'rejoinRequests', req.id), { status: 'approved' });
  await b.commit();
}

export async function denyRejoin(roomId: string, reqId: string) {
  const { db } = fb();
  await updateDoc(rSub(db, roomId, 'rejoinRequests', reqId), { status: 'denied' });
}

// ---------------------------------------------------------------- students

export type JoinError = 'closed' | 'taken' | 'no-room' | 'invalid';

export function cleanNickname(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\//g, '').trim();
}

/** The side key of the round being played (changes on every start of a round). */
export function currentSideKey(room: Pick<Room, 'sideKey' | 'currentRoundId'>): string | null {
  return room.sideKey ?? room.currentRoundId;
}

/** Table rounds: the student picks (or changes) a side after reading the table.
 *  Sentences already written this round move to the new side too. */
export async function chooseSide(roomId: string, playerId: string, team: Team, sideKey: string, sentenceIds: string[] = []) {
  const { db } = fb();
  const batch = writeBatch(db);
  batch.update(rSub(db, roomId, 'players', playerId), { team, sideRound: sideKey });
  sentenceIds.forEach((id) => batch.update(rSub(db, roomId, 'sentences', id), { team }));
  await batch.commit();
}

export async function joinRoom(roomId: string, uid: string, nicknameRaw: string, team: Team): Promise<void> {
  const { db } = fb();
  const nickname = cleanNickname(nicknameRaw);
  if (nickname.length < 2 || nickname.length > 16) throw Object.assign(new Error('invalid'), { kind: 'invalid' as JoinError });
  const room = await getDoc(rRoom(db, roomId));
  if (!room.exists()) throw Object.assign(new Error('no-room'), { kind: 'no-room' as JoinError });
  if (room.get('joinOpen') !== true) throw Object.assign(new Error('closed'), { kind: 'closed' as JoinError });
  const nickRef = rSub(db, roomId, 'nicknames', nickname.toLowerCase());
  if ((await getDoc(nickRef)).exists()) throw Object.assign(new Error('taken'), { kind: 'taken' as JoinError });
  const b = writeBatch(db);
  b.set(rSub(db, roomId, 'members', uid), { playerId: uid, revoked: false });
  b.set(rSub(db, roomId, 'players', uid), {
    nickname,
    team,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    currentUid: uid,
  });
  b.set(nickRef, { playerId: uid });
  try {
    await b.commit();
  } catch (e) {
    if (isPermissionError(e)) {
      const fresh = await getDoc(rRoom(db, roomId));
      const kind: JoinError = fresh.get('joinOpen') !== true ? 'closed' : 'taken';
      throw Object.assign(new Error(kind), { kind });
    }
    throw e;
  }
}

export async function heartbeat(roomId: string, playerId: string) {
  const { db } = fb();
  await updateDoc(rSub(db, roomId, 'players', playerId), { lastSeenAt: serverTimestamp() });
}

/** Student clock sync piggybacks on the heartbeat. */
export async function heartbeatAndSync(roomId: string, playerId: string) {
  const { db } = fb();
  const t0 = Date.now();
  await heartbeat(roomId, playerId);
  const snap = await getDoc(rSub(db, roomId, 'players', playerId));
  const t1 = Date.now();
  const ts = snap.get('lastSeenAt') as Timestamp | null;
  if (ts) setServerOffset(offsetFrom(ts.toMillis(), t0, t1));
}

export async function saveSentence(
  roomId: string,
  args: { roundId: string; player: Player; slot: number; text: string; exists: boolean },
  database?: Firestore,
) {
  const db = database ?? fb().db;
  const id = makeSentenceId(args.roundId, args.player.id, args.slot);
  const text = args.text.trim().slice(0, 200);
  if (args.exists) {
    await updateDoc(rSub(db, roomId, 'sentences', id), { originalText: text, updatedAt: serverTimestamp() });
  } else {
    await setDoc(rSub(db, roomId, 'sentences', id), {
      roundId: args.roundId,
      slot: args.slot,
      authorPlayerId: args.player.id,
      authorNickname: args.player.nickname,
      team: args.player.team,
      originalText: text,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function castVote(roomId: string, sentenceId: string, playerId: string, value: Score, database?: Firestore) {
  const db = database ?? fb().db;
  await setDoc(rSub(db, roomId, 'votes', makeVoteId(sentenceId, playerId)), {
    sentenceId,
    playerId,
    value,
    updatedAt: serverTimestamp(),
  });
}

export async function requestRejoin(roomId: string, uid: string, playerId: string, token: string) {
  const { db } = fb();
  const ref = rSub(db, roomId, 'rejoinRequests', uid);
  try {
    const existing = await getDoc(ref);
    if (existing.exists() && existing.get('status') !== 'approved') await deleteDoc(ref);
  } catch {
    /* no previous request */
  }
  await setDoc(ref, { playerId, token, status: 'pending', createdAt: serverTimestamp() });
}

export async function cancelRejoin(roomId: string, uid: string) {
  const { db } = fb();
  await deleteDoc(rSub(db, roomId, 'rejoinRequests', uid));
}
