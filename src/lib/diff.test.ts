import { describe, expect, it } from 'vitest';
import { hasCorrection, markAdded, wordDiff } from './diff';

describe('wordDiff', () => {
  it('diffs the demo sentence at word level', () => {
    const d = wordDiff('A pilot is more rich that a nurse.', 'A pilot is richer than a nurse.');
    expect(d).toEqual([
      { type: 'equal', text: 'A pilot is' },
      { type: 'removed', text: 'more rich that' },
      { type: 'added', text: 'richer than' },
      { type: 'equal', text: 'a nurse.' },
    ]);
  });

  it('returns a single equal segment when nothing changed or correction is null', () => {
    expect(wordDiff('I choose teacher.', null)).toEqual([{ type: 'equal', text: 'I choose teacher.' }]);
    expect(hasCorrection('I choose teacher.', 'I  choose teacher.')).toBe(false);
  });

  it('handles additions at the end', () => {
    const d = wordDiff('It is fun', 'It is more fun');
    expect(d.filter((x) => x.type === 'added').map((x) => x.text)).toEqual(['more']);
    expect(d.filter((x) => x.type === 'removed')).toEqual([]);
  });
});

describe('markAdded', () => {
  it('covers the corrected string exactly and marks new words', () => {
    const corrected = 'A pilot is  richer than a nurse.';
    const spans = markAdded('A pilot is more rich that a nurse.', corrected);
    expect(spans.map((s) => s.text).join('')).toBe(corrected);
    expect(spans.filter((s) => s.added).map((s) => s.text)).toEqual(['richer', 'than']);
  });

  it('keeps leading and trailing whitespace', () => {
    const corrected = ' hello world ';
    expect(markAdded('hello', corrected).map((s) => s.text).join('')).toBe(corrected);
  });
});
