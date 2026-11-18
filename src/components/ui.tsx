import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hashSeed } from '../lib/ids';
import { useReducedMotion } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { RoundConfig, Score, Team } from '../lib/types';

export const STAMPS: { value: Score; label: 'REJECTED' | 'MAYBE' | 'HIRED'; cls: string; bg: string }[] = [
  { value: 0, label: 'REJECTED', cls: 'stamp-rejected', bg: 'bg-rejected' },
  { value: 1, label: 'MAYBE', cls: 'stamp-maybe', bg: 'bg-maybe' },
  { value: 2, label: 'HIRED', cls: 'stamp-hired', bg: 'bg-hired' },
];

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function tiltFor(id: string, max = 3): number {
  return (hashSeed(id) * 2 - 1) * max;
}

/** A paper clip drawn in SVG. */
export function PaperClip({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 60" className={cx('absolute pointer-events-none drop-shadow', className)} aria-hidden>
      <path
        d="M8 52V12a6 6 0 0 1 12 0v36a9 9 0 0 1-18 0V18"
        fill="none"
        stroke="#8a8f98"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M8 52V12a6 6 0 0 1 12 0v36" fill="none" stroke="#d9dde3" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function PushPin({ color = '#C0392B', className = '' }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cx('absolute pointer-events-none', className)} aria-hidden>
      <circle cx="10" cy="10" r="7" fill={color} />
      <circle cx="7.5" cy="7.5" r="2.2" fill="rgba(255,255,255,.55)" />
    </svg>
  );
}

export function PaperCard({
  id,
  children,
  className = '',
  tilt = true,
  clip = true,
  ring = true,
  style,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  clip?: boolean;
  ring?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cx('paper', ring && 'coffee-ring', className)}
      style={{ transform: tilt ? `rotate(${tiltFor(id).toFixed(2)}deg)` : undefined, ...style }}
    >
      {clip && <PaperClip className="-top-[0.9em] left-[1.2em] h-[2.6em] w-[1.1em]" />}
      {children}
    </div>
  );
}

export function Stamp({
  label,
  className = '',
  rotate = -8,
}: {
  label: 'REJECTED' | 'MAYBE' | 'HIRED' | string;
  className?: string;
  rotate?: number;
}) {
  const cls = label === 'HIRED' ? 'stamp-hired' : label === 'MAYBE' ? 'stamp-maybe' : 'stamp-rejected';
  return (
    <span className={cx('stamp', cls, className)} style={{ transform: `rotate(${rotate}deg)` }}>
      {label}
    </span>
  );
}

/** The final stamp slamming onto the card (scale 2 -> 1) with a thump. */
export function SlamStamp({ label, className = '', onLand }: { label: string; className?: string; onLand?: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(
      () => {
        sfx.thump();
        if (label === 'HIRED') sfx.hired();
        else if (label === 'MAYBE') sfx.maybe();
        else if (label === 'REJECTED') sfx.rejected();
        onLand?.();
      },
      reduce ? 0 : 260,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div
      initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -22 }}
      animate={{ scale: 1, opacity: 1, rotate: -10 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.9 }}
      className={className}
    >
      <Stamp label={label} rotate={0} />
    </motion.div>
  );
}

export function TeamBadge({ team, name, className = '' }: { team: Team; name?: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-[0.3em] rounded-full px-[0.6em] py-[0.1em] font-semibold text-white',
        team === 'A' ? 'bg-teamA' : 'bg-teamB',
        className,
      )}
    >
      {name ?? `Team ${team}`}
    </span>
  );
}

/** Slot-machine style count-up. */
export function CountUp({
  value,
  decimals = 2,
  duration = 1200,
  className = '',
  start = true,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  start?: boolean;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce || !start ? value : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (reduce || !start) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      // a little slot-machine jitter while spinning
      const jitter = p < 0.85 ? (Math.random() - 0.5) * 0.3 * (1 - p) : 0;
      setShown(Math.max(0, value * eased + jitter));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, reduce, start]);
  return <span className={cx('tabular-nums', className)}>{shown.toFixed(decimals)}</span>;
}

