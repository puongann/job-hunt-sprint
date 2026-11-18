import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_NAME } from '../config/brand';
import { Btn, PaperCard, cx } from '../components/ui';
import { employeeOfMonth, finalScore, standings, studentAverage, type ScorableSentence } from '../lib/scoring';
import { enableSound, setMuted, useSoundState } from '../lib/sound';
import type { RoundConfig, Score, VoteTally } from '../lib/types';
import { BigLeaderboard, BigLobby, BigReview, BigWriting, Masthead, Stage, type LobbyPlayer } from '../views/Big';
import { Note, PhoneJoinForm, PhoneLeaderboard, PhoneLobby, PhoneReview, PhoneShell, PhoneWriting } from '../views/Phone';

/* Fully client-side: no Firebase, no room. Uses the real components with scripted data,
   and computes everything through scoring.ts and diff.ts (via DiffText). */

const TEAM_NAMES = { A: 'Pilot', B: 'Nurse' };
const STEPS = ['Welcome', 'Join', 'Write', 'Review', 'Correct', 'Vote', 'Score & reveal', 'Team score'] as const;
const AUTO_MS = [6000, 7000, 9000, 6000, 7000, 7000, 13000, 9000];

const ROUND: RoundConfig = {
  id: 'demo',
  title: 'Pilot or nurse?',
  brief: 'Which job is better? Write 1 sentence about 1 perk. Use a comparative.',
  type: 'choice',
  options: ['Pilot', 'Nurse'],
  aspects: ['salary', 'stress', 'travel', 'sleep', 'uniform'],
  leftLabel: 'Pilot',
  rightLabel: 'Nurse',
  table: [],
  frames: ['A ___ is [adj + -er / more + adj] than a ___.'],
  challenges: [{ name: 'The more ..., the more ...', example: 'The more you practise, the better you speak.' }],
  timerSeconds: 20,
  maxPerStudent: 1,
  closingLine: '',
};

const NAMES: [string, 'A' | 'B'][] = [
  ['Long', 'A'],
  ['Hana', 'A'],
  ['Minh', 'B'],
  ['Linh', 'A'],
  ['Tuan', 'B'],
  ['Ngoc', 'A'],
  ['Huy', 'B'],
  ['Trang', 'A'],
  ['Duc', 'B'],
  ['Lan', 'A'],
  ['Nam', 'B'],
  ['Thao', 'A'],
  ['Khoa', 'B'],
  ['Vy', 'A'],
];
const PLAYERS: LobbyPlayer[] = [{ id: 'mai', nickname: 'Mai', team: 'B', online: true }, ...NAMES.map(([n, t]) => ({ id: n, nickname: n, team: t, online: true }))];

const ORIGINAL = 'A pilot is more rich that a nurse.';
const CORRECTION_FRAMES = [
  ORIGINAL,
  'A pilot is rich that a nurse.',
  'A pilot is richer that a nurse.',
  'A pilot is richer tha a nurse.',
  'A pilot is richer than a nurse.',
];
const MAI_TALLY: VoteTally = { 0: 2, 1: 3, 2: 9 };
const STAR_TEXT = 'The more you fly, the more you earn.';
const STAR_TALLY: VoteTally = { 0: 1, 1: 3, 2: 10 };

const OTHER_CARDS = [
  'A nurse is kinder than a pilot.',
  'A pilot travels more than a nurse.',
  'Nurse is more helpful than pilot.',
  'A pilot sleeps less than a nurse.',
  'A nurse is more safe than a pilot.',
  'Pilot uniform is cooler than nurse uniform.',
  'A nurse works longer than a pilot.',
  'A pilot is busier than a nurse.',
  'A nurse is happier than a pilot.',
];

// Fake team results (A 1.40, B 1.75) - computed by the real standings().
const TEAM_SENTENCES: ScorableSentence[] = [
  { authorPlayerId: 'mai', authorNickname: 'Mai', team: 'B', finalScore: finalScore(MAI_TALLY, 2), locked: true, challenge: false },
  { authorPlayerId: 'Minh', authorNickname: 'Minh', team: 'B', finalScore: 1.75, locked: true, challenge: false },
  { authorPlayerId: 'Long', authorNickname: 'Long', team: 'A', finalScore: 1.5, locked: true, challenge: true },
  { authorPlayerId: 'Hana', authorNickname: 'Hana', team: 'A', finalScore: 1.3, locked: true, challenge: false },
];

function typed(text: string, t: number, start: number, cps = 14) {
  const n = Math.max(0, Math.floor(((t - start) / 1000) * cps));
  return text.slice(0, n);
}

function useStepTime(step: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    setT(0);
    const t0 = performance.now();
    const id = setInterval(() => setT(performance.now() - t0), 100);
    return () => clearInterval(id);
  }, [step]);
  return t;
}

