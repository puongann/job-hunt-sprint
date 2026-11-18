import { diffArrays } from 'diff';

export type DiffSegment = { type: 'equal' | 'added' | 'removed'; text: string };

const WORD = /\S+/g;

function words(s: string): string[] {
  return s.match(WORD) ?? [];
}

/**
 * Word-level diff between the student's original and the teacher's correction.
 * Every client computes this the same way from (originalText, correctedText).
 * Segments are words joined by single spaces.
 */
export function wordDiff(original: string, corrected: string | null | undefined): DiffSegment[] {
  const a = words(original);
  const b = words(corrected ?? original);
  const parts = diffArrays(a, b);
  const out: DiffSegment[] = [];
  for (const p of parts) {
    const type = p.added ? 'added' : p.removed ? 'removed' : 'equal';
    out.push({ type, text: p.value.join(' ') });
  }
  return out;
}

export type MarkedSpan = { text: string; added: boolean };

/**
 * Splits the corrected text exactly (whitespace preserved) into spans, marking
 * words that are new compared to the original. Used by the in-place editor overlay,
 * which must line up character-for-character with the textarea.
 */
export function markAdded(original: string, corrected: string): MarkedSpan[] {
  const a = words(original);
  const bMatches = [...corrected.matchAll(WORD)];
  const b = bMatches.map((m) => m[0]);
  const addedIdx = new Set<number>();
  let j = 0;
  for (const p of diffArrays(a, b)) {
    if (p.removed) continue;
    const n = p.value.length;
    if (p.added) for (let k = 0; k < n; k++) addedIdx.add(j + k);
    j += n;
  }
  const spans: MarkedSpan[] = [];
  let pos = 0;
  bMatches.forEach((m, i) => {
    const start = m.index ?? 0;
    if (start > pos) spans.push({ text: corrected.slice(pos, start), added: false });
    spans.push({ text: m[0], added: addedIdx.has(i) });
    pos = start + m[0].length;
  });
  if (pos < corrected.length) spans.push({ text: corrected.slice(pos), added: false });
  return spans;
}

export function hasCorrection(original: string, corrected: string | null | undefined): boolean {
  return wordDiff(original, corrected).some((s) => s.type !== 'equal');
}
