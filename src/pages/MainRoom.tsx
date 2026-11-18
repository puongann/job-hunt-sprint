import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_TEAM_NAMES } from '../config/brand';
import { CorrectionEditor } from '../components/Correction';
import { Btn, Loading, PaperCard } from '../components/ui';
import { Dock } from '../dock/Dock';
import * as api from '../lib/api';
import {
  isOnline,
  useAllSentences,
  useAuthUid,
  usePlayers,
  useRejoinRequests,
  useRoom,
  useServerNow,
  useVotesFor,
} from '../lib/hooks';
import { roomRoundsList } from '../lib/rounds';
import { employeeOfMonth, standings } from '../lib/scoring';
import { enableSound, sfx } from '../lib/sound';
import { toggleFullscreen } from '../lib/fx';
import type { Room, Score, Sentence } from '../lib/types';
import { BigLeaderboard, BigLobby, BigReview, BigWriting, RejoinOverlay, Stage } from '../views/Big';

export default function MainRoom() {
  const { roomId = '' } = useParams();
  const { uid, error } = useAuthUid();
  const room = useRoom(roomId, !!uid);
  if (error) return <p className="p-8 text-center text-rejected">Could not sign in: {error}</p>;
  if (!uid || room.loading) return <Loading />;
  if (!room.data) return <NotHost roomId={roomId} reason="missing" />;
  if (room.data.hostUid !== uid) return <NotHost roomId={roomId} reason="other" />;
  return <HostRoom room={room.data} />;
}

function NotHost({ roomId, reason }: { roomId: string; reason: 'missing' | 'other' }) {
  return (
    <div className="cork flex min-h-screen items-center justify-center p-6 text-xl">
      <PaperCard id="nothost" className="max-w-xl p-6 pt-8 text-center">
        <h1 className="font-serif text-3xl font-black">{reason === 'missing' ? 'No office with that code' : 'This main screen is on another browser'}</h1>
        {reason === 'other' && <p className="mt-2">Use the room code and your host PIN to take it back here.</p>}
        <Link to={`/main?code=${roomId}`} className="mt-4 inline-block rounded-lg bg-maroon px-4 py-2 font-bold text-paper">
          Go to Resume room
        </Link>
      </PaperCard>
    </div>
  );
}

export interface HostCtx {
  room: Room;
  sentences: Sentence[];
  roundSentences: Sentence[];
  current: Sentence | undefined;
  eligible: number;
  liveVotes: number;
  busy: boolean;
  run: (f: () => Promise<unknown>) => Promise<void>;
  nextStep: () => void;
  goNextSentence: () => void;
  score: (s: Score) => void;
  toggleStar: () => void;
  lock: () => void;
  flash: (m: string) => void;
}

