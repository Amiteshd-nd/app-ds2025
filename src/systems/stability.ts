import type { DistrictDef } from '../utils/types';

/**
 * Stability and grade() — the one dial (design system §9, ADR-20/27, act4 doc
 * §2, Act 4 systems plan §3.1, ADR-144). Every place has a number 0–100; one
 * function turns it into a level 0–4, and the look, the sound, the crowd and
 * (later) the infected all read that level. No per-scene grading.
 *
 * Act 4 keeps its own day count (`act4_day`, from the hospital gate) and each
 * pocket falls on its `act4.fallDay` in the locked order (Hebbal first,
 * Whitefield last). A story flag (`stabilityIf`) always wins over the curve.
 * Pure: no engine, no store — tests drive it directly.
 */

/** Set when Act 4 begins (the hospital gate); until then every curve reads 100. */
export const ACT4_FLAG = 'act4';
/** Store counter: Act 4 days slept through, 0 on the first. */
export const ACT4_DAY = 'act4_day';

/** The curve's numbers (plan §3.1). */
export const CURVE = {
  /** Where a place starts on Act 4's first day, and how much it loses each day before it falls. */
  start: 85,
  drift: 2,
  /** A place that has not fallen yet never drops below this (it stays "warning"). */
  standing: 60,
  /** The day it falls, and what it loses each day after… */
  onFall: 55,
  perDay: 8,
  /** …down to its floor (Ground Zero places sink below 20). */
  floor: 25,
} as const;

/** Lower bounds of levels 0–3; below the last is level 4 (act4 doc §2). */
export const GRADE_MIN = [80, 60, 40, 20] as const;

export type GradeLevel = 0 | 1 | 2 | 3 | 4;
export type AudioBand = 'normal' | 'warning' | 'infected' | 'deep';

/** What a level means for everything that reads it (plan §3.1 table). */
export interface GradeLook {
  name: 'safe' | 'warning' | 'infected' | 'hot' | 'ground zero';
  /** 0–1: how much colour drains (desat20 / desat50 / …). */
  desat: number;
  /** 0–1: the green creeping in from the edges. */
  fog: number;
  /** 0–1: the red rim. */
  vignette: number;
  /** A light glitch every few seconds (never under reduced motion). */
  glitch: boolean;
  /** Share of a place's ambient crowd still out. */
  people: number;
  /** The encounter roll per 8 steps (S2). */
  encounterRate: number;
  /** Infected packs a place holds (S2). */
  packs: number;
  /** Which audio band the bed plays (audio plan §2.4). */
  band: AudioBand;
}

export const GRADES: readonly GradeLook[] = [
  { name: 'safe', desat: 0, fog: 0, vignette: 0, glitch: false, people: 1, encounterRate: 0, packs: 0, band: 'normal' },
  { name: 'warning', desat: 0.2, fog: 0, vignette: 0, glitch: false, people: 0.5, encounterRate: 0.05, packs: 0, band: 'warning' },
  { name: 'infected', desat: 0.5, fog: 0.35, vignette: 0, glitch: false, people: 0, encounterRate: 0.25, packs: 1, band: 'infected' },
  { name: 'hot', desat: 0.6, fog: 0.45, vignette: 0.6, glitch: true, people: 0, encounterRate: 0.6, packs: 2, band: 'deep' },
  { name: 'ground zero', desat: 0.75, fog: 0.55, vignette: 0.8, glitch: true, people: 0, encounterRate: 0.9, packs: 3, band: 'deep' },
];

/** The level for a stability: ≥80 safe · 60–79 warning · 40–59 infected · 20–39 hot · <20 ground zero. */
export function grade(stability: number): GradeLevel {
  const i = GRADE_MIN.findIndex((min) => stability >= min);
  return (i === -1 ? 4 : i) as GradeLevel;
}

export const gradeLook = (stability: number): GradeLook => GRADES[grade(stability)];

/** A pocket's Act 4 block: the day it falls and how low it sinks. */
export interface Act4Def { fallDay: number; floor?: number }

/** Stability on an Act 4 day from a pocket's fall day (plan §3.1). */
export function act4Curve(def: Act4Def, day: number): number {
  if (day < def.fallDay) return Math.max(CURVE.standing, CURVE.start - CURVE.drift * day);
  return Math.max(def.floor ?? CURVE.floor, CURVE.onFall - CURVE.perDay * (day - def.fallDay));
}

/** An interior falls with the pocket it opens off (`realworld.parent`). */
export function act4DefOf(district: DistrictDef, resolve: (id: string) => DistrictDef | undefined): Act4Def | undefined {
  if (district.act4) return district.act4;
  const rw = district.realworld;
  if (rw && 'parent' in rw) {
    const parent = resolve(rw.parent);
    return parent ? act4DefOf(parent, resolve) : undefined;
  }
  return undefined;
}

/** The Act 4 day, or null before Act 4. */
export function act4DayOf(state: { flags: Record<string, boolean>; counters: Record<string, number> }): number | null {
  return state.flags[ACT4_FLAG] ? state.counters[ACT4_DAY] ?? 0 : null;
}

/**
 * A place's stability: 100 before Act 4 (or with no `act4` block), the fall
 * curve during it, and a set `stabilityIf` flag over either (the last set one wins).
 */
export function stabilityFor(
  district: DistrictDef,
  flags: Record<string, boolean>,
  act4Day: number | null,
  resolve: (id: string) => DistrictDef | undefined,
): number {
  const story = (district.stabilityIf ?? []).filter((x) => flags[x.flag]).pop();
  if (story) return story.stability;
  const def = act4Day === null ? undefined : act4DefOf(district, resolve);
  return def ? act4Curve(def, act4Day!) : 100;
}

/** Infected look by days since the place fell (infected doc §4): 0–2 Fresh · 3–6 Degraded · 7+ Evolved. */
export function stageFor(daysSinceFall: number): 'fresh' | 'degraded' | 'evolved' {
  return daysSinceFall >= 7 ? 'evolved' : daysSinceFall >= 3 ? 'degraded' : 'fresh';
}

/** The Playground's dial: a stability that overrides every place's (null = off). */
let override: number | null = null;
export const setStabilityOverride = (value: number | null): void => { override = value; };
export const stabilityOverride = (): number | null => override;
