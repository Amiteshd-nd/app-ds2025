import { TILE_SIZE } from '../utils/constants';
import type { Point } from './infected';

/**
 * Ambushes from cover (act4 doc §6, ADR-50, Act 4 plan §3.4, ADR-145): every
 * 8 steps inside a zone that rolls, `rate × (crouched ? 0.5 : 1)`. A hit: a
 * 100 ms white flash, 0.5 s of slow motion, a growl, and 1–3 infected step
 * out of the nearest cover 4–6 tiles away, already turning on you. It ends
 * when you leave the zone, lose them, or after 30 s. Never in UV, never at
 * level 0. Pure; rolls come from the caller's seeded generator.
 */
export const ENCOUNTER = {
  everySteps: 8,
  flashMs: 100,
  slowMoMs: 500,
  /** Physics/tween time scale during the slow motion. */
  slowMo: 0.35,
  minTiles: 4,
  maxTiles: 6,
  count: [1, 3] as const,
  maxMs: 30000,
} as const;

export function rolls(rate: number, crouching: boolean, rng: () => number): boolean {
  return rate > 0 && rng() < rate * (crouching ? 0.5 : 1);
}

/** The cover to come out of: 4–6 tiles away, the one nearest 5; else the nearest beyond 3 tiles; else none. */
export function pickCover(covers: Point[], player: Point): Point | null {
  const d = (c: Point) => Math.hypot(c[0] - player[0], c[1] - player[1]) / TILE_SIZE;
  const inBand = covers.filter((c) => d(c) >= ENCOUNTER.minTiles && d(c) <= ENCOUNTER.maxTiles);
  if (inBand.length) return inBand.reduce((a, b) => (Math.abs(d(a) - 5) <= Math.abs(d(b) - 5) ? a : b));
  const far = covers.filter((c) => d(c) > 3);
  return far.length ? far.reduce((a, b) => (d(a) <= d(b) ? a : b)) : null;
}

/** How many step out: 1–3. */
export const ambushSize = (rng: () => number): number => ENCOUNTER.count[0] + Math.floor(rng() * (ENCOUNTER.count[1] - ENCOUNTER.count[0] + 1));
