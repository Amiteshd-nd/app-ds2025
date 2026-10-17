/**
 * Card sequences (story 3.1, ADR-136) — pure, no engine. A sequence is a list
 * of text panels shown over black or over an illustrated still: a day that
 * happens off-screen (the HIVR site), a ride that is told rather than played
 * (the Outer Ring Road), a title card (ACT 3 — FEVER). CardScene draws and
 * times them; this module decides which panels show for the player's flags
 * and what the sequence changes when it ends. Skipping a panel never skips
 * an outcome: every flag is applied from the panels chosen at the start.
 */

export type CardStyle = 'text' | 'title' | 'cut' | 'fragment';

export interface CardPanel {
  /** The body, word-wrapped. */
  text: string;
  /** A small line above the body ("ORR · 23:52"), or the big line of a title card. */
  title?: string;
  /** A still (src/assets/backdrops) drawn behind the text; black when absent. */
  still?: string;
  /** How long the panel holds before the next one (ms); E / tap moves on sooner. */
  ms?: number;
  /**
   * `text`: a plate at the bottom over the still. `title`: big, centred, on black.
   * `cut`: the panel ends in one white frame and black (no flash under reduced motion — the card just cuts).
   * `fragment`: grey, centred, slow — something half-heard in the dark.
   */
  style?: CardStyle;
  /** Shown only when this flag is set / is not set (when the sequence starts). */
  ifFlag?: string;
  unlessFlag?: string;
  /** An audio token played as the panel appears (ADR-139): the APPA ringtone, a siren. */
  cue?: string;
  /** Flags this panel sets / clears — applied when the sequence settles, whether or not the panel was read. */
  setFlags?: string[];
  clearFlags?: string[];
}

export interface CardSequence {
  id: string;
  panels: CardPanel[];
  setFlags?: string[];
  clearFlags?: string[];
  /** The clock's minute when the sequence settles (same day): the HIVR day ends at 23:52. */
  clockAt?: number;
  /**
   * `world` (default): the sequence ends and the world fades back in.
   * `hold`: the last panel stays — the story continues in a scene not built yet (3.1 → 3.2 Ward 4).
   */
  end?: 'world' | 'hold';
  /** Land somewhere when it ends — the crash card ends in Ward 4 the next morning (story 3.2, ADR-137). Wins over `end`. */
  then?: CardLanding;
}

export interface CardLanding {
  district: string;
  spawn: string;
  /** The clock on landing: this minute, of the next day when `nextDay`. */
  minute?: number;
  nextDay?: boolean;
}

export const DEFAULT_PANEL_MS = 4200;
/** Black after a `cut` panel before the next one (ms). */
export const CUT_BLACK_MS = 1400;

type Flags = Record<string, boolean | undefined>;

/** The panels this player sees, in order. */
export function panelsFor(seq: CardSequence, flags: Flags): CardPanel[] {
  return seq.panels.filter((p) => (!p.ifFlag || flags[p.ifFlag]) && !(p.unlessFlag && flags[p.unlessFlag]));
}

export interface CardOutcome {
  set: string[];
  clear: string[];
  clockAt?: number;
}

/** What the sequence changes, from the flags at its start. A flag both set and cleared ends cleared. */
export function outcome(seq: CardSequence, flags: Flags): CardOutcome {
  const panels = panelsFor(seq, flags);
  const clear = [...new Set([...(seq.clearFlags ?? []), ...panels.flatMap((p) => p.clearFlags ?? [])])];
  const set = [...new Set([...panels.flatMap((p) => p.setFlags ?? []), ...(seq.setFlags ?? [])])].filter((f) => !clear.includes(f));
  return { set, clear, ...(seq.clockAt !== undefined ? { clockAt: seq.clockAt } : {}) };
}

/** Total time the sequence plays untouched (ms) — the bot's patience. */
export function duration(seq: CardSequence, flags: Flags): number {
  return panelsFor(seq, flags).reduce((t, p) => t + (p.ms ?? DEFAULT_PANEL_MS) + (p.style === 'cut' ? CUT_BLACK_MS : 0), 0);
}
