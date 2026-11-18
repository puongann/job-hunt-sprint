/** All sounds are synthesised with the Web Audio API: no asset files. */
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

function ready(): AudioContext | null {
  if (!enabled || muted || !ctx) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {}) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.3, lowpass = 400) {
  const c = ready();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  tick: () => tone(1200, 0.05, { type: 'square', gain: 0.08 }),
  buzzer: () => {
    tone(140, 0.7, { type: 'sawtooth', gain: 0.18 });
    tone(147, 0.7, { type: 'sawtooth', gain: 0.12 });
  },
  ting: () => {
    tone(1568, 0.25, { gain: 0.12 });
    tone(2093, 0.3, { gain: 0.08, delay: 0.05 });
  },
  thump: () => {
    tone(110, 0.25, { gain: 0.5, slideTo: 45 });
    noise(0.15, 0.35, 300);
  },
  fanfare: () => {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((n, i) => tone(n, i === notes.length - 1 ? 0.6 : 0.16, { type: 'triangle', gain: 0.18, delay: i * 0.14 }));
  },
  ding: () => tone(880, 0.6, { gain: 0.14, type: 'triangle' }),
  click: () => tone(600, 0.04, { type: 'square', gain: 0.05 }),
};
