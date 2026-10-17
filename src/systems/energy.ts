/**
 * Energy (infected doc §1, ADR-32, Act 4 plan §3.2, ADR-145): running costs
 * pips. The pips are the `stamina` stat (3–8, the gym and the sports ground
 * pay off here). Running drains one pip every 2 s; not running refills one
 * every 3 s; at empty you are forced to walk for 3 s. Only in Act 4 — before
 * it, running is free. Pure state; the Player ticks it, the HUD reads it.
 */
export const ENERGY = { drainMs: 2000, refillMs: 3000, exhaustedMs: 3000, /** the pips stay on the HUD this long after the last change */ showMs: 2500 } as const;

export interface EnergyState { pips: number; max: number; drain: number; refill: number; exhausted: number; shown: number }

export const energy: EnergyState = { pips: 3, max: 3, drain: 0, refill: 0, exhausted: 0, shown: 0 };

export function resetEnergy(max: number, e: EnergyState = energy): void {
  e.max = max; e.pips = max; e.drain = 0; e.refill = 0; e.exhausted = 0; e.shown = 0;
}

/** One frame: `wantsRun` = the run input is held while moving. Returns whether the player may run this frame. */
export function tickEnergy(dtMs: number, wantsRun: boolean, max: number, e: EnergyState = energy): boolean {
  if (e.max !== max) { e.pips = Math.min(max, e.pips + Math.max(0, max - e.max)); e.max = max; }
  e.shown = Math.max(0, e.shown - dtMs);
  if (e.exhausted > 0) {
    e.exhausted = Math.max(0, e.exhausted - dtMs);
    e.shown = ENERGY.showMs;
    return false;
  }
  if (wantsRun && e.pips > 0) {
    e.refill = 0;
    e.drain += dtMs;
    e.shown = ENERGY.showMs;
    while (e.drain >= ENERGY.drainMs && e.pips > 0) { e.drain -= ENERGY.drainMs; e.pips -= 1; }
    if (e.pips === 0) { e.exhausted = ENERGY.exhaustedMs; e.drain = 0; return false; }
    return true;
  }
  e.drain = 0;
  if (e.pips < e.max) {
    e.refill += dtMs;
    e.shown = ENERGY.showMs;
    while (e.refill >= ENERGY.refillMs && e.pips < e.max) { e.refill -= ENERGY.refillMs; e.pips += 1; }
  } else e.refill = 0;
  return false;
}

/** Spend pips at once (a swing, ADR-151). Refuses — and spends nothing — when you have fewer; at empty you are tired. */
export function spendPips(n: number, e: EnergyState = energy): boolean {
  if (e.exhausted > 0 || e.pips < n) { e.shown = ENERGY.showMs; return false; }
  e.pips -= n; e.refill = 0; e.shown = ENERGY.showMs;
  if (e.pips === 0) e.exhausted = ENERGY.exhaustedMs;
  return true;
}
