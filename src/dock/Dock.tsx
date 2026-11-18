import { AnimatePresence, motion } from 'framer-motion';
import { teamNamesFromRounds } from '../config/brand';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { STAMPS, cx } from '../components/ui';
import * as api from '../lib/api';
import { isOnline } from '../lib/hooks';
import { enableSound, setMuted, useSoundState } from '../lib/sound';
import type { Player, RejoinRequest, RoundConfig, Team } from '../lib/types';
import { toggleFullscreen } from '../lib/fx';
import { isTyping, type HostCtx } from '../pages/MainRoom';
import { RoundEditor } from './RoundEditor';

// Dev-only class simulator: the import is dead code (and dropped) in production builds.
const SimulatePanel = import.meta.env.DEV ? lazy(() => import('./SimulatePanel')) : null;

type Panel = 'players' | 'rejoin' | 'queue' | 'simulate' | null;

const dockBtn =
  'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35';
const dark = `${dockBtn} bg-ink/[0.06] text-ink hover:bg-ink/[0.12]`;
const small =
  'inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-ink/[0.06] px-2.5 text-[13px] font-semibold text-ink transition hover:bg-ink/[0.12]';
const prim = `${dockBtn} bg-maroon text-paper hover:brightness-110`;

export function Dock({
  ctx,
  players,
  requests,
  now,
  rounds,
}: {
  ctx: HostCtx;
  players: Player[];
  requests: RejoinRequest[];
  now: number;
  rounds: RoundConfig[];
}) {
  const { room, run } = ctx;
  const [visible, setVisible] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [editor, setEditor] = useState(false);
  const [hover, setHover] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const sound = useSoundState();

  // Auto-hide after 3 s without mouse movement (unless a panel is open or the pointer is on the dock).
  useEffect(() => {
    const poke = () => {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 3000);
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey) setVisible((v) => !v);
    };
    window.addEventListener('mousemove', poke);
    window.addEventListener('keydown', onKey);
    poke();
    return () => {
      window.removeEventListener('mousemove', poke);
      window.removeEventListener('keydown', onKey);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Show the dock when a rejoin request arrives.
  const lastReq = useRef(0);
  useEffect(() => {
    if (requests.length > lastReq.current) {
      setVisible(true);
      setPanel('rejoin');
    }
    lastReq.current = requests.length;
  }, [requests.length]);

  const shown = visible || hover || panel !== null || editor || requests.length > 0;
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const counts = { A: players.filter((p) => p.team === 'A').length, B: players.filter((p) => p.team === 'B').length };

  return (
    <>
      {!shown && (
        <button
          onClick={() => setVisible(true)}
          className="absolute bottom-0 left-1/2 z-40 h-3 w-40 -translate-x-1/2 rounded-t-lg bg-paper/40 hover:bg-paper/90 shadow"
          aria-label="Show controls (H)"
          title="Show controls (H)"
        />
      )}
      <AnimatePresence>
        {shown && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 90 }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 z-40 text-ink"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <AnimatePresence>
              {panel && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mx-auto mb-2 max-h-[55vh] w-[min(980px,96vw)] overflow-y-auto rounded-xl bg-paper/97 p-4 shadow-2xl ring-1 ring-ink/10"
                >
                  {panel === 'players' && <PlayersPanel ctx={ctx} players={players} now={now} />}
                  {panel === 'rejoin' && <RejoinPanel ctx={ctx} players={players} requests={requests} now={now} />}
                  {panel === 'queue' && <QueuePanel ctx={ctx} close={() => setPanel(null)} />}
                  {panel === 'simulate' && SimulatePanel && (
                    <Suspense fallback={<p>Loading...</p>}>
                      <SimulatePanel room={room} />
                    </Suspense>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="bg-paper/95 shadow-[0_-6px_20px_rgba(80,50,10,.18)] ring-1 ring-ink/10 backdrop-blur">
              {/* Row 1: what you do now in the game */}
              <div className="flex flex-wrap items-center gap-2 px-3 pb-1.5 pt-2">
                <PhaseControls ctx={ctx} rounds={rounds} now={now} openQueue={() => toggle('queue')} queueOpen={panel === 'queue'} />
              </div>
              {/* Row 2: room and settings */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-ink/10 px-3 py-1.5">
                <span className="rounded bg-maroon px-2 py-0.5 font-mono text-base font-black tracking-widest text-paper">{room.code}</span>
                <button className={small} onClick={() => toggle('players')} aria-pressed={panel === 'players'}>
                  👥 {players.length} <span className="text-teamA">A {counts.A}</span> / <span className="text-teamB">B {counts.B}</span>
                </button>
                <button
                  className={cx(small, room.joinOpen ? 'text-hired' : 'text-ink/50')}
                  onClick={() => run(() => api.updateRoom(room.code, { joinOpen: !room.joinOpen }))}
                  title="Allow brand-new players to join"
                >
                  {room.joinOpen ? '✓ Join open' : 'Join closed'}
                </button>
                <button
                  className={small}
                  onClick={() => run(() => api.updateRoom(room.code, { hideAuthor: room.hideAuthor === false }))}
                  title="Show or hide who wrote each sentence before the reveal"
                  aria-pressed={room.hideAuthor !== false}
                >
                  {room.hideAuthor === false ? '👁 Author shown' : '🙈 Author hidden'}
                </button>
                <span className="flex-1" />
                <button className={cx(small, 'relative', room.rejoinOpen && 'bg-maybe/30')} onClick={() => toggle('rejoin')}>
                  {room.rejoinOpen ? 'Rejoin QR on' : 'Rejoin QR'}
                  {requests.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rejected px-1 text-xs font-black text-white">
                      {requests.length}
                    </span>
                  )}
                </button>
                <button className={small} onClick={() => setEditor(true)}>
                  ✎ Rounds
                </button>
                {SimulatePanel && (
                  <button className={cx(small, 'border border-dashed border-maybe text-[#8a6500]')} onClick={() => toggle('simulate')}>
                    Simulate class
                  </button>
                )}
                {sound.enabled ? (
                  <button className={small} onClick={() => setMuted(!sound.muted)} title="Mute / unmute">
                    {sound.muted ? '🔇' : '🔊'}
                  </button>
                ) : (
                  <button className={cx(small, 'bg-maroon text-paper hover:bg-maroon')} onClick={enableSound}>
                    🔊 Enable sound
                  </button>
                )}
                <button className={small} onClick={toggleFullscreen} title="Fullscreen (F)">
                  ⛶
                </button>
                <button className={small} onClick={() => setVisible(false)} title="Hide controls (H)">
                  ▾
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {editor && (
        <RoundEditor
          initial={rounds}
          lockedRoundId={room.phase === 'writing' || room.phase === 'review' ? room.currentRoundId : null}
          onClose={() => setEditor(false)}
          onSaveToRoom={async (rs) => {
            const map: Record<string, RoundConfig> = {};
            rs.forEach((r) => (map[r.id] = r));
            if (room.currentRoundId && !map[room.currentRoundId] && room.rounds[room.currentRoundId]) {
              map[room.currentRoundId] = room.rounds[room.currentRoundId];
            }
            // Before the game starts, the team names follow the first round's options.
            const teamPatch = room.phase === 'lobby' && !room.currentRoundId ? { teamNames: teamNamesFromRounds(rs) } : {};
            await api.updateRoom(room.code, { rounds: map, roundOrder: rs.map((r) => r.id), ...teamPatch });
          }}
        />
      )}
    </>
  );
}

function Sep() {
  return <span className="mx-1 h-7 w-px bg-ink/15" />;
}

// ------------------------------------------------------------------ phase controls

function PhaseControls({
  ctx,
  rounds,
  now,
  openQueue,
  queueOpen,
}: {
  ctx: HostCtx;
  rounds: RoundConfig[];
  now: number;
  openQueue: () => void;
  queueOpen: boolean;
}) {
  const { room, run, busy } = ctx;
  const playedIdx = rounds.findIndex((r) => r.id === room.currentRoundId);
  const nextRound = rounds[playedIdx + 1] ?? null;
  const [pick, setPick] = useState<string>('');
  const selected = pick || (room.phase === 'lobby' ? rounds[0]?.id : nextRound?.id) || rounds[0]?.id || '';

  const startPicker = (label: string) => (
    <>
      <span className="flex-1" />
      <select
        className="h-10 max-w-[16rem] rounded-md bg-ink/[0.06] px-2 text-[15px] text-ink"
        value={selected}
        onChange={(e) => setPick(e.target.value)}
      >
        {rounds.map((r, i) => (
          <option key={r.id} value={r.id} className="text-ink">
            {i + 1}. {r.title}
          </option>
        ))}
      </select>
      <button
        className={prim}
        disabled={busy || !selected}
        onClick={() => run(() => api.startRound(room, selected).then(() => setPick('')))}
      >
        ▶ {label}
      </button>
    </>
  );

  if (room.phase === 'lobby') return startPicker('Start round');

  if (room.phase === 'writing') {
    const remaining = (room.timerEndsAt?.toMillis() ?? 0) - now;
    const up = remaining <= 0;
    return (
      <>
        <span className="font-mono text-lg tabular-nums">{up ? '0:00' : fmtSec(remaining)}</span>
        <button className={dark} disabled={busy} onClick={() => run(() => api.addTime(room, 30))}>
          +30 s
        </button>
        <button className={dark} disabled={busy || up} onClick={() => run(() => api.endWritingNow(room))}>
          End now
        </button>
        <button
          className={cx(dark, room.showWallLive && 'bg-maybe/30')}
          onClick={() => run(() => api.updateRoom(room.code, { showWallLive: !room.showWallLive }))}
          title="Show the sentence text on the wall"
        >
          {room.showWallLive ? 'Text visible' : 'Text hidden'}
        </button>
        <span className="flex-1" />
        <button className={prim} disabled={busy} onClick={() => run(() => api.startReview(room, ctx.sentences))}>
          {up ? '▶ Start review' : 'Start review now'}
        </button>
      </>
    );
  }

  if (room.phase === 'review') return <ReviewControls ctx={ctx} openQueue={openQueue} queueOpen={queueOpen} nextRound={nextRound} />;

  // leaderboard
  return (
    <>
      <span className="text-ink/60">Play again:</span>
      {startPicker('Start round')}
      <button className={dark} onClick={() => run(() => api.updateRoom(room.code, { phase: 'lobby', joinOpen: true }))}>
        Back to lobby
      </button>
    </>
  );
}

function fmtSec(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ReviewControls({
  ctx,
  openQueue,
  queueOpen,
  nextRound,
}: {
  ctx: HostCtx;
  openQueue: () => void;
  queueOpen: boolean;
  nextRound: RoundConfig | null;
}) {
  const { room, current, run, busy, sentences } = ctx;
  const queue = room.reviewQueue ?? [];
  const lockedCount = queue.filter((id) => sentences.find((s) => s.id === id)?.locked).length;
  const allDone = queue.length > 0 && lockedCount === queue.length;
  const step = room.sentenceStep;
  const pinned = current ? room.pinnedIds?.includes(current.id) : false;

  const stepLabel =
    !current || step === 'revealed'
      ? 'Next sentence ▶'
      : step === 'present'
        ? 'Open voting ▶'
        : step === 'voting'
          ? `Close voting (${ctx.liveVotes}/${room.eligibleVoters || ctx.eligible}) ▶`
          : 'Lock and reveal ▶';

  const pinBtn = current && (
    <button
      className={cx(dark, pinned && 'bg-maybe/30')}
      onClick={() =>
        run(() =>
          api.updateRoom(room.code, {
            pinnedIds: pinned ? room.pinnedIds.filter((x) => x !== current.id) : [...(room.pinnedIds ?? []), current.id],
          }),
        )
      }
      title="Pin to come back later"
    >
      📌
    </button>
  );
  const editing = current && !current.locked;
  const scoring = editing && (step === 'voting' || step === 'scoring');

  return (
    <>
      {/* 1. Navigate the sentences */}
      <button className={cx(dark, queueOpen && 'bg-ink/15')} onClick={openQueue} title="Review queue: jump to any sentence">
        ☰ {lockedCount}/{queue.length}
      </button>
      {current && step !== 'revealed' && !allDone && (
        <button className={dark} disabled={busy} onClick={ctx.goNextSentence} title="Skip to the next sentence">
          Skip
        </button>
      )}
      {pinBtn}

      {/* 2. Correct the sentence */}
      {editing && (
        <>
          <Sep />
          <button
            className={dark}
            disabled={busy || current.correctedText === null}
            onClick={() => run(() => api.setCorrection(room.code, current.id, null))}
          >
            Reset correction
          </button>
          <button
            className={cx(dark, !room.showDeletions && 'bg-ink/15')}
            onClick={() => run(() => api.updateRoom(room.code, { showDeletions: !room.showDeletions }))}
          >
            {room.showDeletions ? 'Hide deletions' : 'Show deletions'}
          </button>
        </>
      )}

      {/* 3. Teacher score, same stamps as the students' vote */}
      {scoring && (
        <>
          <Sep />
          <span className="text-sm text-ink/60">Your score:</span>
          {STAMPS.map((st) => {
            const on = current.teacherScore === st.value;
            const onText = st.value === 1 ? 'text-ink' : 'text-white';
            return (
              <button
                key={st.value}
                className={cx(
                  dockBtn,
                  'gap-2 border-2 px-3',
                  on ? `${st.bg} border-ink ${onText} shadow-md` : 'border-ink/10 bg-paper hover:border-ink/30',
                )}
                onClick={() => ctx.score(st.value)}
                title={`${st.label} = ${st.value} (key ${st.value})`}
                aria-pressed={on}
              >
                <span
                  className={cx('stamp text-[13px]', on ? onText : st.cls)}
                  style={{ transform: `rotate(${st.value === 1 ? 2 : -3}deg)`, mixBlendMode: 'normal' }}
                >
                  {st.label}
                </span>
                <span className={cx('text-lg font-black', on ? onText : 'text-ink/40')}>{st.value}</span>
              </button>
            );
          })}
          <button
            className={cx(dark, current.challenge && 'bg-maybe text-ink hover:bg-maybe')}
            onClick={ctx.toggleStar}
            title="Challenge star (S)"
          >
            ⭐ Challenge
          </button>
        </>
      )}

      {/* 4. Main action, always at the right */}
      <span className="flex-1" />
      {allDone && step === 'revealed' ? (
        <>
          <button className={prim} disabled={busy} onClick={() => run(() => api.updateRoom(room.code, { phase: 'leaderboard' }))}>
            🏆 Leaderboard
          </button>
          {nextRound && (
            <button className={prim} disabled={busy} onClick={() => run(() => api.startRound(room, nextRound.id))}>
              ▶ Next round: {nextRound.title}
            </button>
          )}
        </>
      ) : (
        <>
          <button
            className={queue.length === 0 ? prim : dark}
            onClick={() => run(() => api.updateRoom(room.code, { phase: 'leaderboard' }))}
            title="Show the leaderboard now (unreviewed sentences do not count)"
          >
            🏆{queue.length === 0 ? ' Leaderboard' : ''}
          </button>
          <button className={cx(prim, 'min-w-[11rem]')} disabled={busy || queue.length === 0} onClick={ctx.nextStep} title="Next step (N / Enter / →)">
            {stepLabel}
          </button>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ panels

function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-serif text-xl font-black">{children}</h3>
      {right}
    </div>
  );
}

function PlayersPanel({ ctx, players, now }: { ctx: HostCtx; players: Player[]; now: number }) {
  const { room, run, sentences } = ctx;
  const sorted = [...players].sort((a, b) => a.team.localeCompare(b.team) || a.nickname.localeCompare(b.nickname));
  return (
    <>
      <PanelTitle>Staff list</PanelTitle>
      {sorted.length === 0 && <p className="text-ink/60">Nobody yet. Show the QR code.</p>}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
        {sorted.map((p) => {
          const other: Team = p.team === 'A' ? 'B' : 'A';
          return (
            <div key={p.id} className="flex items-center gap-2 border-b border-ink/10 py-1">
              <span
                className={cx('h-3 w-3 shrink-0 rounded-full', isOnline(p, now) ? 'bg-hired' : 'bg-ink/20')}
                title={isOnline(p, now) ? 'online' : 'offline (no heartbeat for 30 s)'}
              />
              <span className="flex-1 truncate font-semibold">{p.nickname}</span>
              <span className={cx('rounded px-1.5 text-sm font-bold', p.team === 'A' ? 'bg-teamA' : 'bg-teamB')}>{p.team}</span>
              <button
                className="rounded bg-ink/[0.06] px-2 text-sm hover:bg-ink/[0.12]"
                onClick={() => run(() => api.movePlayerTeam(room.code, p, other, sentences))}
                title={`Move to team ${other}`}
              >
                → {other}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RejoinPanel({ ctx, players, requests, now }: { ctx: HostCtx; players: Player[]; requests: RejoinRequest[]; now: number }) {
  const { room, run } = ctx;
  const remaining = (room.rejoinExpiresAt?.toMillis() ?? 0) - now;
  return (
    <>
      <PanelTitle
        right={
          room.rejoinOpen ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg tabular-nums">{fmtSec(remaining)}</span>
              <button className={dark} onClick={() => run(() => api.extendRejoin(room, 1))}>
                +1 min
              </button>
              <button className={dark} onClick={() => run(() => api.closeRejoin(room.code))}>
                Close
              </button>
            </div>
          ) : (
            <button className={prim} onClick={() => run(() => api.openRejoin(room.code, 3))}>
              Show rejoin QR (3 min)
            </button>
          )
        }
      >
        Rejoin desk
      </PanelTitle>
      <p className="mb-3 text-sm text-ink/60">
        A student who lost their session scans the QR, picks their name, and waits. Check who is holding the phone, then approve.
      </p>
      {requests.length === 0 ? (
        <p className="text-ink/60">No pending requests.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => {
            const p = players.find((x) => x.id === r.playerId);
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-lg bg-ink/[0.06] p-3">
                <span className="flex-1 text-lg">
                  A new phone wants to be <b>'{p?.nickname ?? '?'}'</b> (Team {p?.team ?? '?'})
                  {p && (
                    <span className="ml-2 text-sm text-ink/50">
                      {isOnline(p, now) ? '· old phone still online' : '· old phone offline'}
                    </span>
                  )}
                </span>
                <button className={`${dockBtn} bg-hired text-white`} disabled={!p} onClick={() => p && run(() => api.approveRejoin(room.code, r, p))}>
                  Approve
                </button>
                <button className={`${dockBtn} bg-rejected text-white`} onClick={() => run(() => api.denyRejoin(room.code, r.id))}>
                  Deny
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function QueuePanel({ ctx, close }: { ctx: HostCtx; close: () => void }) {
  const { room, sentences, run } = ctx;
  const queue = room.reviewQueue ?? [];
  return (
    <>
      <PanelTitle>Review queue (author names stay hidden)</PanelTitle>
      <ol className="flex flex-col gap-1">
        {queue.map((id, i) => {
          const s = sentences.find((x) => x.id === id);
          if (!s) return null;
          const current = id === room.currentSentenceId;
          const pinned = room.pinnedIds?.includes(id);
          return (
            <li key={id}>
              <button
                onClick={() => {
                  close();
                  void run(() => api.goToSentence(room, s));
                }}
                className={cx(
                  'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-ink/[0.06]',
                  current && 'bg-maroon',
                )}
              >
                <span className="w-7 text-right font-mono text-ink/50">{i + 1}</span>
                <span className="flex-1 truncate">{s.correctedText ?? s.originalText}</span>
                {pinned && <span title="pinned">📌</span>}
                {s.challenge && <span>⭐</span>}
                <span className={cx('w-14 text-right font-mono', s.locked ? 'text-hired' : 'text-ink/40')}>
                  {s.locked ? s.finalScore?.toFixed(2) : '—'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
