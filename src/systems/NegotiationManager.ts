import { gameEvents } from '../core/events';
import { NEGOTIATIONS, NPCS } from '../data';
import { useGameStore } from '../store';
import { NEGOTIATION_REP_CAP, NEGOTIATION_REP_GIVE } from '../utils/constants';
import { callbackPrice, counterCost, counterPrice } from './negotiationMath';
import type { NegotiationCounter, NegotiationDef } from '../utils/types';
import { ReputationManager } from './ReputationManager';
import { StatsManager } from './StatsManager';

export type NegotiationOutcome = 'deal' | 'walk';

/** One row the dialogue box draws. */
export interface NegotiationOption {
  text: string;
  enabled: boolean;
  lockedReason?: string;
}

type Action =
  | { kind: 'counter'; counter: NegotiationCounter }
  | { kind: 'accept' }
  | { kind: 'walk' };

export const rupees = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

/** Store keys. Progress persists in the save, so an NPC remembers where you left the price. */
const priceKey = (id: string, term: string) => `neg.${id}.${term}`;
const usedKey = (id: string, counter: string) => `neg.${id}.used.${counter}`;

/**
 * Negotiation — the offer / counter / walk mini-system (ADR-22, ADR-95).
 *
 * One haggle with one NPC over one bill of terms (deposit + rent, a token, an
 * auto fare). Engine-free and deterministic: the same arguments to the same
 * temperament always land on the same price, so content can be tuned by
 * reading numbers, and tests can pin them.
 *
 * The loop is the core loop in miniature: the asking price is the Challenge,
 * a counter-offer is the Action, the NPC's reply and the new price are the
 * Feedback, the agreed bill is the Progress, the money saved is the Reward.
 *
 * Rules:
 * - Each counter-offer can be made once (ever — the NPC remembers) and costs
 *   patience. Out of patience → the final offer: only agree or walk remain.
 * - The NPC gives up a share of the gap between their price and your offer
 *   (TEMPERAMENTS[temperament].give[tactic]), plus a little for local
 *   reputation, never below their hidden floor, in ₹100 steps.
 * - Walking: warm NPCs let you go; firm ones call you back once with a
 *   halfway price; slick ones drop to their floor. Prices you reached are
 *   kept for the next visit.
 * - Agreeing pays the whole bill through StatsManager.spend(); the option is
 *   shown locked with "Needs ₹N" when the wallet cannot cover it.
 */
export class Negotiation {
  readonly def: NegotiationDef;
  private prices: Record<string, number> = {};
  private patience: number;
  private final = false;
  private calledBack = false;
  private give: number;
  /** The NPC's latest reply, or null before the first move (the dialogue node's text speaks first). */
  line: string | null = null;

  constructor(def: NegotiationDef, standing = 0) {
    this.def = def;
    this.patience = def.patience;
    this.give = Math.min(NEGOTIATION_REP_CAP, Math.max(0, standing) * NEGOTIATION_REP_GIVE);
    const counters = useGameStore.getState().counters;
    for (const term of def.terms) {
      const saved = counters[priceKey(def.id, term.id)];
      this.prices[term.id] = saved !== undefined ? saved : term.ask;
    }
  }

  get total(): number {
    return Object.values(this.prices).reduce((a, b) => a + b, 0);
  }

  price(termId: string): number {
    return this.prices[termId];
  }

  get isFinal(): boolean {
    return this.final;
  }

  /** "Deposit ₹10,000 + Rent ₹8,000 = ₹18,000" — the bill as it stands. */
  get ledger(): string {
    const parts = this.def.terms.map((t) => `${t.label} ${rupees(this.prices[t.id])}`);
    return parts.length > 1 ? `${parts.join(' + ')} = ${rupees(this.total)}` : parts[0];
  }

  private actions(): Action[] {
    const { flags } = useGameStore.getState();
    const counters: Action[] = this.final
      ? []
      : this.def.counters
          .filter((c) => !flags[usedKey(this.def.id, c.id)])
          .filter((c) => !c.requiresFlag || flags[c.requiresFlag])
          .map((counter) => ({ kind: 'counter', counter }));
    return [...counters, { kind: 'accept' }, { kind: 'walk' }];
  }

