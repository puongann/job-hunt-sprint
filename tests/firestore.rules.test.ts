import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

setLogLevel('silent');

const ROOM = 'ROOM';
const PIN = '123456';
let env: RulesTestEnvironment;

const asUser = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const inMinutes = (m: number) => Timestamp.fromMillis(Date.now() + m * 60_000);

const rounds = {
  r1: { id: 'r1', title: 'Round 1', maxPerStudent: 1 },
  r2: { id: 'r2', title: 'Round 2', maxPerStudent: 3 },
  t1: { id: 't1', title: 'Table round', type: 'table', maxPerStudent: 3 },
};

/** Seed a room in the writing phase with three students and a host. */
async function seed(roomOverrides: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'rooms', ROOM), {
      code: ROOM,
      hostUid: 'host',
      phase: 'writing',
      currentRoundId: 'r1',
      rounds,
      roundOrder: ['r1', 'r2'],
      timerEndsAt: inMinutes(5),
      currentSentenceId: null,
      sentenceStep: null,
      joinOpen: false,
      rejoinOpen: false,
      rejoinToken: null,
      rejoinExpiresAt: null,
      ...roomOverrides,
    });
    await setDoc(doc(db, 'roomSecrets', ROOM), { pin: PIN });
    for (const [pid, nick, team] of [
      ['p1', 'Mai', 'B'],
      ['p2', 'Long', 'A'],
      ['p3', 'Hana', 'A'],
    ]) {
      await setDoc(doc(db, `rooms/${ROOM}/players/${pid}`), {
        nickname: nick,
        team,
        joinedAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        currentUid: pid,
      });
      await setDoc(doc(db, `rooms/${ROOM}/members/${pid}`), { playerId: pid, revoked: false });
      await setDoc(doc(db, `rooms/${ROOM}/nicknames/${nick.toLowerCase()}`), { playerId: pid });
    }
    // An existing sentence by p1 (Mai) in round 1.
    await setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p1_1`), {
      roundId: 'r1',
      slot: 1,
      authorPlayerId: 'p1',
      authorNickname: 'Mai',
      team: 'B',
      originalText: 'A pilot is more rich that a nurse.',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setRoom(fields: Record<string, any>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'rooms', ROOM), fields);
  });
}

const sentence = (pid: string, nick: string, team: string, roundId: string, slot: number, text = 'It is better than that.') => ({
  roundId,
  slot,
  authorPlayerId: pid,
  authorNickname: nick,
  team,
  originalText: text,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

const votingOn = { phase: 'review', sentenceStep: 'voting', currentSentenceId: 'r1_p1_1' };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hirer',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('rooms and secrets', () => {
  it('lets a signed-in user create a room only together with its secret', async () => {
    const db = asUser('newhost');
    const expireAt = inMinutes(24 * 60);
    const lonely = writeBatch(db);
    lonely.set(doc(db, 'rooms', 'ABCD'), { code: 'ABCD', hostUid: 'newhost', phase: 'lobby', expireAt });
    await assertFails(lonely.commit());

    const b = writeBatch(db);
    b.set(doc(db, 'rooms', 'ABCD'), { code: 'ABCD', hostUid: 'newhost', phase: 'lobby', expireAt });
    b.set(doc(db, 'roomSecrets', 'ABCD'), { pin: '654321', expireAt });
    await assertSucceeds(b.commit());
  });

  it('a new room must expire within two days (TTL), and its secret with it', async () => {
    const db = asUser('newhost');
    const make = (roomExp: unknown, secretExp: unknown) => {
      const b = writeBatch(db);
      b.set(doc(db, 'rooms', 'EFGH'), { code: 'EFGH', hostUid: 'newhost', phase: 'lobby', ...(roomExp ? { expireAt: roomExp } : {}) });
      b.set(doc(db, 'roomSecrets', 'EFGH'), { pin: '654321', ...(secretExp ? { expireAt: secretExp } : {}) });
      return b.commit();
    };
    const day = inMinutes(24 * 60);
    await assertFails(make(null, null)); // no expiry
    await assertFails(make(inMinutes(5 * 24 * 60), inMinutes(5 * 24 * 60))); // too far away
    await assertFails(make(day, null)); // the secret would never be deleted
    await assertSucceeds(make(day, day));
  });

  it('rejects a room created for someone else, or an anonymous visitor', async () => {
    const db = asUser('newhost');
    const b = writeBatch(db);
    b.set(doc(db, 'rooms', 'WXYZ'), { code: 'WXYZ', hostUid: 'someoneelse', phase: 'lobby', expireAt: inMinutes(60) });
    b.set(doc(db, 'roomSecrets', 'WXYZ'), { pin: '654321', expireAt: inMinutes(60) });
    await assertFails(b.commit());
    await assertFails(getDoc(doc(anon(), 'rooms', ROOM)));
  });

  it('does not let anyone read roomSecrets, not even the host', async () => {
    await assertFails(getDoc(doc(asUser('p1'), 'roomSecrets', ROOM)));
    await assertFails(getDoc(doc(asUser('host'), 'roomSecrets', ROOM)));
  });

  it('does not let a student update the room', async () => {
    await assertFails(updateDoc(doc(asUser('p1'), 'rooms', ROOM), { phase: 'leaderboard' }));
    await assertFails(updateDoc(doc(asUser('p1'), 'rooms', ROOM), { hostUid: 'p1' }));
    await assertSucceeds(updateDoc(doc(asUser('host'), 'rooms', ROOM), { showWallLive: true }));
  });
});

describe('host recovery with the PIN', () => {
  it('rejects a host claim with the wrong PIN', async () => {
    const db = asUser('laptop2');
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/hostClaims/laptop2`), { pin: '000000' }));
    await assertFails(updateDoc(doc(db, 'rooms', ROOM), { hostUid: 'laptop2' }));
  });

  it('accepts the right PIN, then the claimant can take the room', async () => {
    const db = asUser('laptop2');
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/hostClaims/laptop2`), { pin: PIN }));
    await assertSucceeds(updateDoc(doc(db, 'rooms', ROOM), { hostUid: 'laptop2' }));
  });

  it('cannot claim for another uid, and claims are private', async () => {
    await assertFails(setDoc(doc(asUser('p1'), `rooms/${ROOM}/hostClaims/p2`), { pin: PIN }));
    await assertSucceeds(setDoc(doc(asUser('laptop2'), `rooms/${ROOM}/hostClaims/laptop2`), { pin: PIN }));
    await assertFails(getDoc(doc(asUser('p1'), `rooms/${ROOM}/hostClaims/laptop2`)));
    await assertSucceeds(getDoc(doc(asUser('laptop2'), `rooms/${ROOM}/hostClaims/laptop2`)));
  });
});

describe('joining', () => {
  const joinBatch = (uid: string, nickname: string, team = 'A') => {
    const db = asUser(uid);
    const b = writeBatch(db);
    b.set(doc(db, `rooms/${ROOM}/members/${uid}`), { playerId: uid, revoked: false });
    b.set(doc(db, `rooms/${ROOM}/players/${uid}`), {
      nickname,
      team,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      currentUid: uid,
    });
    b.set(doc(db, `rooms/${ROOM}/nicknames/${nickname.toLowerCase()}`), { playerId: uid });
    return b.commit();
  };

  it('rejects a brand-new player when joinOpen is false', async () => {
    await assertFails(joinBatch('newkid', 'Tuan'));
  });

  it('accepts a new player while joinOpen is true, with a unique nickname and a valid team', async () => {
    await setRoom({ joinOpen: true });
    await assertSucceeds(joinBatch('newkid', 'Tuan'));
    await assertFails(joinBatch('copycat', 'MAI')); // nickname taken (case-insensitive)
    await assertFails(joinBatch('teamless', 'Linh', 'C'));
    await assertFails(joinBatch('tiny', 'X'));
  });

  it('lets a student update only their own heartbeat', async () => {
    const db = asUser('p2');
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), { lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), { team: 'B' }));
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), { currentUid: 'evil' }));
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p1`), { lastSeenAt: serverTimestamp() }));
  });

  it('does not let a student forge a member doc for another player', async () => {
    await setRoom({ joinOpen: true });
    await assertFails(setDoc(doc(asUser('thief'), `rooms/${ROOM}/members/thief`), { playerId: 'p1', revoked: false }));
  });
});

