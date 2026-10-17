/**
 * The rhythm lane's rules (story 2.3, ADR-131) — pure, no engine, so tests and
 * the Movie Mode bot read the same numbers the scene plays by. A lesson is a
 * chord progression at a tempo; every strum is a note on a beat; a press near
 * a note's time hits it; enough hits pass the lesson. RhythmScene draws and
 * listens; this module decides.
 */

export interface RhythmLesson {
  id: string;
  /** Shown on the card: "Lesson 1 · G". */
  title: string;
  /** Chord per bar, repeated to fill `bars` — ["G"] or ["G", "C"]. */
  chords: string[];
  bpm: number;
  bars: number;
  /** Beats (1-based, 4/4) that carry a strum in every bar. */
  strums: number[];
  /** Share of notes to hit to pass (0–1). */
  pass: number;
  /** A flag that makes the lesson easier (the busker showed you the shape): its own pass share. */
  easierIf?: { flag: string; pass: number };
  /** Flags set when the lesson is passed. */
  setFlags: string[];
}

export interface RhythmSet {
  id: string;
  /** Stress change per finished session (negative = relief). */
  stress: number;
  /** The free strum after every lesson is passed: a short song, no pass mark. */
  free: RhythmLesson & { stress: number };
  lessons: RhythmLesson[];
  /** Flag that marks "played tonight" — cleared by the next sleep. One session per night. */
  nightFlag: string;
  /** Dialogue opened after the last lesson is passed (the clip for Ananya). */
  afterLast?: { dialogue: string; unlessFlag?: string };
}

export interface RhythmNote {
  /** ms from the start of the song (after the count-in). */
  at: number;
  chord: string;
  hit: boolean;
  missed: boolean;
}

/** A press this close to a note hits it… */
export const HIT_WINDOW_MS = 140;
/** …this close is "clean". */
export const CLEAN_WINDOW_MS = 60;
/** One bar of count-in before the first note. */
export const COUNT_IN_BARS = 1;

export const beatMs = (bpm: number): number => 60000 / bpm;

/** Every strum of a lesson, in time order, from the end of the count-in. */
export function notesFor(lesson: RhythmLesson): RhythmNote[] {
  const beat = beatMs(lesson.bpm);
  const notes: RhythmNote[] = [];
  for (let bar = 0; bar < lesson.bars; bar++) {
    const chord = lesson.chords[bar % lesson.chords.length];
    for (const s of lesson.strums) notes.push({ at: Math.round((bar * 4 + (s - 1)) * beat), chord, hit: false, missed: false });
  }
  return notes;
}

/** Length of the song from the end of the count-in to the last beat of the last bar. */
export const songMs = (lesson: RhythmLesson): number => Math.round(lesson.bars * 4 * beatMs(lesson.bpm));

/**
 * A press at song time `t`: hits the nearest open note inside the window.
 * Returns 'clean' | 'hit' | 'early' (nothing in reach — a buzz, no penalty).
 */
export function press(notes: RhythmNote[], t: number): 'clean' | 'hit' | 'early' {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.hit || n.missed) continue;
    const d = Math.abs(n.at - t);
    if (d < bestD) { best = i; bestD = d; }
    if (n.at - t > HIT_WINDOW_MS) break;
  }
  if (best < 0 || bestD > HIT_WINDOW_MS) return 'early';
  notes[best].hit = true;
  return bestD <= CLEAN_WINDOW_MS ? 'clean' : 'hit';
}

/** Mark notes whose window has passed as missed; returns how many were newly missed. */
export function sweep(notes: RhythmNote[], t: number): number {
  let n = 0;
  for (const note of notes) if (!note.hit && !note.missed && t - note.at > HIT_WINDOW_MS) { note.missed = true; n++; }
  return n;
}

export const hits = (notes: RhythmNote[]): number => notes.filter((n) => n.hit).length;

/** The pass share for this lesson given the player's flags. */
export const passShare = (lesson: RhythmLesson, flags: Record<string, boolean>): number =>
  lesson.easierIf && flags[lesson.easierIf.flag] ? lesson.easierIf.pass : lesson.pass;

export const passed = (lesson: RhythmLesson, notes: RhythmNote[], flags: Record<string, boolean>): boolean =>
  notes.length > 0 && hits(notes) / notes.length >= passShare(lesson, flags) - 1e-9;

export type RhythmPick =
  | { kind: 'lesson'; lesson: RhythmLesson; index: number }
  | { kind: 'free'; lesson: RhythmSet['free'] }
  | { kind: 'tired' };

/** What the guitar offers tonight: the first lesson not yet passed, the free strum, or nothing (already played tonight). */
export function pick(set: RhythmSet, flags: Record<string, boolean>): RhythmPick {
  if (flags[set.nightFlag]) return { kind: 'tired' };
  const index = set.lessons.findIndex((l) => !l.setFlags.every((f) => flags[f]));
  if (index >= 0) return { kind: 'lesson', lesson: set.lessons[index], index };
  return { kind: 'free', lesson: set.free };
}

export interface RhythmOutcome {
  /** Flags to set (the lesson's flags on a pass, the night flag on any finished session). */
  flags: string[];
  /** Stress change to apply. */
  stress: number;
  /** A conversation to open afterwards (the clip, after the last lesson). */
  dialogue?: string;
  /** One line for a toast. */
  toast: string;
}

/**
 * What a finished session changes. A pass sets the lesson's flags; any
 * finished session (pass or not) uses up the night and eases stress — "a
 * fail costs nothing but the night". Quitting changes nothing.
 */
export function outcome(set: RhythmSet, picked: Exclude<RhythmPick, { kind: 'tired' }>, ok: boolean | 'quit', flags: Record<string, boolean>): RhythmOutcome {
  if (ok === 'quit') return { flags: [], stress: 0, toast: '' };
  if (picked.kind === 'free') return { flags: [set.nightFlag], stress: picked.lesson.stress, toast: 'You play till the neighbour\'s TV goes up.' };
  const last = picked.index === set.lessons.length - 1;
  if (!ok) return { flags: [set.nightFlag], stress: set.stress, toast: `${picked.lesson.title}: not yet. Tomorrow.` };
  const after = last && set.afterLast && !(set.afterLast.unlessFlag && flags[set.afterLast.unlessFlag]) ? set.afterLast.dialogue : undefined;
  return { flags: [...picked.lesson.setFlags, set.nightFlag], stress: set.stress, dialogue: after, toast: `${picked.lesson.title} — learned.` };
}
