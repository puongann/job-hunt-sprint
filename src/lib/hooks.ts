import { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { serverNow } from './clock';
import { ensureSignedIn, fb } from './firebase';
import type { Member, Player, RejoinRequest, Room, Sentence, Vote } from './types';

export type Loadable<T> = { data: T; loading: boolean; error: string | null };

export function useAuthUid(): { uid: string | null; error: string | null } {
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    ensureSignedIn()
      .then((u) => alive && setUid(u))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  return { uid, error };
}

function useDoc<T>(path: string[] | null, map: (id: string, d: DocumentData) => T): Loadable<T | null> {
  const key = path?.join('/') ?? '';
  // `forKey` records which path the data belongs to, so a new path reads as "loading"
  // on the very first render (no flash of "missing" before the listener answers).
  const [state, setState] = useState<{ forKey: string; data: T | null; error: string | null }>({ forKey: '', data: null, error: null });
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(() => {
    if (!key) return;
    const { db } = fb();
    return onSnapshot(
      doc(db, key),
      (snap) => setState({ forKey: key, data: snap.exists() ? mapRef.current(snap.id, snap.data()) : null, error: null }),
      (e) => setState({ forKey: key, data: null, error: e.message }),
    );
  }, [key]);
  if (!key) return { data: null, loading: false, error: null };
  if (state.forKey !== key) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}

function useCollection<T>(
  path: string[] | null,
  constraints: QueryConstraint[],
  constraintsKey: string,
  map: (id: string, d: DocumentData) => T,
): Loadable<T[]> {
  const key = path ? `${path.join('/')}?${constraintsKey}` : '';
  const [state, setState] = useState<{ forKey: string; data: T[]; error: string | null }>({ forKey: '', data: [], error: null });
  const mapRef = useRef(map);
  mapRef.current = map;
  const cRef = useRef(constraints);
  cRef.current = constraints;
  const collPath = path?.join('/') ?? '';
  useEffect(() => {
    if (!key) return;
    const { db } = fb();
    return onSnapshot(
      query(collection(db, collPath), ...cRef.current),
      (snap) => setState({ forKey: key, data: snap.docs.map((d) => mapRef.current(d.id, d.data())), error: null }),
      (e) => setState({ forKey: key, data: [], error: e.message }),
    );
  }, [key, collPath]);
  if (!key) return { data: [], loading: false, error: null };
  if (state.forKey !== key) return { data: [], loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}

export const toRoom = (_id: string, d: DocumentData) => d as Room;
export const toPlayer = (id: string, d: DocumentData): Player => ({ id, ...(d as Omit<Player, 'id'>) });
export const toSentence = (id: string, d: DocumentData): Sentence => ({
  id,
  roundId: d.roundId,
  slot: d.slot ?? 1,
  authorPlayerId: d.authorPlayerId,
  authorNickname: d.authorNickname ?? '',
  team: d.team,
  originalText: d.originalText ?? '',
  correctedText: d.correctedText ?? null,
  teacherScore: d.teacherScore ?? null,
  voteTally: d.voteTally ?? null,
  studentAvg: d.studentAvg ?? null,
  finalScore: d.finalScore ?? null,
  locked: d.locked === true,
  challenge: d.challenge === true,
  createdAt: d.createdAt ?? null,
});

export function useRoom(roomId: string | undefined, enabled = true) {
  return useDoc<Room>(roomId && enabled ? ['rooms', roomId] : null, toRoom);
}

export function usePlayers(roomId: string | undefined, enabled = true) {
  return useCollection<Player>(roomId && enabled ? ['rooms', roomId, 'players'] : null, [], '', toPlayer);
}

export function usePlayer(roomId: string | undefined, playerId: string | null | undefined) {
  return useDoc<Player>(roomId && playerId ? ['rooms', roomId, 'players', playerId] : null, toPlayer);
}

export function useMember(roomId: string | undefined, uid: string | null) {
  return useDoc<Member>(roomId && uid ? ['rooms', roomId, 'members', uid] : null, (_id, d) => ({
    playerId: d.playerId,
    revoked: d.revoked === true,
  }));
}

/** All sentences in the room (host, leaderboard). */
export function useAllSentences(roomId: string | undefined, enabled = true) {
  return useCollection<Sentence>(roomId && enabled ? ['rooms', roomId, 'sentences'] : null, [], '', toSentence);
}

export function useMySentences(roomId: string | undefined, playerId: string | null | undefined, roundId: string | null | undefined) {
  return useCollection<Sentence>(
    roomId && playerId && roundId ? ['rooms', roomId, 'sentences'] : null,
    playerId && roundId ? [where('authorPlayerId', '==', playerId), where('roundId', '==', roundId)] : [],
    `${playerId}|${roundId}`,
    toSentence,
  );
}

export function useSentence(roomId: string | undefined, sentenceId: string | null | undefined) {
  return useDoc<Sentence>(roomId && sentenceId ? ['rooms', roomId, 'sentences', sentenceId] : null, toSentence);
}

/** Host only: listener on the votes of the current sentence. */
export function useVotesFor(roomId: string | undefined, sentenceId: string | null | undefined, enabled = true) {
  return useCollection<Vote>(
    roomId && sentenceId && enabled ? ['rooms', roomId, 'votes'] : null,
    sentenceId ? [where('sentenceId', '==', sentenceId)] : [],
    sentenceId ?? '',
    (_id, d) => d as Vote,
  );
}

export function useMyVote(roomId: string | undefined, sentenceId: string | null | undefined, playerId: string | null | undefined) {
  return useDoc<Vote>(
    roomId && sentenceId && playerId ? ['rooms', roomId, 'votes', `${sentenceId}_${playerId}`] : null,
    (_id, d) => d as Vote,
  );
}

export function useRejoinRequests(roomId: string | undefined, enabled = true) {
  return useCollection<RejoinRequest>(
    roomId && enabled ? ['rooms', roomId, 'rejoinRequests'] : null,
    [where('status', '==', 'pending')],
    'pending',
    (id, d) => ({ id, ...(d as Omit<RejoinRequest, 'id'>) }),
  );
}

export function useMyRejoinRequest(roomId: string | undefined, uid: string | null) {
  return useDoc<RejoinRequest>(roomId && uid ? ['rooms', roomId, 'rejoinRequests', uid] : null, (id, d) => ({
    id,
    ...(d as Omit<RejoinRequest, 'id'>),
  }));
}

/** Re-renders every `ms` and returns the estimated server time. */
export function useServerNow(ms = 250): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

export function isOnline(p: Pick<Player, 'lastSeenAt'>, now: number): boolean {
  const t = p.lastSeenAt?.toMillis?.() ?? 0;
  return now - t < 30_000;
}
