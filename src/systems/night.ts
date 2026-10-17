/**
 * Night (story 2.5, ADR-133): one definition every system reads. Buses stop
 * at 23:00 and start at 05:30; autos charge double after midnight; the world
 * wears the night look between 23:00 and 05:30 (with half-hour ramps).
 */
export const NIGHT_START = 23 * 60;
export const NIGHT_END = 5 * 60 + 30;
export const NIGHT_AUTO_MULTIPLIER = 2;

export const isNight = (minute: number): boolean => minute >= NIGHT_START || minute < NIGHT_END;
/** Midnight to 05:30 — the auto meter's "night charge". */
export const afterMidnight = (minute: number): boolean => minute < NIGHT_END;

/** Does an exit run at this minute? Buses do not at night; `onlyAt` pins an exit to day or night. */
export function exitRuns(exit: { transit: string; onlyAt?: 'day' | 'night' }, minute: number): boolean {
  if (exit.onlyAt === 'night' && !isNight(minute)) return false;
  if (exit.onlyAt === 'day' && isNight(minute)) return false;
  if (exit.transit === 'bus' && isNight(minute)) return false;
  return true;
}

/** An exit's fare at this minute: autos double after midnight. */
export const fareAt = (exit: { transit: string; fare?: number }, minute: number): number =>
  (exit.fare ?? 0) * (exit.transit === 'auto' && afterMidnight(minute) ? NIGHT_AUTO_MULTIPLIER : 1);

/**
 * How dark the night look is at this minute, 0–1: full from 23:30 to 05:00,
 * ramping over the half hour either side. `deep` (a power cut) goes darker.
 */
export function nightDepth(minute: number): number {
  const ramp = (m: number, a: number, b: number) => Math.max(0, Math.min(1, (m - a) / (b - a)));
  if (minute >= NIGHT_START) return ramp(minute, NIGHT_START, NIGHT_START + 30);
  if (minute < NIGHT_END) return 1 - ramp(minute, NIGHT_END - 30, NIGHT_END);
  return 0;
}
