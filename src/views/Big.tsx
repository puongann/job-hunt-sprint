import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GAME_NAME, GAME_TAGLINE } from '../config/brand';
import { DiffText } from '../components/Correction';
import { CountUp, PaperCard, PushPin, QR, RoundData, SlamStamp, Stamp, TeamBadge, TimerBar, cx, tiltFor } from '../components/ui';
import { confettiBurst, confettiWinner } from '../lib/fx';
import { useReducedMotion } from '../lib/hooks';
import { fmt2, stampFor, type EmployeeOfMonth, type Standings } from '../lib/scoring';
import { sfx } from '../lib/sound';
import type { RoundConfig, SentenceStep, Team, VoteTally } from '../lib/types';

/* All sizes on the big view are in em; .stage sets 1em = 32px on a 1920px-wide screen. */

export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('stage-wrap cork relative h-full w-full overflow-hidden text-ink', className)}>
      <div className="stage relative flex h-full w-full flex-col">{children}</div>
    </div>
  );
}

export function Masthead({ right, code }: { right?: ReactNode; code?: string }) {
  return (
    <header className="flex items-center justify-between gap-[0.6em] px-[1em] pt-[0.6em]">
      <div className="flex items-baseline gap-[0.5em] rounded-lg bg-maroon px-[0.6em] py-[0.15em] text-paper shadow-lg">
        <span className="font-serif text-[1.1em] font-black tracking-tight">{GAME_NAME}</span>
        {code && <span className="font-mono text-[0.8em] opacity-80">office {code}</span>}
      </div>
      {right}
    </header>
  );
}

// ------------------------------------------------------------------ lobby

export interface LobbyPlayer {
  id: string;
  nickname: string;
  team: Team;
  online: boolean;
}