  options(): NegotiationOption[] {
    const stats = StatsManager.getInstance();
    return this.actions().map((action) => {
      if (action.kind === 'counter') return { text: action.counter.text, enabled: true };
      if (action.kind === 'walk') return { text: this.def.walkText ?? 'Walk away', enabled: true };
      const text = (this.def.acceptText ?? 'Agree — pay {total}').replace('{total}', rupees(this.total));
      const enabled = stats.canAfford(this.total);
      return enabled ? { text, enabled } : { text, enabled, lockedReason: `Needs ${rupees(this.total)}` };
    });
  }

  /** Take option `index`. Returns the outcome when the negotiation is over. */
  choose(index: number): NegotiationOutcome | null {
    const action = this.actions()[index];
    if (!action) throw new Error(`Negotiation "${this.def.id}" has no option ${index}`);
    if (action.kind === 'counter') {
      this.counter(action.counter);
      return null;
    }
    if (action.kind === 'accept') return this.accept();
    return this.walk();
  }

  private counter(c: NegotiationCounter): void {
    const store = useGameStore.getState();
    store.setFlag(usedKey(this.def.id, c.id), true);

    this.patience -= counterCost(this.def, c);

    const term = this.def.terms.find((x) => x.id === c.term)!;
    const current = this.prices[term.id];
    const next = counterPrice(this.def, term, current, c, this.give);

    let line: string;
    if (next === null) {
      line = this.def.lines.offended;
    } else if (next >= current) {
      line = this.def.lines.hold;
    } else {
      this.setPrice(term.id, next);
      line = this.fill(this.def.lines.concede, term.label, next);
    }

    if (this.patience <= 0) {
      this.final = true;
      line = `${line} ${this.fill(this.def.lines.final, term.label, this.prices[term.id])}`;
    }
    this.line = line;
  }

  private accept(): NegotiationOutcome {
    const total = this.total;
    if (!StatsManager.getInstance().spend(total, this.def.reason ?? `negotiation:${this.def.id}`, NPCS[this.def.npc]?.name)) {
      throw new Error(`Negotiation "${this.def.id}": cannot afford ${rupees(total)}`);
    }
    const store = useGameStore.getState();
    for (const flag of this.def.on_deal?.flags ?? []) store.setFlag(flag, true);
    for (const [counter, termId] of Object.entries(this.def.on_deal?.counters ?? {})) {
      store.setCounter(counter, this.prices[termId]);
    }
    gameEvents.emit('negotiation:ended', { negotiationId: this.def.id, outcome: 'deal', total });
    return 'deal';
  }

  private walk(): NegotiationOutcome | null {
    if (!this.calledBack && this.def.terms.some((t) => callbackPrice(this.def, t, this.prices[t.id]) !== null)) {
      this.calledBack = true;
      this.final = true;
      for (const term of this.def.terms) this.setPrice(term.id, callbackPrice(this.def, term, this.prices[term.id]) ?? this.prices[term.id]);
      this.line = this.fill(this.def.lines.callback!, this.def.terms[0].label, this.prices[this.def.terms[0].id]);
      return null;
    }
    gameEvents.emit('negotiation:ended', { negotiationId: this.def.id, outcome: 'walk', total: this.total });
    return 'walk';
  }

  private setPrice(termId: string, value: number): void {
    this.prices[termId] = value;
    useGameStore.getState().setCounter(priceKey(this.def.id, termId), value);
  }

  private fill(template: string, label: string, amount: number): string {
    return template
      .split('{term}').join(label)
      .split('{amount}').join(rupees(amount))
      .split('{total}').join(rupees(this.total));
  }
}

/** Factory: looks the definition up and applies local reputation. */
export const NegotiationManager = {
  begin(id: string): Negotiation {
    const def = NEGOTIATIONS[id];
    if (!def) throw new Error(`Unknown negotiation "${id}"`);
    const district = useGameStore.getState().activeDistrict;
    const standing = district ? ReputationManager.getInstance().standingIn(district) : 0;
    return new Negotiation(def, standing);
  },
};