export default function DemoPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(false);
  const t = useStepTime(step);
  const sound = useSoundState();
  const last = STEPS.length - 1;

  const next = useCallback(() => setStep((s) => Math.min(last, s + 1)), [last]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') back();
      else if (e.key.toLowerCase() === 'a') setAuto((a) => !a);
      else if (e.key === 'Escape') navigate('/main');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, navigate]);

  useEffect(() => {
    if (!auto || step === last) return;
    const id = setTimeout(next, AUTO_MS[step]);
    return () => clearTimeout(id);
  }, [auto, step, next, last]);

  const { big, phone, phone2, caption } = useScene(step, t, () => navigate('/main'));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-paper">
      {/* progress bar with step names */}
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="hidden shrink-0 font-serif text-lg font-black lg:inline">{GAME_NAME} · demo</span>
        <ol className="flex flex-1 gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                onClick={() => setStep(i)}
                className={cx(
                  'w-full rounded px-1 py-1 text-xs font-bold uppercase tracking-wide transition',
                  i === step ? 'bg-maroon text-paper' : i < step ? 'bg-white/30 text-paper' : 'bg-white/10 text-paper/60',
                )}
              >
                {i + 1}
                <span className="hidden xl:inline">. {s}</span>
              </button>
            </li>
          ))}
        </ol>
        {!sound.enabled ? (
          <button onClick={enableSound} className="shrink-0 whitespace-nowrap rounded bg-paper px-3 py-1 text-sm font-semibold text-ink">
            🔊 Enable sound
          </button>
        ) : (
          <button onClick={() => setMuted(!sound.muted)} className="rounded bg-white/10 px-3 py-1" title="Mute">
            {sound.muted ? '🔇' : '🔊'}
          </button>
        )}
        <button
          onClick={() => setAuto((a) => !a)}
          className={cx('shrink-0 whitespace-nowrap rounded px-3 py-1 text-sm', auto ? 'bg-maybe text-ink' : 'bg-white/10')}
        >
          {auto ? '❚❚ Auto' : '▶ Auto (A)'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-3">
        <div className="flex min-w-0 flex-[7] flex-col justify-center">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
            <Stage>{big}</Stage>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={`${step}-${caption}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-center font-hand text-3xl"
            >
              {caption}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1 text-center text-sm text-paper/50">Space / → next · ← back · A auto-play · Esc exit</p>
        </div>
        <div className="flex shrink-0 items-center justify-center gap-3">
          <PhoneMockup label={phone.label}>{phone.node}</PhoneMockup>
          {phone2 && (
            <PhoneMockup label={phone2.label} small>
              {phone2.node}
            </PhoneMockup>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneMockup({ children, label, small }: { children: ReactNode; label: string; small?: boolean }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // Fit the phone into ~28% of the width (main phone) and the available height.
  const widthBudget = size.w * (small ? 0.14 : 0.26);
  const scale = Math.max(0.3, Math.min(small ? 0.62 : 1, (size.h - 150) / 800, widthBudget / 384));
  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: 360 * scale + 24 * scale, height: 760 * scale + 24 * scale }} className="relative">
        <div
          className="absolute left-0 top-0 origin-top-left rounded-[44px] bg-[#111] p-3 shadow-2xl ring-2 ring-white/20"
          style={{ transform: `scale(${scale})`, width: 384, height: 784 }}
        >
          <div className="absolute left-1/2 top-3 z-20 h-5 w-24 -translate-x-1/2 rounded-b-xl bg-[#111]" />
          <div className="no-scrollbar h-[760px] w-[360px] overflow-y-auto overflow-x-hidden rounded-[34px] bg-cork text-ink">{children}</div>
        </div>
      </div>
      <span className="text-sm text-paper/70">{label}</span>
    </div>
  );
}

interface Scene {
  big: ReactNode;
  phone: { label: string; node: ReactNode };
  phone2?: { label: string; node: ReactNode };
  caption: string;
}

function useScene(step: number, t: number, startForReal: () => void): Scene {
  const maiFinal = finalScore(MAI_TALLY, 2);
  const starFinal = finalScore(STAR_TALLY, 2);
  const teamStandings = useMemo(() => standings(TEAM_SENTENCES), []);
  const eom = useMemo(() => employeeOfMonth(TEAM_SENTENCES), []);
  const maiShell = (node: ReactNode) => (
    <PhoneShell embedded nickname="Mai" team="B" teamName={TEAM_NAMES.B}>
      {node}
    </PhoneShell>
  );
  const longShell = (node: ReactNode) => (
    <PhoneShell embedded nickname="Long" team="A" teamName={TEAM_NAMES.A}>
      {node}
    </PhoneShell>
  );
  const reviewBase = {
    round: ROUND,
    showDeletions: true,
    reviewedCount: 0,
    totalCount: 15,
    teamNames: TEAM_NAMES,
    code: 'DEMO',
    eligible: 14,
    voteCount: 0,
    reveal: null,
  };

  switch (step) {
    case 0:
      return {
        caption: 'Two teams. Phones only. Write, vote, get hired.',
        big: (
          <>
            <Masthead />
            <div className="flex flex-1 flex-col items-center justify-center gap-[0.8em] px-[2em] pb-[1em]">
              <PaperCard id="welcome" className="px-[1.4em] pb-[0.8em] pt-[1em] text-center">
                <h1 className="font-serif text-[2.4em] font-black leading-tight">Welcome to your first day.</h1>
                <p className="font-hand text-[1.8em] text-maroon">Coffee not included.</p>
              </PaperCard>
              <div className="grid grid-cols-4 gap-[0.6em] text-center text-[0.85em]">
                {[
                  ['📱', 'Join on your phone', 'Team A or Team B'],
                  ['✍️', 'Write sentences', 'Comparatives & superlatives'],
                  ['🗳️', 'Vote', 'REJECTED · MAYBE · HIRED'],
                  ['🏆', 'Team score', '50% you + 50% teacher'],
                ].map(([icon, a, b], i) => (
                  <motion.div
                    key={a}
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.35 }}
                    className="paper plain p-[0.5em]"
                  >
                    <div className="text-[1.6em]">{icon}</div>
                    <p className="font-bold">{a}</p>
                    <p className="text-[0.8em] text-ink/70">{b}</p>
                  </motion.div>
                ))}
              </div>
              <div className="flex gap-[0.6em] text-[0.9em]">
                <span className="rounded-full bg-teamA px-[0.6em] font-bold text-white">{TEAM_NAMES.A}</span>
                <span className="rounded-full bg-teamB px-[0.6em] font-bold text-white">{TEAM_NAMES.B}</span>
              </div>
            </div>
          </>
        ),
        phone: { label: 'A student phone', node: maiShell(<Note>Welcome to your first day. Coffee not included.</Note>) },
      };

    case 1: {
      const code = typed('DEMO', t, 600, 6);
      const nick = typed('Mai', t, 1700, 5);
      const team = t > 2800 ? 'B' : 'A';
      const joined = t > 3800;
      const shown = PLAYERS.slice(1, 1 + Math.min(14, Math.floor(t / 350))).concat(joined ? [PLAYERS[0]] : []);
      const counts = { A: shown.filter((p) => p.team === 'A').length, B: shown.filter((p) => p.team === 'B').length };
      return {
        caption: 'Scan the QR, type the office code, pick a nickname and a team.',
        big: <BigLobby code="DEMO" joinUrl={`${window.location.origin}/?code=DEMO`} teamNames={TEAM_NAMES} players={shown} joinOpen />,
        phone: {
          label: "Mai's phone",
          node: joined ? (
            maiShell(<PhoneLobby />)
          ) : (
            <PhoneShell embedded>
              <PhoneJoinForm code={code} nickname={nick} team={team} counts={counts} teamNames={TEAM_NAMES} busy={t > 3300} />
            </PhoneShell>
          ),
        },
      };
    }

    case 2: {
      const remaining = 15000 - t;
      const draft = typed(ORIGINAL, t, 800, 16);
      const saved = t > 800 + (ORIGINAL.length / 16) * 1000 + 600;
      const others = OTHER_CARDS.slice(0, Math.max(0, Math.floor((t - 500) / 600))).map((text, i) => ({ id: `c${i}`, text }));
      const cards = saved ? [...others.slice(0, 3), { id: 'mai', text: ORIGINAL }, ...others.slice(3)] : others;
      return {
        caption: 'Write on your phone. On the big screen, applications stay CONFIDENTIAL.',
        big: (
          <BigWriting
            code="DEMO"
            round={ROUND}
            roundIndex={0}
            remainingMs={remaining}
            totalMs={20000}
            cards={cards}
            submittedCount={cards.length}
            playerCount={15}
            showText={false}
          />
        ),
        phone: {
          label: "Mai's phone",
          node: maiShell(
            <PhoneWriting
              round={ROUND}
              remainingMs={remaining}
              totalMs={20000}
              slots={[{ slot: 1, saved: saved ? ORIGINAL : null }]}
              draftsOverride={saved ? undefined : { 1: draft }}
            />,
          ),
        },
      };
    }

    case 3:
      return {
        caption: 'One sentence at a time. Author hidden until the end.',
        big: <BigReview {...reviewBase} sentenceId="mai" originalText={ORIGINAL} correctedText={null} step="present" />,
        phone: {
          label: "Long's phone",
          node: longShell(
            <PhoneReview step="present" originalText={ORIGINAL} correctedText={null} showDeletions isAuthor={false} myVote={null} teamNames={TEAM_NAMES} />,
          ),
        },
      };

    case 4: {
      const idx = Math.min(CORRECTION_FRAMES.length - 1, Math.max(0, Math.floor((t - 800) / 900)));
      const corrected = idx === 0 ? null : CORRECTION_FRAMES[idx];
      return {
        caption: 'The teacher corrects live. New words are red and bold.',
        big: <BigReview {...reviewBase} sentenceId="mai" originalText={ORIGINAL} correctedText={corrected} step="present" />,
        phone: {
          label: "Long's phone",
          node: longShell(
            <PhoneReview step="present" originalText={ORIGINAL} correctedText={corrected} showDeletions isAuthor={false} myVote={null} teamNames={TEAM_NAMES} />,
          ),
        },
      };
    }

    case 5: {
      const corrected = CORRECTION_FRAMES[CORRECTION_FRAMES.length - 1];
      const count = Math.min(14, Math.floor(t / 300));
      const myVote: Score | null = t > 1800 ? 2 : null;
      return {
        caption: 'Everyone votes, except the author. The split stays secret.',
        big: <BigReview {...reviewBase} sentenceId="mai" originalText={ORIGINAL} correctedText={corrected} step="voting" voteCount={count} />,
        phone: {
          label: "Long's phone",
          node: longShell(
            <PhoneReview step="voting" originalText={ORIGINAL} correctedText={corrected} showDeletions isAuthor={false} myVote={myVote} teamNames={TEAM_NAMES} />,
          ),
        },
        phone2: {
          label: "Mai's phone (the author)",
          node: maiShell(
            <PhoneReview step="voting" originalText={ORIGINAL} correctedText={corrected} showDeletions isAuthor myVote={null} teamNames={TEAM_NAMES} />,
          ),
        },
      };
    }

    case 6: {
      const corrected = CORRECTION_FRAMES[CORRECTION_FRAMES.length - 1];
      const second = t > 7500;
      if (!second) {
        return {
          caption: `Final score = 50% students (${studentAverage(MAI_TALLY)?.toFixed(2)}) + 50% teacher (2) = ${maiFinal.toFixed(2)}`,
          big: (
            <BigReview
              {...reviewBase}
              reviewedCount={1}
              sentenceId="mai"
              originalText={ORIGINAL}
              correctedText={corrected}
              step="revealed"
              voteCount={14}
              reveal={{ tally: MAI_TALLY, studentAvg: studentAverage(MAI_TALLY), teacherScore: 2, finalScore: maiFinal, challenge: false, authorNickname: 'Mai', team: 'B' }}
            />
          ),
          phone: {
            label: "Mai's phone",
            node: maiShell(
              <PhoneReview
                step="revealed"
                originalText={ORIGINAL}
                correctedText={corrected}
                showDeletions
                isAuthor
                myVote={null}
                finalScore={t > 3500 ? maiFinal : null}
                authorNickname={t > 4400 ? 'Mai' : undefined}
                authorTeam="B"
                teamNames={TEAM_NAMES}
              />,
            ),
          },
        };
      }
      return {
        caption: 'Used a "Level up!" structure correctly? You get a ⭐. Stars never change the score; they only break ties.',
        big: (
          <BigReview
            {...reviewBase}
            reviewedCount={2}
            sentenceId="long"
            originalText={STAR_TEXT}
            correctedText={null}
            step="revealed"
            voteCount={14}
            reveal={{ tally: STAR_TALLY, studentAvg: studentAverage(STAR_TALLY), teacherScore: 2, finalScore: starFinal, challenge: true, authorNickname: 'Long', team: 'A' }}
          />
        ),
        phone: {
          label: "Long's phone",
          node: longShell(
            <PhoneReview
              step="revealed"
              originalText={STAR_TEXT}
              correctedText={null}
              showDeletions
              isAuthor
              myVote={null}
              finalScore={starFinal}
              challenge
              authorNickname="Long"
              authorTeam="A"
              teamNames={TEAM_NAMES}
            />,
          ),
        },
      };
    }

    default:
      return {
        caption: 'Team score = average of the team\'s reviewed sentences.',
        big: (
          <BigLeaderboard
            code="DEMO"
            standings={teamStandings}
            teamNames={TEAM_NAMES}
            employee={eom}
            footer={
              <Btn className="pointer-events-auto mt-[0.3em] h-auto px-[1em] py-[0.3em] text-[1em]" onClick={startForReal}>
                Start for real ▶
              </Btn>
            }
          />
        ),
        phone: { label: "Mai's phone", node: maiShell(<PhoneLeaderboard standings={teamStandings} teamNames={TEAM_NAMES} myTeam="B" />) },
      };
  }
}
