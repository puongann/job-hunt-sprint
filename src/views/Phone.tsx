import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { GAME_NAME } from '../config/brand';
import { DiffText } from '../components/Correction';
import { Btn, CountUp, PaperCard, RoundData, STAMPS, Stamp, TeamBadge, TimerBar, cx } from '../components/ui';
import { fmt2, stampFor, type Standings } from '../lib/scoring';
import type { RoundConfig, Score, SentenceStep, Team } from '../lib/types';

/* Phone views size themselves to their container (real phone or the demo's phone mockup). */

export function PhoneShell({
  nickname,
  team,
  teamName,
  children,
  banner,
  embedded = false,
}: {
  embedded?: boolean;
  nickname?: string;
  team?: Team;
  teamName?: string;
  children: ReactNode;
  banner?: ReactNode;
}) {
  return (
    <div className={cx('cork flex flex-col', embedded ? 'min-h-full' : 'min-h-[100dvh]')}>
      <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between gap-2 bg-maroon px-4 text-paper shadow-md">
        <span className="font-serif text-lg font-black">{GAME_NAME}</span>
        {nickname && team && (
          <span className="flex items-center gap-2 text-sm">
            <b className="max-w-[7rem] truncate">{nickname}</b>
            <TeamBadge team={team} name={teamName ? teamName.split(' - ')[0] : undefined} className="text-xs" />
          </span>
        )}
      </header>
      {banner}
      <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
    </div>
  );
}

export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cx('rounded-lg bg-paper/90 px-3 py-2 text-center font-hand text-2xl leading-tight shadow', className)}>{children}</p>;
}

// ------------------------------------------------------------------ join form

export function PhoneJoinForm({
  code,
  nickname,
  team,
  counts,
  teamNames,
  onCode,
  onNickname,
  onTeam,
  onSubmit,
  busy,
  error,
  roomFound,
}: {
  code: string;
  nickname: string;
  team: Team;
  counts: { A: number; B: number } | null;
  teamNames: { A: string; B: string };
  onCode?: (v: string) => void;
  onNickname?: (v: string) => void;
  onTeam?: (t: Team) => void;
  onSubmit?: () => void;
  busy?: boolean;
  error?: string | null;
  roomFound?: boolean;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <PaperCard id="join-form" className="flex flex-col gap-3 p-4 pt-6" tilt={false}>
        <h1 className="font-serif text-2xl font-black leading-tight">Job application form</h1>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Enter the 4-letter office code.</span>
          <input
            value={code}
            onChange={(e) => onCode?.(e.target.value)}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            placeholder="ABCD"
            className="h-14 rounded-lg border-2 border-ink/20 bg-white px-3 text-center font-mono text-3xl font-black uppercase tracking-[0.4em] outline-none focus:border-maroon"
          />
          {code.length === 4 && roomFound === false && <span className="text-sm text-rejected">No office with that code.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Your nickname</span>
          <input
            value={nickname}
            onChange={(e) => onNickname?.(e.target.value)}
            maxLength={16}
            autoComplete="off"
            placeholder="2-16 characters"
            className="h-12 rounded-lg border-2 border-ink/20 bg-white px-3 text-lg outline-none focus:border-maroon"
          />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-semibold">Pick your team</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as Team[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => onTeam?.(t)}
                aria-pressed={team === t}
                className={cx(
                  'flex min-h-[64px] flex-col items-center justify-center rounded-xl border-4 px-2 py-1 text-center font-bold transition',
                  team === t
                    ? t === 'A'
                      ? 'border-teamA bg-teamA text-white'
                      : 'border-teamB bg-teamB text-white'
                    : 'border-ink/15 bg-white text-ink',
                )}
              >
                <span className="text-lg leading-tight">{teamNames[t].split(' - ')[0]}</span>
                <span className="text-xs opacity-90">{teamNames[t].split(' - ')[1] ?? ''}</span>
                {counts && <span className="text-xs opacity-90">{counts[t]} joined</span>}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p className="rounded-md bg-rejected/10 p-2 text-center font-semibold text-rejected">{error}</p>}
        <Btn type="submit" disabled={busy} className="h-14 text-lg">
          {busy ? 'Updating your CV...' : 'Apply for the job'}
        </Btn>
      </PaperCard>
    </form>
  );
}

// ------------------------------------------------------------------ lobby

export function PhoneLobby({ welcomeBack }: { welcomeBack?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      {welcomeBack && <Note>Welcome back to the office. The coffee machine missed you.</Note>}
      <motion.div
        className="text-7xl"
        animate={{ rotate: [0, -6, 6, 0] }}
        transition={{ repeat: Infinity, duration: 2.4 }}
        aria-hidden
      >
        ☕
      </motion.div>
      <Note>HR is preparing the office. Please do not touch the coffee machine.</Note>
      <p className="text-center text-sm text-ink/80">Keep this page open. The game starts on the big screen.</p>
    </div>
  );
}

