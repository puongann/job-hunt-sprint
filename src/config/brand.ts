/** Change the game's name and tagline here. */
export const GAME_NAME = 'Job Hunt Sprint';
export const GAME_TAGLINE = 'Write it. Vote it. Survive the red pen.';
/** Used only if a round has no option names. Normally Team A / Team B take the first round's two options. */
export const DEFAULT_TEAM_NAMES = { A: 'Team A', B: 'Team B' } as const;

/** Team A = the first round's first option (e.g. "Teacher"), Team B = its second option (e.g. "YouTuber"). */
export function teamNamesFromRounds(rounds: { type: string; options: string[]; leftLabel: string; rightLabel: string }[]): { A: string; B: string } {
  const r = rounds[0];
  const a = (r ? (r.type === 'choice' ? r.options[0] : r.leftLabel) : '')?.trim();
  const b = (r ? (r.type === 'choice' ? r.options[1] : r.rightLabel) : '')?.trim();
  return { A: a || DEFAULT_TEAM_NAMES.A, B: b || DEFAULT_TEAM_NAMES.B };
}
