import { useRef, useState } from 'react';
import { Btn, cx } from '../components/ui';
import { newRoundId } from '../lib/ids';
import { DEFAULT_ROUNDS, cloneRounds, exportRoundsFile, parseRounds, saveTemplates } from '../lib/rounds';
import type { RoundConfig } from '../lib/types';

const input = 'w-full rounded-md border border-ink/20 bg-white px-2 py-1.5 text-ink outline-none focus:border-maroon';

/**
 * Round editor. Templates live in this browser's localStorage, with JSON export/import.
 * When opened inside a room, "Save to this room" updates the room's copy of the rounds.
 */
export function RoundEditor({
  initial,
  onClose,
  onSaveToRoom,
  lockedRoundId,
}: {
  initial: RoundConfig[];
  onClose: () => void;
  onSaveToRoom?: (rounds: RoundConfig[]) => Promise<void>;
  lockedRoundId?: string | null;
}) {
  const [rounds, setRounds] = useState<RoundConfig[]>(() => cloneRounds(initial));
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const r = rounds[sel];

  const patch = (p: Partial<RoundConfig>) => setRounds((rs) => rs.map((x, i) => (i === sel ? { ...x, ...p } : x)));
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 text-[15px]" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/10 bg-maroon px-4 py-2 text-paper">
          <h2 className="font-serif text-xl font-black">Round editor</h2>
          <button onClick={onClose} className="rounded px-3 py-1 text-xl hover:bg-white/10" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
          <aside className="flex flex-col gap-1 overflow-y-auto border-r border-ink/10 p-2">
            {rounds.map((x, i) => (
              <div key={x.id} className={cx('flex items-center gap-1 rounded-md', i === sel && 'bg-maroon/10')}>
                <button className="flex-1 truncate px-2 py-2 text-left font-semibold" onClick={() => setSel(i)}>
                  {i + 1}. {x.title || 'Untitled'}
                </button>
                <button
                  className="px-1 text-ink/50 hover:text-ink disabled:opacity-20"
                  disabled={i === 0}
                  title="Move up"
                  onClick={() => {
                    setRounds((rs) => {
                      const c = [...rs];
                      [c[i - 1], c[i]] = [c[i], c[i - 1]];
                      return c;
                    });
                    setSel(i - 1);
                  }}
                >
                  ▲
                </button>
              </div>
            ))}
            <Btn
              variant="paper"
              className="mt-2"
              onClick={() => {
                setRounds((rs) => [
                  ...rs,
                  { ...cloneRounds([DEFAULT_ROUNDS[0]])[0], id: newRoundId(), title: 'New round', challenges: [] },
                ]);
                setSel(rounds.length);
              }}
            >
              + Add round
            </Btn>
          </aside>
          {r ? (
            <div className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto p-4">
              {lockedRoundId === r.id && (
                <p className="col-span-2 rounded bg-maybe/30 p-2 text-sm">This round is running now. Changes apply immediately.</p>
              )}
              <label className="col-span-2">
                Title
                <input className={input} value={r.title} onChange={(e) => patch({ title: e.target.value })} />
              </label>
              <label className="col-span-2">
                Brief
                <textarea className={input} rows={3} value={r.brief} onChange={(e) => patch({ brief: e.target.value })} />
              </label>
              <label>
                Type
                <select className={input} value={r.type} onChange={(e) => patch({ type: e.target.value as RoundConfig['type'] })}>
                  <option value="choice">choice (two options + aspect chips)</option>
                  <option value="table">table (aspect / left / right)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  Timer (seconds)
                  <input type="number" min={15} className={input} value={r.timerSeconds} onChange={(e) => patch({ timerSeconds: Number(e.target.value) })} />
                </label>
                <label>
                  Max sentences / student
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className={input}
                    value={r.maxPerStudent}
                    onChange={(e) => patch({ maxPerStudent: Math.max(1, Math.min(5, Number(e.target.value))) })}
                  />
                </label>
              </div>
              <label>
                Left label {r.type === 'choice' && '(option 1)'}
                <input
                  className={input}
                  value={r.type === 'choice' ? r.options[0] : r.leftLabel}
                  onChange={(e) =>
                    r.type === 'choice'
                      ? patch({ options: [e.target.value, r.options[1]], leftLabel: e.target.value })
                      : patch({ leftLabel: e.target.value })
                  }
                />
              </label>
              <label>
                Right label {r.type === 'choice' && '(option 2)'}
                <input
                  className={input}
                  value={r.type === 'choice' ? r.options[1] : r.rightLabel}
                  onChange={(e) =>
                    r.type === 'choice'
                      ? patch({ options: [r.options[0], e.target.value], rightLabel: e.target.value })
                      : patch({ rightLabel: e.target.value })
                  }
                />
              </label>
              {r.type === 'choice' ? (
                <label className="col-span-2">
                  Aspect chips (comma separated)
                  <input
                    className={input}
                    value={r.aspects.join(', ')}
                    onChange={(e) => patch({ aspects: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                </label>
              ) : (
                <div className="col-span-2">
                  <p>Table rows (numbers only, no vocabulary)</p>
                  {r.table.map((row, i) => (
                    <div key={i} className="mt-1 grid grid-cols-[1fr_1.4fr_1.4fr_auto] gap-1">
                      {(['aspect', 'left', 'right'] as const).map((k) => (
                        <input
                          key={k}
                          className={input}
                          placeholder={k}
                          value={row[k]}
                          onChange={(e) => patch({ table: r.table.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                        />
                      ))}
                      <button className="px-2 text-rejected" onClick={() => patch({ table: r.table.filter((_, j) => j !== i) })}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button className="mt-1 text-sm font-semibold text-maroon" onClick={() => patch({ table: [...r.table, { aspect: '', left: '', right: '' }] })}>
                    + Add row
                  </button>
                </div>
              )}
              <label className="col-span-2">
                Sentence frames (one per line)
                <textarea
                  className={cx(input, 'font-mono text-sm')}
                  rows={4}
                  value={r.frames.join('\n')}
                  onChange={(e) => patch({ frames: e.target.value.split('\n') })}
                  onBlur={() => patch({ frames: r.frames.map((f) => f.trim()).filter(Boolean) })}
                />
              </label>
              <div className="col-span-2">
                <p>Challenge structures ("Level up!" chips) - name + one example each</p>
                {r.challenges.map((c, i) => (
                  <div key={i} className="mt-1 grid grid-cols-[1fr_1.6fr_auto] gap-1">
                    <input
                      className={input}
                      placeholder="name, e.g. as ... as"
                      value={c.name}
                      onChange={(e) => patch({ challenges: r.challenges.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    />
                    <input
                      className={input}
                      placeholder="example (use another topic)"
                      value={c.example}
                      onChange={(e) => patch({ challenges: r.challenges.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)) })}
                    />
                    <button className="px-2 text-rejected" onClick={() => patch({ challenges: r.challenges.filter((_, j) => j !== i) })}>
                      ✕
                    </button>
                  </div>
                ))}
                <button className="mt-1 text-sm font-semibold text-maroon" onClick={() => patch({ challenges: [...r.challenges, { name: '', example: '' }] })}>
                  + Add challenge
                </button>
              </div>
              <label className="col-span-2">
                Closing line
                <input className={input} value={r.closingLine} onChange={(e) => patch({ closingLine: e.target.value })} />
              </label>
              <div className="col-span-2">
                <Btn
                  variant="danger"
                  disabled={rounds.length <= 1 || lockedRoundId === r.id}
                  onClick={() => {
                    setRounds((rs) => rs.filter((_, i) => i !== sel));
                    setSel(0);
                  }}
                >
                  Delete this round
                </Btn>
              </div>
            </div>
          ) : (
            <div />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 p-3">
          {onSaveToRoom && (
            <Btn
              onClick={async () => {
                try {
                  const clean = parseRounds(rounds);
                  await onSaveToRoom(clean);
                  flash('Saved to this room.');
                } catch (e) {
                  flash(`Could not save: ${(e as Error).message}`);
                }
              }}
            >
              Save to this room
            </Btn>
          )}
          <Btn
            variant={onSaveToRoom ? 'paper' : 'primary'}
            onClick={() => {
              saveTemplates(parseRounds(rounds));
              flash('Saved as templates on this browser.');
            }}
          >
            Save as my templates
          </Btn>
          <Btn variant="paper" onClick={() => exportRoundsFile(parseRounds(rounds))}>
            Export JSON
          </Btn>
          <Btn variant="paper" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const parsed = parseRounds(JSON.parse(await f.text()));
                if (!parsed.length) throw new Error('no rounds');
                setRounds(parsed);
                setSel(0);
                flash(`Imported ${parsed.length} rounds. Remember to save.`);
              } catch (err) {
                flash(`That file is not a rounds file (${(err as Error).message}).`);
              }
            }}
          />
          <Btn
            variant="paper"
            onClick={() => {
              setRounds(cloneRounds(DEFAULT_ROUNDS));
              setSel(0);
            }}
          >
            Reset to the 2 default rounds
          </Btn>
          {msg && <span className="ml-2 font-semibold text-hired">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