describe('sentences', () => {
  it('accepts slot 1 in round 1 and rejects extra slots (2 and 3)', async () => {
    const db = asUser('p2');
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1)));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_2`), sentence('p2', 'Long', 'A', 'r1', 2)));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_3`), sentence('p2', 'Long', 'A', 'r1', 3)));
  });

  it('accepts slot 3 in round 2 but not slot 4', async () => {
    await setRoom({ currentRoundId: 'r2' });
    const db = asUser('p2');
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/sentences/r2_p2_3`), sentence('p2', 'Long', 'A', 'r2', 3)));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r2_p2_4`), sentence('p2', 'Long', 'A', 'r2', 4)));
  });

  it('rejects late sentences (timer over) and sentences outside writing', async () => {
    await setRoom({ timerEndsAt: Timestamp.fromMillis(Date.now() - 1000) });
    const db = asUser('p2');
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1)));
    await assertFails(updateDoc(doc(asUser('p1'), `rooms/${ROOM}/sentences/r1_p1_1`), { originalText: 'Too late' }));
    await setRoom({ timerEndsAt: inMinutes(5), phase: 'review' });
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1)));
  });

  it('rejects sentences in someone else\'s name, wrong team, wrong round, or bad length', async () => {
    const db = asUser('p2');
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p3_1`), sentence('p3', 'Hana', 'A', 'r1', 1)));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'B', 'r1', 1)));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r2_p2_1`), sentence('p2', 'Long', 'A', 'r2', 1)));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1, '')));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1, 'x'.repeat(201))));
  });

  it('never lets a student write a score, correction, lock or challenge star', async () => {
    const db = asUser('p1');
    const ref = doc(db, `rooms/${ROOM}/sentences/r1_p1_1`);
    await assertSucceeds(updateDoc(ref, { originalText: 'A pilot is richer than a nurse.' }));
    for (const field of [
      { teacherScore: 2 },
      { finalScore: 2 },
      { voteTally: { 0: 0, 1: 0, 2: 9 } },
      { studentAvg: 2 },
      { locked: true },
      { challenge: true },
      { correctedText: 'Perfect.' },
    ]) {
      await assertFails(updateDoc(ref, field));
    }
    // Not even when creating a new sentence.
    await assertFails(
      setDoc(doc(asUser('p2'), `rooms/${ROOM}/sentences/r1_p2_1`), { ...sentence('p2', 'Long', 'A', 'r1', 1), challenge: true }),
    );
    await assertSucceeds(updateDoc(doc(asUser('host'), `rooms/${ROOM}/sentences/r1_p1_1`), { teacherScore: 2, challenge: true }));
  });
});