// ------------------------------------------------------------------ writing

export interface SlotState {
  slot: number;
  saved: string | null;
}

export function PhoneWriting({
  round,
  remainingMs,
  totalMs,
  slots,
  onSave,
  draftsOverride,
  savingSlot,
  error,
}: {
  round: RoundConfig;
  remainingMs: number;
  totalMs: number;
  slots: SlotState[];
  onSave?: (slot: number, text: string) => void;
  draftsOverride?: Record<number, string>;
  savingSlot?: number | null;
  error?: string | null;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [openChip, setOpenChip] = useState<number | null>(null);
  const timeUp = remainingMs <= 0;
  const submitted = slots.filter((s) => s.saved).length;
  const value = (s: SlotState) => draftsOverride?.[s.slot] ?? drafts[s.slot] ?? s.saved ?? '';
  // Show one extra empty box at a time.
  const visible = slots.filter((s, i) => i === 0 || s.saved || slots[i - 1].saved || drafts[s.slot]);

  return (
    <>
      <div className="sticky top-[52px] z-10 -mx-4 -mt-4 bg-paper/95 px-4 py-2 shadow">
        <TimerBar remainingMs={remainingMs} totalMs={totalMs} className="text-lg" />
      </div>
      <PaperCard id={`brief-${round.id}`} tilt={false} className="p-4 pt-5" ring={false}>
        <h2 className="font-serif text-xl font-black leading-tight">{round.title}</h2>
        <p className="mt-1 text-[15px] leading-snug">{round.brief}</p>
        <div className="mt-3">
          <RoundData round={round} compact />
        </div>
        {round.frames.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/60">Sentence frames</p>
            {round.frames.map((f, i) => (
              <p key={i} className="rounded bg-ink/5 px-2 py-1 font-mono text-[13px]">
                {f}
              </p>
            ))}
          </div>
        )}
        {round.closingLine && <p className="mt-2 font-hand text-xl text-maroon">{round.closingLine}</p>}
      </PaperCard>

      {round.challenges.length > 0 && (
        <div className="rounded-xl bg-ink/80 p-3 text-paper shadow">
          <p className="mb-2 font-semibold">Level up! Try one of these for a bonus star.</p>
          <div className="flex flex-wrap gap-2">
            {round.challenges.map((c, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setOpenChip(openChip === i ? null : i)}
                aria-expanded={openChip === i}
                className={cx(
                  'min-h-[44px] rounded-full border-2 px-3 text-sm font-bold',
                  openChip === i ? 'border-maybe bg-maybe text-ink' : 'border-maybe/70 text-maybe',
                )}
              >
                ⭐ {c.name}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {openChip !== null && round.challenges[openChip] && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 overflow-hidden rounded bg-paper px-2 py-1 text-ink"
              >
                e.g. <i>{round.challenges[openChip].example}</i>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="rounded-full bg-ink px-3 py-1 text-sm font-bold text-paper">
          {submitted}/{round.maxPerStudent} submitted
        </span>
        {submitted > 0 && !timeUp && <span className="font-hand text-xl">Application received. HR will pretend to read it.</span>}
      </div>

      {timeUp ? (
        <Note className="text-rejected">Time's up! Pencils down, interns.</Note>
      ) : (
        visible.map((s) => {
          const v = value(s);
          const dirty = v.trim() !== (s.saved ?? '') && v.trim().length > 0;
          return (
            <div key={s.slot} className="paper plain p-3">
              <label className="mb-1 flex items-center justify-between text-sm font-semibold">
                <span>Sentence {s.slot}</span>
                <span className="tabular-nums text-ink/50">{v.length}/200</span>
              </label>
              <textarea
                value={v}
                maxLength={200}
                rows={3}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.slot]: e.target.value }))}
                placeholder="Write your sentence here..."
                className="w-full resize-none rounded-lg border-2 border-ink/15 bg-white p-2 text-lg outline-none focus:border-maroon"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm text-hired">{s.saved && !dirty ? '✓ Sent to HR' : ''}</span>
                <Btn
                  disabled={!dirty || savingSlot === s.slot}
                  onClick={() => onSave?.(s.slot, v)}
                  className="h-12 min-w-[8rem]"
                  variant={s.saved ? 'paper' : 'primary'}
                >
                  {savingSlot === s.slot ? 'Sending...' : s.saved ? 'Update' : 'Submit'}
                </Btn>
              </div>
            </div>
          );
        })
      )}
      {error && <p className="rounded bg-rejected/10 p-2 text-center font-semibold text-rejected">{error}</p>}
    </>
  );
}

// ------------------------------------------------------------------ review

