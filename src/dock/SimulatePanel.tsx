/**
 * DEV ONLY. Creates N bot students (each with its own anonymous Firebase user, so the
 * security rules apply to them exactly as to real phones). Bots join, write and vote.
 * Imported lazily behind `import.meta.env.DEV`, so it is not part of production builds.
 */
import { deleteApp, type FirebaseApp } from 'firebase/app';
import { doc, onSnapshot } from 'firebase/firestore';
import { useState, useSyncExternalStore } from 'react';
import { createIsolatedUser, fb } from '../lib/firebase';
import { sentenceId, voteId } from '../lib/ids';
import type { Player, Room, Score, Team } from '../lib/types';
import { restCommit } from './botRest';

interface Bot {
  uid: string;
  app: FirebaseApp;
  token: () => Promise<string>;
  player: Player;
}

const NAMES = ['Mai', 'Long', 'Hana', 'Minh', 'Linh', 'Tuan', 'Ngoc', 'Huy', 'Trang', 'Duc', 'Lan', 'Nam', 'Thao', 'Khoa', 'Vy', 'Bao', 'An', 'Phuc', 'Yen', 'Quan', 'Hieu', 'My', 'Son', 'Ha', 'Kien', 'Nhi', 'Dat', 'Chi', 'Viet', 'Tam'];

const BANK = [
  'I choose teacher because it is more safe than YouTuber.',
  'I choose YouTuber because it is more fun than teacher.',
  'Teacher is safer than YouTuber.',
  'A YouTuber has more freedom than a teacher.',
  'I choose teacher because it is less stress than YouTuber.',
  'Self-employed is more richer than company worker.',
  'Company worker has more holiday than self-employed.',
  'The best thing for me is the cat.',
  'Self-employed people work longer than company workers.',
  'The most important thing for me is salary.',
  'Company work is not as tiring as self-employed work.',
  'The commute of self-employed is shortest.',
  'The more you work, the more you earn.',
  'Self-employed earns much more money than company worker.',
  'Company worker is as happy as a cat on Sunday.',
  'Self-employed salary is almost twice as high as company salary.',
];

let bots: Bot[] = [];
let stopDriver: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
const rand = (a: number, b: number) => a + Math.random() * (b - a);

async function addBots(room: Room, n: number, log: (m: string) => void) {
  const taken = new Set(bots.map((b) => b.player.nickname.toLowerCase()));
  const base = bots.length;
  const plan = Array.from({ length: n }, (_, i) => {
    const idx = base + i;
    const root = NAMES[idx % NAMES.length];
    let nick = root;
    let k = 2;
    while (taken.has(nick.toLowerCase())) nick = `${root}${k++}`;
    taken.add(nick.toLowerCase());
    return { nick, team: (idx % 2 === 0 ? 'A' : 'B') as Team, idx };
  });
  // Join in small parallel batches.
  for (let i = 0; i < plan.length; i += 5) {
    await Promise.all(plan.slice(i, i + 5).map((p) => joinBot(room, p.nick, p.team, p.idx, log)));
  }
  ensureDriver(room.code, log);
}

/** The room's TTL value, copied onto every bot doc (rules require it). */
let botExpireAt: Record<string, string> | undefined;
const noteExpiry = (room: Room) => {
  botExpireAt = room.expireAt ? { expireAt: room.expireAt.toDate().toISOString() } : undefined;
};

async function joinBot(room: Room, nick: string, team: Team, idx: number, log: (m: string) => void) {
  noteExpiry(room);
  const user = await createIsolatedUser(`bot-${Date.now()}-${idx}`);
  const base = `rooms/${room.code}`;
  try {
    await restCommit(await user.token(), [
      { path: `${base}/members/${user.uid}`, fields: { playerId: user.uid, revoked: false }, timestamps: botExpireAt, mustNotExist: true },
      { path: `${base}/players/${user.uid}`, fields: { nickname: nick, team, currentUid: user.uid }, serverTime: ['joinedAt', 'lastSeenAt'], timestamps: botExpireAt, mustNotExist: true },
      { path: `${base}/nicknames/${nick.toLowerCase()}`, fields: { playerId: user.uid }, timestamps: botExpireAt, mustNotExist: true },
    ]);
    bots.push({ uid: user.uid, app: user.app, token: user.token, player: { id: user.uid, nickname: nick, team, joinedAt: null, lastSeenAt: null, currentUid: user.uid } });
    emit();
  } catch (e) {
    log(`Bot ${nick} could not join: ${(e as Error).message}`);
    await deleteApp(user.app);
  }
}

async function botWriteSentence(roomId: string, b: Bot, roundId: string, slot: number, text: string) {
  await restCommit(await b.token(), [
    {
      path: `rooms/${roomId}/sentences/${sentenceId(roundId, b.uid, slot)}`,
      fields: { roundId, slot, authorPlayerId: b.uid, authorNickname: b.player.nickname, team: b.player.team, originalText: text },
      serverTime: ['createdAt', 'updatedAt'],
      timestamps: botExpireAt,
      mustNotExist: true,
    },
  ]);
}

async function botChooseSide(roomId: string, b: Bot, team: Team, roundId: string) {
  await restCommit(await b.token(), [
    { path: `rooms/${roomId}/players/${b.uid}`, fields: { team, sideRound: roundId }, mask: ['team', 'sideRound'] },
  ]);
}

