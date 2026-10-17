/**
 * Jodi, the parody dating app (story 2.6, ADR-134) — the rules, pure. One
 * card at a time in data order; LIKE on the matching profile is a match (the
 * date follows), NOPE on every card is the way out (the beat never happens).
 * LIKE on anyone else is not a match: the card goes, nothing else.
 */
export interface JodiProfile { id: string; name: string; line: string; portrait: string; match?: boolean }

export const JODI_INDEX = 'jodi_index';

export type JodiState =
  | { kind: 'card'; profile: JodiProfile; index: number }
  | { kind: 'matched'; profile: JodiProfile }
  | { kind: 'empty' }
  | { kind: 'gone' };

export function jodiState(profiles: JodiProfile[], index: number, flags: Record<string, boolean>): JodiState {
  if (flags.jodi_gone) return { kind: 'gone' };
  const match = profiles.find((p) => p.match);
  if (flags.tanvi_matched && match) return { kind: 'matched', profile: match };
  if (index >= profiles.length) return { kind: 'empty' };
  return { kind: 'card', profile: profiles[index], index };
}

/** A swipe on card `index`: the next index and the flags it sets. */
export function swipe(profiles: JodiProfile[], index: number, like: boolean): { index: number; flags: string[] } {
  const p = profiles[index];
  if (!p) return { index, flags: [] };
  if (like && p.match) return { index: index + 1, flags: ['tanvi_matched', 'jodi_decided'] };
  const next = index + 1;
  // The last card gone without a match: that's everyone near you — the beat ends here.
  return { index: next, flags: next >= profiles.length ? ['dating_declined', 'jodi_decided', 'app_settled'] : [] };
}