describe('table rounds: pick a side after reading', () => {
  const side = (team: string, round = 't1') => ({ team, sideRound: round });

  it('lets a student pick and change their side in a table round while writing is open', async () => {
    await setRoom({ currentRoundId: 't1' });
    const db = asUser('p2');
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B')));
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('A'))); // changed their mind
  });

  it('a re-run of the round (new side key) needs a new choice, with that key', async () => {
    await setRoom({ currentRoundId: 't1', sideKey: 't1~run1' });
    const db = asUser('p2');
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B'))); // old-style key
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B', 't1~run1')));
    await setRoom({ sideKey: 't1~run2' });
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), sentence('p2', 'Long', 'B', 't1', 1)));
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('A', 't1~run2')));
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), sentence('p2', 'Long', 'A', 't1', 1)));
  });

  it('moving to the other side moves my sentences too, only together with the side change', async () => {
    await setRoom({ currentRoundId: 't1' });
    const db = asUser('p2');
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B')));
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), sentence('p2', 'Long', 'B', 't1', 1)));
    // the sentence alone cannot switch team
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), { team: 'A' }));
    const batch = writeBatch(db);
    batch.update(doc(db, `rooms/${ROOM}/players/p2`), side('A'));
    batch.update(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), { team: 'A' });
    await assertSucceeds(batch.commit());
  });

  it('rejects side changes outside table rounds, after the timer, for someone else, or with other fields', async () => {
    const db = asUser('p2');
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B', 'r1'))); // r1 is not a table round
    await setRoom({ currentRoundId: 't1', timerEndsAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B')));
    await setRoom({ timerEndsAt: inMinutes(5) });
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p1`), side('A'))); // not me
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('C')));
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), { ...side('B'), nickname: 'Boss' }));
    await assertFails(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B', 'r2'))); // wrong round
  });

  it('only accepts a table-round sentence after the side is chosen, with that team', async () => {
    await setRoom({ currentRoundId: 't1' });
    const db = asUser('p2');
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), sentence('p2', 'Long', 'A', 't1', 1)));
    await assertSucceeds(updateDoc(doc(db, `rooms/${ROOM}/players/p2`), side('B')));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), sentence('p2', 'Long', 'A', 't1', 1)));
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/sentences/t1_p2_1`), sentence('p2', 'Long', 'B', 't1', 1)));
  });
});

