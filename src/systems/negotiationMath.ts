import { NEGOTIATION_STEP, TEMPERAMENTS } from '../utils/constants.ts';
import type { NegotiationCounter, NegotiationDef, NegotiationTerm } from '../utils/types.ts';

/**
 * The haggle's arithmetic, pure — no store, no engine. `Negotiation` prices
 * every move with these, and the walkthrough generator plans the bot's
 * cheapest haggle with the same numbers (T-054 step 4), so the movie pays
 * what a careful player would.
 */

/**
 * The term's price after a counter: the NPC gives up a share of the gap to
 * the offer (never below the floor), in ₹100 steps. `null` = offended (a
 * zero-give tactic); a price ≥ `current` = the NPC holds.
 */
export function counterPrice(def: NegotiationDef, term: NegotiationTerm, current: number, c: NegotiationCounter, give = 0): number | null {
  const share = TEMPERAMENTS[def.temperament].give[c.tactic];
  if (share === 0) return null;
  const target = Math.max(c.offer, term.floor);
  const raw = current - (share + give) * (current - target);
  return Math.max(target, Math.round(raw / NEGOTIATION_STEP) * NEGOTIATION_STEP);
}

/** Patience a counter costs with this temperament. */
export const counterCost = (def: NegotiationDef, c: NegotiationCounter): number => TEMPERAMENTS[def.temperament].cost[c.tactic];

/** The price a walk-away call-back offers (firm: halfway to the floor; slick: the floor); null when the NPC lets you go. */
export function callbackPrice(def: NegotiationDef, term: NegotiationTerm, current: number): number | null {
  const mode = TEMPERAMENTS[def.temperament].walk;
  if (mode === 'stay' || !def.lines.callback) return null;
  return mode === 'drop'
    ? term.floor
    : Math.max(term.floor, Math.round((current - (current - term.floor) / 2) / NEGOTIATION_STEP) * NEGOTIATION_STEP);
}

export interface HagglePlan {
  /** Counters to make, in order. */
  counters: NegotiationCounter[];
  /** Walk away once (after the counters) to take the call-back price, then agree. */
  walkFirst: boolean;
  total: number;
}

/**
 * The cheapest haggle the rules allow from here: every order of the counters
 * still on offer (unused, flag met) until patience runs out, optionally
 * followed by a walk for the call-back, then agree. Ties go to the shorter
 * haggle. `null` when no plan ends affordable.
 */
export function planHaggle(def: NegotiationDef, opts: { flags?: Record<string, boolean>; prices?: Record<string, number>; give?: number; wallet?: number } = {}): HagglePlan | null {
  const flags = opts.flags ?? {};
  const give = opts.give ?? 0;
  const wallet = opts.wallet ?? Infinity;
  const start = Object.fromEntries(def.terms.map((t) => [t.id, opts.prices?.[t.id] ?? t.ask]));
  const offered = def.counters.filter((c) => !flags[`neg.${def.id}.used.${c.id}`] && (!c.requiresFlag || flags[c.requiresFlag]));
  const sum = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
  let best: HagglePlan | null = null;
  const consider = (plan: HagglePlan) => {
    if (plan.total > wallet) return;
    const len = plan.counters.length + (plan.walkFirst ? 1 : 0);
    const bestLen = best ? best.counters.length + (best.walkFirst ? 1 : 0) : Infinity;
    if (!best || plan.total < best.total || (plan.total === best.total && len < bestLen)) best = plan;
  };
  const visit = (prices: Record<string, number>, patience: number, made: NegotiationCounter[]) => {
    consider({ counters: made, walkFirst: false, total: sum(prices) });
    const back = Object.fromEntries(def.terms.map((t) => [t.id, callbackPrice(def, t, prices[t.id]) ?? prices[t.id]]));
    if (def.terms.some((t) => callbackPrice(def, t, prices[t.id]) !== null)) consider({ counters: made, walkFirst: true, total: sum(back) });
    if (patience <= 0) return;
    for (const c of offered) {
      if (made.includes(c)) continue;
      const term = def.terms.find((t) => t.id === c.term);
      if (!term) continue;
      const next = counterPrice(def, term, prices[term.id], c, give);
      // Offended or held: patience spent for nothing — never part of a cheapest plan.
      if (next === null || next >= prices[term.id]) continue;
      visit({ ...prices, [term.id]: next }, patience - counterCost(def, c), [...made, c]);
    }
  };
  visit(start, def.patience, []);
  return best;
}