function HostRoom({ room }: { room: Room }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pin, setPin] = useState<string | null>((location.state as { pin?: string } | null)?.pin ?? null);
  const players = usePlayers(room.code);
  const allSentences = useAllSentences(room.code);
  const requests = useRejoinRequests(room.code);
  const now = useServerNow(250);
  const votes = useVotesFor(room.code, room.currentSentenceId, room.phase === 'review' && room.sentenceStep === 'voting');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Remove the PIN from history state so a reload does not show it again.
  useEffect(() => {
    if (pin) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.rememberHostedRoom(room.code);
    api.syncHostClock(room.code).catch(() => {});
  }, [room.code]);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const run = useCallback(
    async (f: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await f();
      } catch (e) {
        flash((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [flash],
  );

  const sentences = allSentences.data;
  const roundSentences = useMemo(() => sentences.filter((s) => s.roundId === room.currentRoundId), [sentences, room.currentRoundId]);
  const current = sentences.find((s) => s.id === room.currentSentenceId);
  const eligible = current ? players.data.filter((p) => p.id !== current.authorPlayerId).length : 0;
  const liveVotes = room.sentenceStep === 'voting' ? votes.data.length : room.liveVoteCount;

  // Host is the single writer of the live vote count (debounced).
  useEffect(() => {
    if (room.phase !== 'review' || room.sentenceStep !== 'voting') return;
    if (votes.data.length === room.liveVoteCount) return;
    const t = setTimeout(() => api.updateRoom(room.code, { liveVoteCount: votes.data.length }).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [votes.data.length, room.liveVoteCount, room.phase, room.sentenceStep, room.code]);

  // Rejoin window: auto-close when it expires.
  useEffect(() => {
    if (room.rejoinOpen && room.rejoinExpiresAt && room.rejoinExpiresAt.toMillis() < now - 1500) {
      api.closeRejoin(room.code).catch(() => {});
    }
  }, [room.rejoinOpen, room.rejoinExpiresAt, now, room.code]);

  // A soft "ding" when a rejoin request arrives.
  const lastReqCount = useRef(0);
  useEffect(() => {
    if (requests.data.length > lastReqCount.current) sfx.ding();
    lastReqCount.current = requests.data.length;
  }, [requests.data.length]);

  // ---------------------------------------------------------------- review actions
  const queue = useMemo(() => room.reviewQueue ?? [], [room.reviewQueue]);
  const goNextSentence = useCallback(() => {
    const idx = queue.indexOf(room.currentSentenceId ?? '');
    const after = [...queue.slice(idx + 1), ...queue.slice(0, Math.max(0, idx))];
    const nextId = after.find((id) => !sentences.find((s) => s.id === id)?.locked);
    void run(() => api.goToSentence(room, sentences.find((s) => s.id === nextId)));
  }, [queue, room, sentences, run]);

  const lock = useCallback(() => {
    if (!current || current.locked) return;
    if (current.teacherScore === null) return flash('Pick a score first: press 0, 1 or 2.');
    void run(() => api.lockAndReveal(room, current));
  }, [current, room, run, flash]);

  const nextStep = useCallback(() => {
    if (room.phase !== 'review') return;
    if (!current) return goNextSentence();
    switch (room.sentenceStep) {
      case 'present':
        void run(() => api.openVoting(room, eligible));
        break;
      case 'voting':
        void run(() => api.closeVoting(room, current.id));
        break;
      case 'scoring':
        lock();
        break;
      default:
        goNextSentence();
    }
  }, [room, current, eligible, run, lock, goNextSentence]);

  const score = useCallback(
    (s: Score) => {
      if (!current || current.locked) return;
      if (room.sentenceStep === 'voting') {
        void run(async () => {
          await api.closeVoting(room, current.id);
          await api.setTeacherScore(room.code, current.id, s);
        });
      } else if (room.sentenceStep === 'scoring') void run(() => api.setTeacherScore(room.code, current.id, s));
      else flash('Close voting before scoring.');
    },
    [current, room, run, flash],
  );

  const toggleStar = useCallback(() => {
    if (!current || current.locked) return;
    void run(() => api.setChallenge(room.code, current.id, !current.challenge));
  }, [current, room.code, run]);

  const ctx: HostCtx = {
    room,
    sentences,
    roundSentences,
    current,
    eligible,
    liveVotes,
    busy,
    run,
    nextStep,
    goNextSentence,
    score,
    toggleStar,
    lock,
    flash,
  };

  // Browsers only allow audio after a user gesture: the first click anywhere unlocks sound.
  useEffect(() => {
    const unlock = () => enableSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // ---------------------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') toggleFullscreen();
      if (room.phase !== 'review') return;
      if (k === 'n' || k === 'enter' || k === 'arrowright') {
        e.preventDefault();
        nextStep();
      } else if (k === '0' || k === '1' || k === '2') score(Number(k) as Score);
      else if (k === 's') toggleStar();
      else if (k === 'l') lock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room.phase, nextStep, score, toggleStar, lock]);

  // ---------------------------------------------------------------- big view
  const rounds = roomRoundsList(room.rounds, room.roundOrder);
  const round = room.currentRoundId ? room.rounds[room.currentRoundId] : null;
  const teamNames = room.teamNames ?? DEFAULT_TEAM_NAMES;
  const origin = window.location.origin;
  const joinUrl = `${origin}/?code=${room.code}`;
  const st = useMemo(() => standings(sentences), [sentences]);
  const eom = useMemo(() => employeeOfMonth(sentences), [sentences]);

  let view: React.ReactNode = null;
  if (room.phase === 'lobby') {
    view = (
      <BigLobby
        code={room.code}
        joinUrl={joinUrl}
        teamNames={teamNames}
        joinOpen={room.joinOpen}
        players={players.data.map((p) => ({ id: p.id, nickname: p.nickname, team: p.team, online: isOnline(p, now) }))}
      />
    );
  } else if (room.phase === 'writing' && round) {
    const sorted = [...roundSentences].sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
    view = (
      <BigWriting
        code={room.code}
        round={round}
        roundIndex={Math.max(0, rounds.findIndex((r) => r.id === round.id))}
        remainingMs={(room.timerEndsAt?.toMillis() ?? 0) - now}
        totalMs={round.timerSeconds * 1000}
        cards={sorted.map((s) => ({ id: s.id, text: s.originalText }))}
        submittedCount={new Set(roundSentences.map((s) => s.authorPlayerId)).size}
        playerCount={players.data.length}
        showText={room.showWallLive}
      />
    );
  } else if (room.phase === 'review') {
    const locked = queue.filter((id) => sentences.find((s) => s.id === id)?.locked).length;
    view = (
      <BigReview
        code={room.code}
        round={round}
        sentenceId={current?.id ?? null}
        originalText={current?.originalText ?? ''}
        correctedText={current?.correctedText ?? null}
        step={room.sentenceStep}
        showDeletions={room.showDeletions}
        voteCount={liveVotes}
        eligible={room.eligibleVoters || eligible}
        reviewedCount={locked}
        totalCount={queue.length}
        teamNames={teamNames}
        emptyMessage={queue.length === 0 ? 'No applications this round. HR is suspicious.' : undefined}
        editor={
          current && !current.locked ? (
            <CorrectionEditor
              key={current.id}
              original={current.originalText}
              corrected={current.correctedText}
              showDeletions={room.showDeletions}
              onChange={(text) => {
                const value = text.trim() === current.originalText.trim() ? null : text;
                api.setCorrection(room.code, current.id, value).catch((e) => flash(e.message));
              }}
            />
          ) : undefined
        }
        reveal={
          current && current.locked && current.finalScore !== null && current.teacherScore !== null
            ? {
                tally: current.voteTally ?? { 0: 0, 1: 0, 2: 0 },
                studentAvg: current.studentAvg,
                teacherScore: current.teacherScore,
                finalScore: current.finalScore,
                challenge: current.challenge,
                authorNickname: current.authorNickname,
                team: current.team,
              }
            : null
        }
      />
    );
  } else if (room.phase === 'leaderboard') {
    view = <BigLeaderboard code={room.code} standings={st} teamNames={teamNames} employee={eom} />;
  }

  const rejoinRemaining = (room.rejoinExpiresAt?.toMillis() ?? 0) - now;

  return (
    <div className="fixed inset-0 bg-ink">
      <Stage>{view}</Stage>
      <div className="stage-wrap pointer-events-none absolute inset-0">
        <div className="stage relative h-full">
          <AnimatePresence>
            {room.rejoinOpen && room.rejoinToken && rejoinRemaining > 0 && (
              <div className="pointer-events-auto">
                <RejoinOverlay url={`${origin}/rejoin/${room.code}?t=${room.rejoinToken}`} remainingMs={rejoinRemaining} />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Dock ctx={ctx} players={players.data} requests={requests.data} now={now} rounds={rounds} />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-lg text-paper shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {pin && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-6">
          <PaperCard id="pin" className="max-w-lg p-8 pt-10 text-center text-xl">
            <p className="font-serif text-2xl font-black">Your host PIN</p>
            <PinReveal pin={pin} />
            <p>Write this down. It lets you take the main screen back.</p>
            <p className="mt-2 text-base text-ink/70">
              The projector may be on, so the PIN shows only while you hold the button. It will not be shown again.
            </p>
            <Btn className="mt-6 h-14 w-full text-xl" onClick={() => setPin(null)}>
              I wrote it down
            </Btn>
          </PaperCard>
        </div>
      )}
    </div>
  );
}


function PinReveal({ pin }: { pin: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="my-4 flex flex-col items-center gap-3">
      <p className="font-mono text-6xl font-black tracking-[0.25em] text-maroon" aria-live="polite">
        {show ? pin : '••••••'}
      </p>
      <button
        type="button"
        className="select-none rounded-lg bg-ink px-4 py-3 text-base font-bold text-paper"
        onPointerDown={() => setShow(true)}
        onPointerUp={() => setShow(false)}
        onPointerLeave={() => setShow(false)}
        onKeyDown={(e) => e.key === ' ' && setShow(true)}
        onKeyUp={() => setShow(false)}
      >
        Hold to reveal the PIN
      </button>
    </div>
  );
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target;
  return t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]');
}
