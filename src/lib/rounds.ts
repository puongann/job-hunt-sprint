import type { RoundConfig } from './types';

export const DEFAULT_ROUNDS: RoundConfig[] = [
  {
    id: 'r1',
    title: 'Choose ONE job',
    brief: 'You can keep only ONE job. Which do you choose? Write 1 sentence about 1 perk of your job. Use a comparative.',
    type: 'choice',
    options: ['Teacher', 'YouTuber'],
    aspects: ['salary', 'time', 'stress', 'freedom', 'fun', 'safety'],
    leftLabel: 'Teacher',
    rightLabel: 'YouTuber',
    table: [],
    frames: ['I choose ___ because it is [adj + -er / more + adj] than ___.'],
    challenges: [],
    timerSeconds: 240,
    maxPerStudent: 1,
    closingLine: '',
  },
  {
    id: 'r2',
    title: 'Company or self-employed?',
    brief:
      'Read the numbers. Choose ONE side. Give up to 3 reasons. Each reason is one comparison sentence. At least one reason must use a superlative.',
    type: 'table',
    options: ['Company worker', 'Self-employed'],
    aspects: [],
    leftLabel: 'Company worker',
    rightLabel: 'Self-employed',
    table: [
      { aspect: 'Salary', left: '20 million VND a month', right: '35 million VND a month' },
      { aspect: 'Working hours', left: '40 hours a week', right: '70 hours a week (hello, 2 a.m.)' },
      { aspect: 'Paid holiday', left: '12 days a year', right: '0 days a year (beach: closed)' },
      { aspect: 'Commute', left: '45 minutes by motorbike', right: '5 steps (pajamas allowed)' },
      { aspect: 'Colleagues', left: '20 people to chat with', right: '1 cat (very lazy)' },
    ],
    frames: [
      '___ is [adj + -er / more + adj] than ___.',
      '___ has more ___ than ___.',
      'The [adj + -est] thing is ...',
      'The most [adj] thing for me is ...',
      '___ is not as [adj] as ___.',
    ],
    challenges: [
      { name: 'The more ..., the more ...', example: 'The more you practise, the better you speak.' },
      { name: 'as ... as', example: 'My cat is as lazy as me on Sunday.' },
      { name: 'much / a lot / slightly + comparative', example: 'A pilot earns much more money than a nurse.' },
      { name: 'twice as ... as', example: "A pilot's salary is almost twice as high as a nurse's salary." },
    ],
    timerSeconds: 360,
    maxPerStudent: 3,
    closingLine: 'Nobody tells you which is higher. Work it out!',
  },
];

const KEY = 'hirer.roundTemplates.v1';

export function cloneRounds(r: RoundConfig[]): RoundConfig[] {
  return JSON.parse(JSON.stringify(r)) as RoundConfig[];
}

export function loadTemplates(): RoundConfig[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = parseRounds(JSON.parse(raw));
      if (parsed.length) return parsed;
    }
  } catch {
    /* fall through */
  }
  return cloneRounds(DEFAULT_ROUNDS);
}

export function saveTemplates(rounds: RoundConfig[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rounds));
  } catch {
    /* storage may be unavailable */
  }
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const clampInt = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

/** Validate/normalise round configs from JSON (import, localStorage, room doc). Throws on garbage. */
export function parseRounds(input: unknown): RoundConfig[] {
  const list = Array.isArray(input) ? input : (input as { rounds?: unknown })?.rounds;
  if (!Array.isArray(list)) throw new Error('Expected a list of rounds.');
  const seen = new Set<string>();
  return list.map((r: Record<string, unknown>, i) => {
    let id = str(r.id).replace(/[^A-Za-z0-9]/g, '') || `r${i + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const opts = strArr(r.options);
    return {
      id,
      title: str(r.title, `Round ${i + 1}`),
      brief: str(r.brief),
      type: r.type === 'table' ? 'table' : 'choice',
      options: [opts[0] ?? '', opts[1] ?? ''],
      aspects: strArr(r.aspects),
      leftLabel: str(r.leftLabel, opts[0] ?? ''),
      rightLabel: str(r.rightLabel, opts[1] ?? ''),
      table: Array.isArray(r.table)
        ? (r.table as Record<string, unknown>[]).map((row) => ({ aspect: str(row?.aspect), left: str(row?.left), right: str(row?.right) }))
        : [],
      frames: strArr(r.frames),
      challenges: Array.isArray(r.challenges)
        ? (r.challenges as Record<string, unknown>[]).map((c) => ({ name: str(c?.name), example: str(c?.example) })).filter((c) => c.name)
        : [],
      timerSeconds: clampInt(r.timerSeconds, 15, 3600, 240),
      maxPerStudent: clampInt(r.maxPerStudent, 1, 5, 1),
      closingLine: str(r.closingLine),
    } satisfies RoundConfig;
  });
}

export function exportRoundsFile(rounds: RoundConfig[]) {
  const blob = new Blob([JSON.stringify({ app: 'job-hunt-sprint', version: 1, rounds }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rounds-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function roomRoundsList(rounds: Record<string, RoundConfig> | undefined, order: string[] | undefined): RoundConfig[] {
  if (!rounds) return [];
  const ids = order?.filter((id) => rounds[id]) ?? [];
  const rest = Object.keys(rounds).filter((id) => !ids.includes(id));
  return [...ids, ...rest].map((id) => rounds[id]);
}