export function PhoneReview({
  step,
  originalText,
  correctedText,
  showDeletions,
  isAuthor,
  myVote,
  onVote,
  finalScore,
  challenge,
  authorNickname,
  authorTeam,
  teamNames,
  voteError,
}: {
  step: SentenceStep | null;
  originalText: string | null;
  correctedText: string | null;
  showDeletions: boolean;
  isAuthor: boolean;
  myVote: Score | null;
  onVote?: (v: Score) => void;
  finalScore?: number | null;
  challenge?: boolean;
  authorNickname?: string;
  authorTeam?: Team;
  teamNames: { A: string; B: string };
  voteError?: string | null;
}) {
  if (!originalText || !step) {
    return <Note>HR is shuffling the applications...</Note>;
  }
  return (
    <>
      <PaperCard id="phone-review" className="p-4 pt-6" tilt={false}>
        <div className="mb-1 flex items-center justify-between text-xs text-ink/60">
          <span className="font-bold uppercase tracking-wider">Application</span>
          {isAuthor ? (
            <span className="rounded-full bg-maroon px-2 py-0.5 font-bold text-paper">Your sentence</span>
          ) : (
            step !== 'revealed' && <span className="font-hand text-base">Author hidden</span>
          )}
        </div>
        <p className="font-serif text-2xl font-semibold leading-snug">
          <DiffText original={originalText} corrected={correctedText} showDeletions={showDeletions} />
        </p>
      </PaperCard>

      {step === 'present' && <Note>Watch the big screen. The teacher is correcting live.</Note>}

      {step === 'voting' &&
        (isAuthor ? (
          <Note>Your application. HR says you cannot vote for yourself. Nice try.</Note>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-center font-semibold">Should HR hire this sentence?</p>
            {STAMPS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => onVote?.(s.value)}
                aria-pressed={myVote === s.value}
                className={cx(
                  'relative flex min-h-[72px] items-center justify-between rounded-2xl border-4 px-5 text-left transition active:scale-[0.98]',
                  myVote === s.value ? `${s.bg} border-ink text-white shadow-lg` : 'border-ink/10 bg-paper',
                )}
              >
                <span
                  className={cx('stamp text-2xl', myVote === s.value ? 'text-white' : s.cls)}
                  style={{ transform: `rotate(${s.value === 1 ? 3 : -4}deg)`, mixBlendMode: 'normal' }}
                >
                  {s.label}
                </span>
                <span className={cx('text-3xl font-black', myVote === s.value ? 'text-white' : 'text-ink/40')}>{s.value}</span>
              </button>
            ))}
            {myVote !== null && <Note>Your opinion has been filed (and politely ignored by HR).</Note>}
            {voteError && <p className="text-center font-semibold text-rejected">{voteError}</p>}
          </div>
        ))}

      {step === 'scoring' && (
        <Note>{isAuthor ? 'HR is deciding about your application...' : 'Your opinion has been filed (and politely ignored by HR).'}</Note>
      )}

      {step === 'revealed' && typeof finalScore === 'number' && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="paper plain flex flex-col items-center gap-2 p-4 text-center">
          <Stamp label={stampFor(finalScore)} className="text-3xl" />
          <p className="font-serif text-4xl font-black text-maroon">
            <CountUp value={finalScore} />
          </p>
          {challenge && <p className="rounded-full bg-maybe px-3 py-1 font-bold">⭐ Bonus structure unlocked!</p>}
          {authorNickname && authorTeam && (
            <p>
              <span className="font-hand text-xl">Application submitted by </span>
              <b>{authorNickname}</b> <TeamBadge team={authorTeam} name={teamNames[authorTeam].split(' - ')[0]} className="text-xs" />
            </p>
          )}
        </motion.div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ leaderboard

export function PhoneLeaderboard({ standings, teamNames, myTeam }: { standings: Standings; teamNames: { A: string; B: string }; myTeam?: Team }) {
  const w = standings.winner;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-center font-serif text-2xl font-black">Performance review</h2>
      {(['A', 'B'] as Team[]).map((t) => (
        <div key={t} className={cx('paper plain p-3', myTeam === t && 'ring-4 ring-maroon/40')}>
          <div className="flex items-center justify-between">
            <TeamBadge team={t} name={teamNames[t]} className="text-sm" />
            <b className="font-serif text-3xl">{fmt2(standings[t].score)}</b>
          </div>
          <p className="mt-1 text-sm text-ink/70">
            ⭐ {standings[t].stars} · {standings[t].counted} sentences counted
          </p>
        </div>
      ))}
      <Note>
        {w ? `Team ${w} is hired! Team ${w === 'A' ? 'B' : 'A'} gets a rematch.` : "It's a tie! Everybody gets a coffee."}
      </Note>
    </div>
  );
}

/** Tiny hook: ticks every second (for phone countdowns). */
export function useTick(ms = 500) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