async function botVote(roomId: string, b: Bot, sid: string, value: Score) {
  await restCommit(await b.token(), [
    { path: `rooms/${roomId}/votes/${voteId(sid, b.uid)}`, fields: { sentenceId: sid, playerId: b.uid, value }, serverTime: ['updatedAt'], timestamps: botExpireAt },
  ]);
}

async function botHeartbeat(roomId: string, b: Bot) {
  await restCommit(await b.token(), [{ path: `rooms/${roomId}/players/${b.uid}`, fields: {}, mask: [], serverTime: ['lastSeenAt'] }]);
}

function ensureDriver(roomId: string, log: (m: string) => void) {
  if (stopDriver) return;
  const wrote = new Set<string>(); // `${roundId}|${uid}`
  const voted = new Set<string>(); // `${sentenceId}|${uid}`
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, f: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      f();
    }, ms);
    timers.add(t);
  };
  const hb = setInterval(() => {
    bots.forEach((b) => botHeartbeat(roomId, b).catch(() => {}));
  }, 15_000);

  const unsub = onSnapshot(doc(fb().db, 'rooms', roomId), async (snap) => {
    const room = snap.data() as Room | undefined;
    if (!room) return;
    noteExpiry(room);
    if (room.phase === 'writing' && room.currentRoundId) {
      const round = room.rounds[room.currentRoundId];
      const remaining = (room.timerEndsAt?.toMillis() ?? 0) - Date.now();
      if (remaining <= 1500) return;
      for (const b of bots) {
        const key = `${round.id}|${b.uid}`;
        if (wrote.has(key)) continue;
        wrote.add(key);
        const count = Math.max(1, Math.round(rand(0.6, round.maxPerStudent)));
        // Table rounds: read, then pick a side before writing.
        const sideReady =
          round.type === 'table'
            ? new Promise<void>((resolve) =>
                later(rand(800, 3000), () => {
                  const team: Team = Math.random() < 0.5 ? 'A' : 'B';
                  botChooseSide(roomId, b, team, room.sideKey ?? round.id)
                    .then(() => (b.player.team = team))
                    .catch((e) => log(`${b.player.nickname} could not choose a side: ${(e as Error).message}`))
                    .finally(resolve);
                }),
              )
            : Promise.resolve();
        for (let slot = 1; slot <= count; slot++) {
          later(rand(3500, Math.min(25_000, remaining * 0.6)) + slot * 800, async () => {
            await sideReady;
            const text = BANK[Math.floor(Math.random() * BANK.length)];
            botWriteSentence(roomId, b, round.id, slot, text).catch((e) =>
              log(`${b.player.nickname} could not write: ${(e as Error).message}`),
            );
          });
        }
      }
    }
    if (room.phase === 'review' && room.sentenceStep === 'voting' && room.currentSentenceId) {
      const sid = room.currentSentenceId;
      for (const b of bots) {
        const key = `${sid}|${b.uid}`;
        if (voted.has(key) || sid.includes(`_${b.uid}_`)) continue;
        voted.add(key);
        later(rand(800, 6000), () => {
          const r = Math.random();
          const v: Score = r < 0.15 ? 0 : r < 0.45 ? 1 : 2;
          botVote(roomId, b, sid, v).catch(() => {});
        });
      }
    }
  });
  stopDriver = () => {
    unsub();
    clearInterval(hb);
    timers.forEach(clearTimeout);
    stopDriver = null;
  };
}

async function removeBots() {
  stopDriver?.();
  const old = bots;
  bots = [];
  emit();
  await Promise.all(old.map((b) => deleteApp(b.app).catch(() => {})));
}

export default function SimulatePanel({ room }: { room: Room }) {
  const count = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => bots.length,
  );
  const [n, setN] = useState(15);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const addLog = (m: string) => setLog((l) => [m, ...l].slice(0, 6));
  return (
    <div>
      <h3 className="font-serif text-xl font-black">Simulate class (dev only)</h3>
      <p className="mb-3 text-sm text-paper/70">
        Bots join with their own anonymous logins, write during rounds, and vote during voting. Joining needs "Join open". The
        bots stop when you reload this page.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          max={30}
          value={n}
          onChange={(e) => setN(Math.max(1, Math.min(30, Number(e.target.value))))}
          className="h-10 w-20 rounded bg-white/10 px-2 text-paper"
        />
        <button
          disabled={busy || !room.joinOpen}
          className="h-10 rounded-md bg-maroon px-3 font-semibold disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            await addBots(room, n, addLog).catch((e) => addLog((e as Error).message));
            setBusy(false);
          }}
        >
          {busy ? 'Hiring bots...' : `Add ${n} bot students`}
        </button>
        <button className="h-10 rounded-md bg-white/10 px-3" onClick={() => removeBots()}>
          Stop bots
        </button>
        <span className="text-paper/80">{count} bots active</span>
        {!room.joinOpen && <span className="text-maybe">Turn "Join open" on first.</span>}
      </div>
      {log.map((l, i) => (
        <p key={i} className="mt-1 text-sm text-rejected">
          {l}
        </p>
      ))}
    </div>
  );
}
