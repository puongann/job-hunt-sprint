/** All sounds are synthesised with the Web Audio API (no asset files) and kept soft. */
import { useSyncExternalStore } from 'react';

let ctx: AudioContext | null = null;
let enabled = false;
let muted = readMuted();
const subs = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem('hirer.muted') === '1';
  } catch {
    return false;
  }
}

function emit() {
  subs.forEach((s) => s());
}

/** Must be called from a user gesture (browser autoplay rule). */
export function enableSound() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    void ctx.resume();
    enabled = true;
    emit();
  } catch {
    enabled = false;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('hirer.muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  emit();
}

export function useSoundState() {
  const snap = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => `${enabled ? 1 : 0}${muted ? 1 : 0}`,
  );
  return { enabled: snap[0] === '1', muted: snap[1] === '1' };
}

let master: GainNode | null = null;

/** Soft master chain: gentle volume, high frequencies rounded off, peaks levelled. */
function out(c: AudioContext): AudioNode {
  if (master) return master;
  master = c.createGain();
  master.gain.value = 0.7;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master.connect(lp).connect(comp).connect(c.destination);
  return master;
}

function ready(): AudioContext | null {
  if (!enabled || muted || !ctx) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A soft bell / marimba note: sine with a quiet overtone, quick attack, smooth decay. */
function bell(freq: number, opts: { dur?: number; gain?: number; delay?: number; bright?: number } = {}) {
  const c = ready();
  if (!c) return;
  const dur = opts.dur ?? 0.9;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.16, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(out(c));
  const partials: [number, number][] = [
    [1, 1],
    [2, opts.bright ?? 0.25],
    [3.01, (opts.bright ?? 0.25) * 0.3],
  ];
  partials.forEach(([mul, amp]) => {
    const o = c.createOscillator();
    const pg = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mul, t0);
    pg.gain.value = amp;
    o.connect(pg).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}

/** A short pitch glide: bubbles, pops, woodblock ticks. */
function glide(from: number, to: number, opts: { dur?: number; gain?: number; delay?: number } = {}) {
  const c = ready();
  if (!c) return;
  const dur = opts.dur ?? 0.12;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.15, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out(c));
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** Filtered noise: paper rustle, soft thud. */
function rustle(dur: number, opts: { gain?: number; freq?: number; type?: BiquadFilterType; delay?: number } = {}) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const x = i / len;
    data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * x) * (1 - x);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 2500;
  f.Q.value = 0.7;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.12;
  src.connect(f).connect(g).connect(out(c));
  src.start(t0);
}

// Notes (Hz)
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G4 = 392, A4 = 440, F4 = 349.23;

let lastVoteAt = 0;

/** All sounds are soft: sine bells, marimba-like notes and paper noises. Nothing harsh. */
export const sfx = {
  /** A student joined the lobby: a little bubble pop. */
  join: () => glide(420, 880, { dur: 0.13, gain: 0.13 }),
  /** A round starts: rising three-note chime. */
  roundStart: () => [C5, E5, G5].forEach((n, i) => bell(n, { delay: i * 0.12, dur: 1, gain: 0.13 })),
  /** Last seconds of the timer: a quiet woodblock. */
  tick: () => glide(1100, 750, { dur: 0.06, gain: 0.06 }),
  /** Time is up: gentle falling chime. */
  buzzer: () => [G5, E5, C5].forEach((n, i) => bell(n, { delay: i * 0.16, dur: 1.1, gain: 0.14 })),
  /** A sentence was handed in: paper rustle and a tiny high bell. */
  ting: () => {
    rustle(0.18, { gain: 0.1, freq: 3000 });
    bell(E6, { delay: 0.05, dur: 0.5, gain: 0.05, bright: 0.1 });
  },
  /** Voting opens: two soft notes. */
  votingOpen: () => {
    bell(G5, { dur: 0.7, gain: 0.12 });
    bell(C6, { delay: 0.14, dur: 0.9, gain: 0.12 });
  },
  /** A vote came in (throttled so 15 votes do not become noise). */
  vote: () => {
    const now = Date.now();
    if (now - lastVoteAt < 120) return;
    lastVoteAt = now;
    glide(700, 1000, { dur: 0.07, gain: 0.06 });
  },
  /** Rubber stamp landing on paper: a soft thud. */
  thump: () => {
    glide(170, 70, { dur: 0.22, gain: 0.3 });
    rustle(0.12, { gain: 0.18, freq: 300, type: 'lowpass' });
  },
  hired: () => [C5, E5, G5, C6].forEach((n, i) => bell(n, { delay: 0.12 + i * 0.09, dur: 1.2, gain: 0.12 })),
  maybe: () => {
    bell(E5, { delay: 0.12, dur: 0.8, gain: 0.11 });
    bell(D5, { delay: 0.3, dur: 1, gain: 0.11 });
  },
  rejected: () => {
    bell(A4, { delay: 0.12, dur: 0.8, gain: 0.12, bright: 0.1 });
    bell(F4, { delay: 0.34, dur: 1.2, gain: 0.12, bright: 0.1 });
  },
  /** Scores revealed. */
  ding: () => bell(A5, { dur: 1.2, gain: 0.12 }),
  /** Winning team: marimba run and a warm final chord. */
  fanfare: () => {
    [G4, C5, E5, G5, C6].forEach((n, i) => bell(n, { delay: i * 0.11, dur: 0.6, gain: 0.12 }));
    [C5, E5, G5, C6].forEach((n) => bell(n, { delay: 0.65, dur: 2, gain: 0.08 }));
  },
  click: () => glide(900, 700, { dur: 0.04, gain: 0.04 }),
};
