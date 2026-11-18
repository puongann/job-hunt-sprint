import { useEffect, useRef, useState } from 'react';
import { markAdded, wordDiff } from '../lib/diff';
import { cx } from './ui';

/** The corrected sentence: added words red + bold, deleted words grey + struck through. */
export function DiffText({
  original,
  corrected,
  showDeletions = true,
  className = '',
}: {
  original: string;
  corrected: string | null | undefined;
  showDeletions?: boolean;
  className?: string;
}) {
  const segs = wordDiff(original, corrected);
  const out: React.ReactNode[] = [];
  segs.forEach((s, i) => {
    if (s.type === 'removed' && !showDeletions) return;
    if (out.length) out.push(' ');
    if (s.type === 'equal') out.push(<span key={i}>{s.text}</span>);
    else if (s.type === 'added')
      out.push(
        <span key={i} className="diff-add">
          {s.text}
        </span>,
      );
    else
      out.push(
        <span key={i} className="diff-del" aria-label={`deleted: ${s.text}`}>
          {s.text}
        </span>,
      );
  });
  return <span className={cx('break-words', className)}>{out}</span>;
}

/**
 * In-place correction editor for the main screen. A transparent textarea sits exactly on
 * top of a rendered copy of the text, so new words show up in red "bold" while typing.
 * (The overlay fakes bold with a text stroke so glyph widths never shift under the caret.)
 */
export function CorrectionEditor({
  original,
  corrected,
  showDeletions,
  onChange,
  disabled,
  className = '',
}: {
  original: string;
  corrected: string | null;
  showDeletions: boolean;
  onChange: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(corrected ?? original);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<string | null>(null);

  // Follow server value while not editing (e.g. "Reset correction", or another sentence).
  useEffect(() => {
    if (!editing) setText(corrected ?? original);
  }, [corrected, original, editing]);

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) {
      onChange(pending.current);
      pending.current = null;
    }
  }

  function change(v: string) {
    const clean = v.replace(/\n/g, ' ').slice(0, 260);
    setText(clean);
    pending.current = clean;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400); // phones update live, debounced ~400 ms
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setEditing(true);
          setTimeout(() => {
            const ta = taRef.current;
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }, 0);
        }}
        className={cx(
          'block w-full cursor-text rounded-md text-left outline-none',
          !disabled && 'hover:bg-maroon/[0.04] focus-visible:ring-4 focus-visible:ring-maroon/30',
          className,
        )}
        title={disabled ? undefined : 'Click to correct'}
      >
        <DiffText original={original} corrected={corrected} showDeletions={showDeletions} />
      </button>
    );
  }

  const spans = markAdded(original, text);
  return (
    <div className={cx('correction-editor relative rounded-md ring-4 ring-maroon/25', className)}>
      <div aria-hidden className="pointer-events-none whitespace-pre-wrap break-words">
        {spans.map((s, i) =>
          s.added ? (
            <span key={i} className="fake-bold text-rejected">
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
        {'​'}
      </div>
      <textarea
        ref={taRef}
        value={text}
        spellCheck={false}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          flush();
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          e.stopPropagation();
        }}
        className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 text-transparent outline-none"
        style={{ font: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' }}
        aria-label="Correct the sentence"
      />
    </div>
  );
}