export function BigLobby({
  code,
  joinUrl,
  teamNames,
  players,
  joinOpen,
}: {
  code: string;
  joinUrl: string;
  teamNames: { A: string; B: string };
  players: LobbyPlayer[];
  joinOpen: boolean;
}) {
  const host = joinUrl.replace(/^https?:\/\//, '').replace(/\/\?code=.*$/, '');
  return (
    <>
      <Masthead code={code} />
      <div className="grid flex-1 grid-cols-[1fr_1.15fr] gap-[1.2em] px-[1.2em] pb-[3.2em] pt-[0.8em]">
        <PaperCard id="lobby-join" className="flex flex-col items-center justify-center gap-[0.5em] p-[1em] text-center" ring={false}>
          <p className="font-hand text-[1.3em] text-maroon">Now hiring! Scan to apply:</p>
          <QR value={joinUrl} className="w-[9.5em]" />
          <p className="text-[0.9em]">
            or go to <b className="font-mono">{host}</b>
          </p>
          <p className="text-[0.9em]">Enter the 4-letter office code:</p>
          <p className="font-mono text-[3.4em] font-black tracking-[0.18em] text-maroon">{code}</p>
          {!joinOpen && <Stamp label="CLOSED" className="text-[1em]" />}
        </PaperCard>
        <div className="flex min-h-0 flex-col gap-[0.6em]">
          <p className="rounded-lg bg-paper/90 px-[0.6em] py-[0.3em] font-hand text-[1.25em] shadow">
            HR is preparing the office. Please do not touch the coffee machine.
          </p>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-[0.6em]">
            {(['A', 'B'] as Team[]).map((t) => {
              const list = players.filter((p) => p.team === t);
              return (
                <div key={t} className="paper plain flex min-h-0 flex-col p-[0.5em]">
                  <div className="mb-[0.3em] flex items-center justify-between">
                    <TeamBadge team={t} name={teamNames[t]} className="text-[0.75em]" />
                    <span className="font-serif text-[1.4em] font-black">{list.length}</span>
                  </div>
                  <div className="flex flex-wrap content-start gap-[0.25em] overflow-hidden">
                    <AnimatePresence>
                      {list.map((p) => (
                        <motion.span
                          key={p.id}
                          layout
                          initial={{ y: -20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cx(
                            'rounded-md border border-ink/10 bg-white px-[0.35em] text-[0.85em] font-semibold shadow-sm',
                            !p.online && 'opacity-50',
                          )}
                        >
                          {p.nickname}
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center font-hand text-[1em] text-ink/80">{GAME_TAGLINE}</p>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ writing

export interface WallCard {
  id: string;
  text: string;
}

export function BigWriting({
  round,
  roundIndex,
  remainingMs,
  totalMs,
  cards,
  submittedCount,
  playerCount,
  showText,
  code,
}: {
  round: RoundConfig;
  roundIndex: number;
  remainingMs: number;
  totalMs: number;
  cards: WallCard[];
  submittedCount: number;
  playerCount: number;
  showText: boolean;
  code?: string;
}) {
  const timeUp = remainingMs <= 0;
  useWritingSounds(remainingMs, cards.length);
  const small = cards.length > 12;
  return (
    <>
      <Masthead
        code={code}
        right={
          <div className="w-[16em] rounded-lg bg-paper/90 px-[0.5em] py-[0.2em] shadow">
            <TimerBar remainingMs={remainingMs} totalMs={totalMs} />
          </div>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[22em_1fr] gap-[0.8em] px-[1em] pb-[3.2em] pt-[0.6em]">
        <PaperCard id={`brief-${round.id}`} tilt={false} className="flex min-h-0 flex-col gap-[0.4em] overflow-hidden p-[0.7em]" ring={false}>
          <p className="font-hand text-[1em] text-maroon">Job posting #{roundIndex + 1}</p>
          <h2 className="font-serif text-[1.35em] font-black leading-tight">{round.title}</h2>
          <p className="text-[0.8em] leading-snug">{round.brief}</p>
          <RoundData round={round} />
          {round.closingLine && <p className="font-hand text-[1em] text-maroon">{round.closingLine}</p>}
        </PaperCard>
        <div className="flex min-h-0 flex-col">
          <div className="mb-[0.4em] flex items-center justify-between">
            <span className="rounded-lg bg-ink px-[0.5em] py-[0.1em] font-serif font-extrabold text-paper shadow">
              Applications received: {submittedCount}/{playerCount}
            </span>
            {!showText && cards.length > 0 && <span className="tape rounded px-[0.6em] text-[0.7em]">Confidential</span>}
          </div>
          <div className="relative min-h-0 flex-1">
            {cards.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-center font-hand text-[1.4em] text-ink/80">
                No applications yet. The HR department is watching you.
              </p>
            )}
            <div className={cx('grid content-start gap-[0.5em]', small ? 'grid-cols-4' : 'grid-cols-3')}>
              <AnimatePresence>
                {cards.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ y: -80, opacity: 0, rotate: tiltFor(c.id) * 4 }}
                    animate={{ y: 0, opacity: 1, rotate: tiltFor(c.id) }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  >
                    <div className="paper plain relative px-[0.5em] pb-[0.4em] pt-[0.6em]">
                      <PushPin className="-top-[0.35em] left-1/2 h-[0.8em] w-[0.8em] -translate-x-1/2" />
                      <p className={cx(small ? 'text-[0.62em]' : 'text-[0.78em]', 'line-clamp-3 leading-snug', !showText && 'redacted')}>
                        {c.text}
                      </p>
                      {!showText && (
                        <span className="tape absolute left-[-0.2em] right-[-0.2em] top-1/2 -translate-y-1/2 -rotate-3 py-[0.05em] text-center text-[0.5em]">
                          Confidential
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {timeUp && (
          <motion.div
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="rotate-[-4deg] rounded-xl bg-paper px-[1.2em] py-[0.6em] text-center shadow-2xl">
              <p className="font-serif text-[2.4em] font-black text-rejected">Time's up!</p>
              <p className="font-hand text-[1.4em]">Pencils down!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function useWritingSounds(remainingMs: number, cardCount: number) {
  const lastSec = useRef<number | null>(null);
  const lastCards = useRef(cardCount);
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  useEffect(() => {
    const prev = lastSec.current;
    lastSec.current = sec;
    if (prev === null || prev === sec) return;
    if (sec > 0 && sec <= 10) sfx.tick();
    if (sec === 0 && prev > 0) sfx.buzzer();
  }, [sec]);
  useEffect(() => {
    if (cardCount > lastCards.current) sfx.ting();
    lastCards.current = cardCount;
  }, [cardCount]);
}

// ------------------------------------------------------------------ review

export interface RevealData {
  tally: VoteTally;
  studentAvg: number | null;
  teacherScore: number;
  finalScore: number;
  challenge: boolean;
  authorNickname: string;
  team: Team;
}

const STEP_LABELS: { key: SentenceStep | 'correct'; label: string }[] = [
  { key: 'present', label: 'Present' },
  { key: 'correct', label: 'Correct' },
  { key: 'voting', label: 'Vote' },
  { key: 'scoring', label: 'Score' },
  { key: 'revealed', label: 'Reveal' },
];

export function BigReview({
  round,
  sentenceId,
  originalText,
  correctedText,
  step,
  showDeletions,
  voteCount,
  eligible,
  reviewedCount,
  totalCount,
  reveal,
  teamNames,
  editor,
  code,
  emptyMessage,
  author,
}: {
  round: RoundConfig | null;
  sentenceId: string | null;
  originalText: string;
  correctedText: string | null;
  step: SentenceStep | null;
  showDeletions: boolean;
  voteCount: number;
  eligible: number;
  reviewedCount: number;
  totalCount: number;
  reveal: RevealData | null;
  teamNames: { A: string; B: string };
  editor?: ReactNode; // the host's in-place editor replaces the static diff
  code?: string;
  emptyMessage?: string;
  /** Set when the teacher chose to show the author before the reveal. */
  author?: { nickname: string; team: Team } | null;
}) {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const corrected = correctedText !== null && correctedText !== originalText;
  const activeIdx = step === 'present' ? (corrected ? 1 : 0) : STEP_LABELS.findIndex((s) => s.key === step);
  const shake = () => {
    if (!reduce) void controls.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.35 } });
  };

  return (
    <>
      <Masthead
        code={code}
        right={
          <span className="rounded-lg bg-paper/90 px-[0.5em] py-[0.1em] font-serif font-extrabold shadow">
            Reviewed {reviewedCount} of {totalCount}
          </span>
        }
      />
      <div className="flex justify-center gap-[0.3em] pt-[0.4em]">
        {STEP_LABELS.map((s, i) => (
          <span
            key={s.key}
            className={cx(
              'rounded-full px-[0.6em] py-[0.05em] text-[0.7em] font-bold uppercase tracking-wider',
              i === activeIdx ? 'bg-maroon text-paper' : i < activeIdx ? 'bg-ink/50 text-paper' : 'bg-paper/60 text-ink/60',
            )}
          >
            {i + 1}. {s.label}
          </span>
        ))}
      </div>
      <motion.div animate={controls} className="flex min-h-0 flex-1 flex-col items-center px-[2em] pb-[3.2em] pt-[0.6em]">
        {!sentenceId ? (
          <div className="flex flex-1 items-center">
            <p className="rounded-xl bg-paper px-[1em] py-[0.5em] text-center font-hand text-[1.6em] shadow-xl">
              {emptyMessage ?? 'All applications reviewed. HR needs a coffee.'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={sentenceId}
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="flex w-full flex-col items-center"
            >
              <PaperCard id={sentenceId} className="w-full max-w-[48em] px-[1.2em] pb-[0.8em] pt-[1em]">
                <div className="mb-[0.3em] flex items-center justify-between text-[0.7em] text-ink/60">
                  <span className="font-bold uppercase tracking-widest">Application · {round?.title}</span>
                  {step !== 'revealed' &&
                    (author ? (
                      <span className="flex items-center gap-[0.4em] text-[1.3em] text-ink">
                        <span className="font-hand text-maroon">by</span> <b>{author.nickname}</b>
                        <TeamBadge team={author.team} name={teamNames[author.team]} className="text-[0.75em]" />
                      </span>
                    ) : (
                      <span className="font-hand text-[1.4em] text-maroon">Author hidden until the end</span>
                    ))}
                </div>
                <div className="font-serif text-[1.75em] font-semibold leading-snug">
                  {editor ?? <DiffText original={originalText} corrected={correctedText} showDeletions={showDeletions} />}
                </div>
                {step === 'revealed' && reveal && (
                  <div className="absolute -right-[0.6em] -top-[1.2em] text-[1.9em]">
                    <SlamStamp
                      key={sentenceId}
                      label={stampFor(reveal.finalScore)}
                      onLand={() => {
                        shake();
                        if (stampFor(reveal.finalScore) === 'HIRED') confettiBurst();
                      }}
                    />
                  </div>
                )}
              </PaperCard>

              <div className="mt-[0.8em] w-full max-w-[48em]">
                {step === 'present' && (
                  <p className="text-center font-hand text-[1.3em] text-ink/90">The teacher corrects live. New words are red and bold.</p>
                )}
                {step === 'voting' && <VoteMeter count={voteCount} eligible={eligible} />}
                {step === 'scoring' && (
                  <p className="text-center font-hand text-[1.5em]">
                    Votes are in ({voteCount}/{eligible}). HR is deciding...
                  </p>
                )}
                {step === 'revealed' && reveal && <RevealPanel key={sentenceId} reveal={reveal} teamNames={teamNames} />}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </>
  );
}

function VoteMeter({ count, eligible }: { count: number; eligible: number }) {
  const pct = eligible ? Math.min(1, count / eligible) : 0;
  return (
    <div className="mx-auto flex w-[30em] flex-col items-center gap-[0.3em]">
      <div className="flex gap-[0.6em] text-[1em]">
        <Stamp label="REJECTED" rotate={-6} />
        <Stamp label="MAYBE" rotate={3} />
        <Stamp label="HIRED" rotate={-3} />
      </div>
      <p className="font-serif text-[2.2em] font-black tabular-nums">
        {count}/{eligible} voted
      </p>
      <div className="h-[0.6em] w-full overflow-hidden rounded-full bg-ink/20">
        <motion.div className="h-full bg-maroon" animate={{ width: `${pct * 100}%` }} />
      </div>
      <p className="font-hand text-[1.1em] text-ink/80">Vote on your phone. The split stays secret until the reveal.</p>
    </div>
  );
}

/** Staged reveal: vote split, averages, final score, star, then the author. */
export function RevealPanel({ reveal, teamNames }: { reveal: RevealData; teamNames: { A: string; B: string } }) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? 5 : 0);
  useEffect(() => {
    if (reduce) return;
    const times = [300, 1200, 2000, 3400, 4300];
    const ts = times.map((t, i) => setTimeout(() => setStage(i + 1), t));
    return () => ts.forEach(clearTimeout);
  }, [reduce]);
  useEffect(() => {
    if (stage === 5) sfx.ding();
  }, [stage]);
  const total = reveal.tally[0] + reveal.tally[1] + reveal.tally[2];
  const bars: { label: string; n: number; color: string }[] = [
    { label: 'REJECTED', n: reveal.tally[0], color: 'bg-rejected' },
    { label: 'MAYBE', n: reveal.tally[1], color: 'bg-maybe' },
    { label: 'HIRED', n: reveal.tally[2], color: 'bg-hired' },
  ];
  return (
    <div className="grid grid-cols-[1.1fr_1fr] gap-[0.8em]">
      <div className="paper plain p-[0.5em]">
        <p className="mb-[0.2em] text-[0.7em] font-bold uppercase tracking-widest text-ink/60">Student votes</p>
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-[0.4em] text-[0.8em]">
            <span className="w-[5.4em] font-bold">{b.label}</span>
            <div className="h-[0.8em] flex-1 overflow-hidden rounded bg-ink/10">
              <motion.div
                className={cx('h-full', b.color)}
                initial={{ width: 0 }}
                animate={{ width: stage >= 1 && total ? `${(b.n / total) * 100}%` : 0 }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <span className="w-[1.6em] text-right font-black tabular-nums">{stage >= 1 ? b.n : ''}</span>
          </div>
        ))}
      </div>
      <div className="paper plain flex flex-col justify-center p-[0.5em] text-[0.85em]">
        <div className="flex justify-between">
          <span>Student average</span>
          <b className="tabular-nums">{stage >= 2 ? (reveal.studentAvg === null ? 'no votes' : <CountUp value={reveal.studentAvg} duration={700} />) : '…'}</b>
        </div>
        <div className="flex justify-between">
          <span>Teacher score</span>
          <b className="tabular-nums">{stage >= 3 ? reveal.teacherScore : '…'}</b>
        </div>
        <div className="mt-[0.2em] flex items-baseline justify-between border-t-2 border-ink/20 pt-[0.2em]">
          <span className="text-[0.75em]">{reveal.studentAvg === null ? 'No votes: teacher score' : '50% students + 50% teacher'}</span>
          <b className="font-serif text-[1.8em] font-black text-maroon">
            {stage >= 4 ? <CountUp value={reveal.finalScore} duration={1100} /> : '?.??'}
          </b>
        </div>
      </div>
      <div className="col-span-2 flex min-h-[2.4em] items-center justify-center gap-[0.8em]">
        <AnimatePresence>
          {stage >= 4 && reveal.challenge && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              className="rounded-full bg-maybe px-[0.6em] py-[0.1em] font-serif text-[1em] font-black text-ink shadow-lg"
            >
              ⭐ Bonus structure unlocked!
            </motion.span>
          )}
          {stage >= 5 && (
            <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-[1.2em]">
              <span className="font-hand text-[1.2em]">Application submitted by </span>
              <b className="font-serif font-black">{reveal.authorNickname}</b>{' '}
              <TeamBadge team={reveal.team} name={teamNames[reveal.team]} className="text-[0.7em]" />
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ leaderboard

export function BigLeaderboard({
  standings,
  teamNames,
  employee,
  code,
  footer,
}: {
  standings: Standings;
  teamNames: { A: string; B: string };
  employee: EmployeeOfMonth | null;
  code?: string;
  footer?: ReactNode;
}) {
  const [go, setGo] = useState(false);
  const { winner } = standings;
  useEffect(() => {
    const t1 = setTimeout(() => setGo(true), 400);
    const t2 = setTimeout(() => {
      if (winner) {
        sfx.fanfare();
        confettiWinner(winner === 'A' ? '#3B4CCA' : '#E8590C');
      }
    }, 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [winner]);
  const loser: Team | null = winner ? (winner === 'A' ? 'B' : 'A') : null;
  return (
    <>
      <Masthead code={code} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[0.8em] px-[2em] pb-[3.2em]">
        <h1 className="rounded-xl bg-paper px-[0.8em] py-[0.15em] font-serif text-[2.2em] font-black shadow-xl">Quarterly performance review</h1>
        <div className="grid w-full max-w-[52em] grid-cols-[1fr_1fr_0.9fr] gap-[0.8em]">
          <div className="col-span-2 flex flex-col gap-[0.5em]">
            {(['A', 'B'] as Team[]).map((t) => {
              const s = standings[t];
              const pct = ((s.score ?? 0) / 2) * 100;
              return (
                <div key={t} className="paper plain p-[0.5em]">
                  <div className="flex items-center justify-between">
                    <TeamBadge team={t} name={teamNames[t]} className="text-[0.8em]" />
                    <span className="font-serif text-[2em] font-black tabular-nums">
                      {s.score === null ? '-' : <CountUp value={s.score} duration={1600} start={go} />}
                    </span>
                  </div>
                  <div className="mt-[0.2em] h-[1em] overflow-hidden rounded-full bg-ink/10">
                    <motion.div
                      className={t === 'A' ? 'h-full bg-teamA' : 'h-full bg-teamB'}
                      initial={{ width: 0 }}
                      animate={{ width: go ? `${pct}%` : 0 }}
                      transition={{ duration: 1.6, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="mt-[0.2em] flex justify-between text-[0.7em] text-ink/70">
                    <span>⭐ {s.stars} bonus {s.stars === 1 ? 'star' : 'stars'}</span>
                    <span>
                      {s.counted} {s.counted === 1 ? 'sentence' : 'sentences'} counted
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="paper coffee-ring relative flex flex-col items-center justify-center p-[0.5em] text-center">
            <p className="text-[0.65em] font-bold uppercase tracking-widest text-maroon">Employee of the Month</p>
            <div className="my-[0.2em] text-[2em]">🏆</div>
            {employee ? (
              <>
                <p className="font-serif text-[1.3em] font-black">{employee.nickname}</p>
                <p className="text-[0.7em]">{fmt2(employee.total)} points in total</p>
              </>
            ) : (
              <p className="font-hand text-[1em]">Position still open</p>
            )}
          </div>
        </div>
        <AnimatePresence>
          {go && (
            <motion.div
              initial={{ scale: 1.8, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: -3 }}
              transition={{ delay: 1.8, type: 'spring', stiffness: 300, damping: 16 }}
              className="rounded-xl bg-paper px-[0.8em] py-[0.2em] text-center shadow-2xl"
            >
              {winner && loser ? (
                <p className="font-serif text-[1.6em] font-black">
                  <span className={winner === 'A' ? 'text-teamA' : 'text-teamB'}>Team {winner} is hired!</span>{' '}
                  <span className="text-ink/70">Team {loser} gets a rematch.</span>
                </p>
              ) : (
                <p className="font-serif text-[1.6em] font-black">It's a tie! Everybody gets a coffee.</p>
              )}
              {standings.decidedBy === 'stars' && <p className="font-hand text-[1em]">Tie broken by ⭐ bonus stars.</p>}
              {standings.decidedBy === 'count' && <p className="font-hand text-[1em]">Tie broken by number of reviewed sentences.</p>}
            </motion.div>
          )}
        </AnimatePresence>
        {footer}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ rejoin overlay

export function RejoinOverlay({ url, remainingMs }: { url: string; remainingMs: number }) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      className="absolute right-[0.8em] top-[3.2em] z-20 w-[11em]"
    >
      <PaperCard id="rejoin" className="flex flex-col items-center gap-[0.2em] p-[0.5em] text-center" ring={false}>
        <p className="font-serif text-[0.9em] font-black leading-tight">Lost your seat? Scan to rejoin</p>
        <QR value={url} className="w-full" />
        <p className="font-mono text-[0.9em] font-bold tabular-nums text-maroon">
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
        </p>
      </PaperCard>
    </motion.div>
  );
}