describe('TTL: every doc carries the room expiry', () => {
  it('student docs must copy the room expireAt exactly', async () => {
    const exp = inMinutes(24 * 60);
    await setRoom({ joinOpen: true, expireAt: exp });
    const join = (uid: string, nick: string, e: unknown) => {
      const db = asUser(uid);
      const x = e ? { expireAt: e } : {};
      const b = writeBatch(db);
      b.set(doc(db, `rooms/${ROOM}/members/${uid}`), { playerId: uid, revoked: false, ...x });
      b.set(doc(db, `rooms/${ROOM}/players/${uid}`), { nickname: nick, team: 'A', joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), currentUid: uid, ...x });
      b.set(doc(db, `rooms/${ROOM}/nicknames/${nick.toLowerCase()}`), { playerId: uid, ...x });
      return b.commit();
    };
    await assertFails(join('k1', 'Kim', null));
    await assertFails(join('k1', 'Kim', inMinutes(99 * 60)));
    await assertSucceeds(join('k1', 'Kim', exp));
    const db = asUser('p2');
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1)));
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), { ...sentence('p2', 'Long', 'A', 'r1', 1), expireAt: exp }));
    await setRoom(votingOn);
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/votes/r1_p1_1_p2`), { sentenceId: 'r1_p1_1', playerId: 'p2', value: 2 }));
    await assertSucceeds(
      setDoc(doc(db, `rooms/${ROOM}/votes/r1_p1_1_p2`), { sentenceId: 'r1_p1_1', playerId: 'p2', value: 2, expireAt: exp }),
    );
  });
});

describe('votes', () => {
  const vote = (db: Firestore, pid: string, value: number, sentenceId = 'r1_p1_1') =>
    setDoc(doc(db, `rooms/${ROOM}/votes/${sentenceId}_${pid}`), { sentenceId, playerId: pid, value });

  it('rejects a self-vote but accepts other students', async () => {
    await setRoom(votingOn);
    await assertFails(vote(asUser('p1'), 'p1', 2));
    await assertSucceeds(vote(asUser('p2'), 'p2', 2));
    await assertSucceeds(vote(asUser('p2'), 'p2', 0)); // can change the vote
  });

  it('rejects votes outside the voting step or on a non-current sentence', async () => {
    await setRoom({ ...votingOn, sentenceStep: 'present' });
    await assertFails(vote(asUser('p2'), 'p2', 2));
    await setRoom({ ...votingOn, sentenceStep: 'scoring' });
    await assertFails(vote(asUser('p2'), 'p2', 2));
    await setRoom({ ...votingOn, phase: 'writing' });
    await assertFails(vote(asUser('p2'), 'p2', 2));
    await setRoom({ ...votingOn, currentSentenceId: 'r1_p3_1' });
    await assertFails(vote(asUser('p2'), 'p2', 2));
  });

  it('rejects forged votes, bad values, and deletes', async () => {
    await setRoom(votingOn);
    await assertFails(vote(asUser('p2'), 'p3', 2)); // in another player's name
    await assertFails(vote(asUser('p2'), 'p2', 3));
    await assertFails(vote(asUser('outsider'), 'outsider', 2));
    await assertSucceeds(vote(asUser('p2'), 'p2', 1));
    await assertFails(deleteDoc(doc(asUser('p2'), `rooms/${ROOM}/votes/r1_p1_1_p2`)));
  });

  it('lets only the voter and the host read a vote', async () => {
    await setRoom(votingOn);
    await assertSucceeds(vote(asUser('p2'), 'p2', 1));
    await assertSucceeds(getDoc(doc(asUser('p2'), `rooms/${ROOM}/votes/r1_p1_1_p2`)));
    await assertSucceeds(getDoc(doc(asUser('host'), `rooms/${ROOM}/votes/r1_p1_1_p2`)));
    await assertFails(getDoc(doc(asUser('p3'), `rooms/${ROOM}/votes/r1_p1_1_p2`)));
  });
});

describe('teacher-approved rejoin', () => {
  const request = (uid: string, token: string, playerId = 'p1') =>
    setDoc(doc(asUser(uid), `rooms/${ROOM}/rejoinRequests/${uid}`), {
      playerId,
      token,
      status: 'pending',
      createdAt: serverTimestamp(),
    });

  it('rejects a request when the window is closed', async () => {
    await setRoom({ rejoinOpen: false, rejoinToken: 'tok', rejoinExpiresAt: inMinutes(3) });
    await assertFails(request('newphone', 'tok'));
  });

  it('rejects a request when the window expired', async () => {
    await setRoom({ rejoinOpen: true, rejoinToken: 'tok', rejoinExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(request('newphone', 'tok'));
  });

  it('rejects a wrong token or an unknown player, accepts a valid request', async () => {
    await setRoom({ rejoinOpen: true, rejoinToken: 'tok', rejoinExpiresAt: inMinutes(3) });
    await assertFails(request('newphone', 'nope'));
    await assertFails(request('newphone', 'tok', 'ghost'));
    await assertSucceeds(request('newphone', 'tok'));
    // The requester cannot approve themselves.
    await assertFails(updateDoc(doc(asUser('newphone'), `rooms/${ROOM}/rejoinRequests/newphone`), { status: 'approved' }));
    await assertFails(getDoc(doc(asUser('p2'), `rooms/${ROOM}/rejoinRequests/newphone`)));
  });

  it('after approval the new uid acts as the old player, but still cannot self-vote; the old uid is revoked', async () => {
    await setRoom({ rejoinOpen: true, rejoinToken: 'tok', rejoinExpiresAt: inMinutes(3) });
    await assertSucceeds(request('newphone', 'tok'));

    // Host approval batch.
    const host = asUser('host');
    const b = writeBatch(host);
    b.set(doc(host, `rooms/${ROOM}/members/newphone`), { playerId: 'p1', revoked: false });
    b.update(doc(host, `rooms/${ROOM}/members/p1`), { revoked: true });
    b.update(doc(host, `rooms/${ROOM}/players/p1`), { currentUid: 'newphone' });
    b.update(doc(host, `rooms/${ROOM}/rejoinRequests/newphone`), { status: 'approved' });
    await assertSucceeds(b.commit());

    // The new phone edits Mai's own sentence slot and heartbeat.
    const phone = asUser('newphone');
    await assertSucceeds(updateDoc(doc(phone, `rooms/${ROOM}/sentences/r1_p1_1`), { originalText: 'A pilot is richer than a nurse.' }));
    await assertSucceeds(updateDoc(doc(phone, `rooms/${ROOM}/players/p1`), { lastSeenAt: serverTimestamp() }));

    // The old uid is revoked.
    const old = asUser('p1');
    await assertFails(updateDoc(doc(old, `rooms/${ROOM}/sentences/r1_p1_1`), { originalText: 'Old phone' }));
    await assertFails(updateDoc(doc(old, `rooms/${ROOM}/players/p1`), { lastSeenAt: serverTimestamp() }));

    // Voting: the new phone is still Mai, so it cannot vote on Mai's sentence; neither can the old phone.
    await setRoom(votingOn);
    await assertFails(setDoc(doc(phone, `rooms/${ROOM}/votes/r1_p1_1_p1`), { sentenceId: 'r1_p1_1', playerId: 'p1', value: 2 }));
    await assertFails(setDoc(doc(phone, `rooms/${ROOM}/votes/r1_p1_1_newphone`), { sentenceId: 'r1_p1_1', playerId: 'newphone', value: 2 }));
    await assertFails(setDoc(doc(old, `rooms/${ROOM}/votes/r1_p1_1_p1`), { sentenceId: 'r1_p1_1', playerId: 'p1', value: 2 }));

    // And it can vote as Mai on someone else's sentence (no second identity).
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, `rooms/${ROOM}/sentences/r1_p2_1`), sentence('p2', 'Long', 'A', 'r1', 1));
    });
    await setRoom({ ...votingOn, currentSentenceId: 'r1_p2_1' });
    await assertSucceeds(setDoc(doc(phone, `rooms/${ROOM}/votes/r1_p2_1_p1`), { sentenceId: 'r1_p2_1', playerId: 'p1', value: 2 }));
    await assertFails(setDoc(doc(phone, `rooms/${ROOM}/votes/r1_p2_1_newphone`), { sentenceId: 'r1_p2_1', playerId: 'newphone', value: 2 }));
  });

  it('does not let a student approve a rejoin or revoke someone', async () => {
    await assertFails(setDoc(doc(asUser('p2'), `rooms/${ROOM}/members/p2x`), { playerId: 'p1', revoked: false }));
    await assertFails(updateDoc(doc(asUser('p2'), `rooms/${ROOM}/members/p1`), { revoked: true }));
  });
});