export function QR({ value, size = 220, className = '' }: { value: string; size?: number; className?: string }) {
  return (
    <div className={cx('rounded-xl bg-white p-3 shadow-lg', className)}>
      <QRCodeSVG value={value} size={size} level="M" fgColor="#2A1514" style={{ width: '100%', height: 'auto' }} />
    </div>
  );
}

/** Timer bar: calm cork-brown, turning alarming red in the last 10 seconds. */
export function TimerBar({ remainingMs, totalMs, className = '' }: { remainingMs: number; totalMs: number; className?: string }) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  const pct = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const alarm = remainingMs > 0 && sec <= 10;
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return (
    <div className={cx('flex items-center gap-[0.5em]', className)}>
      <div className="relative h-[0.9em] flex-1 overflow-hidden rounded-full bg-ink/25 shadow-inner">
        <div
          className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear', alarm ? 'bg-rejected pulse-red' : 'bg-maroon')}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span
        className={cx('min-w-[3.2em] text-right font-serif font-black tabular-nums', alarm ? 'text-rejected' : 'text-ink')}
        aria-live="polite"
      >
        {mm}:{ss}
      </span>
    </div>
  );
}

/** The round's data: a choice (two options + aspect chips) or a numbers table. */
export function RoundData({ round, compact = false }: { round: RoundConfig; compact?: boolean }) {
  if (round.type === 'choice') {
    return (
      <div className="space-y-[0.4em]">
        <div className="flex items-stretch gap-[0.5em]">
          {round.options.map((o, i) => (
            <div
              key={i}
              className={cx(
                'flex-1 rounded-lg border-[0.12em] border-dashed border-maroon/40 bg-white/70 text-center font-serif font-extrabold',
                compact ? 'px-2 py-2 text-lg' : 'px-[0.5em] py-[0.3em] text-[1.3em]',
              )}
            >
              {o}
            </div>
          ))}
        </div>
        {round.aspects.length > 0 && (
          <div className="flex flex-wrap justify-center gap-[0.35em]">
            {round.aspects.map((a) => (
              <span
                key={a}
                className={cx('rounded-full bg-ink/10 font-semibold', compact ? 'px-3 py-1 text-sm' : 'px-[0.6em] py-[0.1em] text-[0.8em]')}
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full border-collapse', compact ? 'text-sm' : 'text-[0.78em]')}>
        <thead>
          <tr className="text-left">
            <th className="border-b-2 border-ink/30 p-[0.3em]">Aspect</th>
            <th className="border-b-2 border-ink/30 p-[0.3em]">{round.leftLabel}</th>
            <th className="border-b-2 border-ink/30 p-[0.3em]">{round.rightLabel}</th>
          </tr>
        </thead>
        <tbody>
          {round.table.map((row, i) => (
            <tr key={i} className="odd:bg-ink/[0.04]">
              <td className="p-[0.3em] font-semibold">{row.aspect}</td>
              <td className="p-[0.3em]">{row.left}</td>
              <td className="p-[0.3em]">{row.right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'paper' | 'danger' | 'ok';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const v = {
    primary: 'bg-maroon text-paper hover:brightness-110',
    ghost: 'bg-white/10 text-paper hover:bg-white/20 border border-white/20',
    paper: 'bg-paper text-ink hover:bg-white border border-ink/15',
    danger: 'bg-rejected text-white hover:brightness-110',
    ok: 'bg-hired text-white hover:brightness-110',
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 font-semibold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Loading({ text = 'Updating your CV...' }: { text?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink/80">
      <motion.div
        className="h-10 w-8 rounded-sm bg-paper shadow"
        animate={{ rotate: [0, -8, 8, 0], y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      />
      <p className="font-hand text-2xl">{text}</p>
    </div>
  );
}
