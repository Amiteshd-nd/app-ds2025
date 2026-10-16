import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { NEGOTIATIONS } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { Negotiation, NegotiationManager } from '../systems/NegotiationManager';
import { planHaggle, type HagglePlan } from '../systems/negotiationMath';
import { ReputationManager } from '../systems/ReputationManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';

beforeEach(() => {
  gameEvents.clear();
  DialogueManager.resetInstance();
  StatsManager.resetInstance();
  ReputationManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
/** Index of the option whose text contains `needle`. */
const pick = (n: Negotiation, needle: string) => {
  const i = n.options().findIndex((o) => o.text.includes(needle));
  if (i < 0) throw new Error(`no option containing "${needle}" in ${n.options().map((o) => o.text).join(' | ')}`);
  return i;
};

describe('negotiation — warm (Shanthamma)', () => {
  const begin = () => new Negotiation(NEGOTIATIONS.neg_shanthamma);

  it('opens at the asking price with counters, agree and walk', () => {
    const n = begin();
    expect(n.total).toBe(18000);
    expect(n.ledger).toBe('Deposit ₹10,000 + Rent ₹8,000 = ₹18,000');
    const texts = n.options().map((o) => o.text);
    expect(texts[texts.length - 2]).toBe('Okay, Aunty — pay ₹18,000');
    expect(texts[texts.length - 1]).toBe('Let me see the other places first');
  });

  it('hides a counter until the player has earned the knowledge', () => {
    expect(begin().options().some((o) => o.text.includes('green-gate'))).toBe(false);
    store().setFlag('pg_token_quoted', true);
    expect(begin().options().some((o) => o.text.includes('green-gate'))).toBe(true);
  });

  it('gives most of the gap to a real reason, in ₹100 steps, never below the floor', () => {
    store().setFlag('pg_token_quoted', true);
    const n = begin();
    expect(n.choose(pick(n, 'join Monday'))).toBeNull();
    expect(n.price('deposit')).toBe(7000);
    expect(n.line).toContain('Deposit ₹7,000');
    n.choose(pick(n, 'amma'));
    expect(n.price('rent')).toBe(7400);
    n.choose(pick(n, 'green-gate'));
    expect(n.price('rent')).toBe(7300);
    // Three arguments spent her patience: the final offer, agree or walk only.
    expect(n.isFinal).toBe(true);
    expect(n.options()).toHaveLength(2);
    expect(n.line).toContain('₹14,300, final');
  });

  it('takes offence at a lowball: no movement, double patience', () => {
    const n = begin();
    n.choose(pick(n, '₹2,000'));
    expect(n.total).toBe(18000);
    expect(n.line).toContain('sabzi market');
    n.choose(pick(n, 'join Monday'));
    expect(n.isFinal).toBe(true);
  });

  it('local reputation makes her give a little more', () => {
    useGameStore.setState({ activeDistrict: 'prashanth_layout' });
    ReputationManager.getInstance().add(10, 'prashanth_layout');
    const n = NegotiationManager.begin('neg_shanthamma');
    n.choose(pick(n, 'join Monday'));
    expect(n.price('deposit')).toBe(6300);
  });

  it('agreeing pays the bill once and records the deal', () => {
    const events: string[] = [];
    gameEvents.on('negotiation:ended', ({ outcome, total }) => events.push(`${outcome}:${total}`));
    const n = begin();
    n.choose(pick(n, 'join Monday'));
    expect(n.choose(pick(n, 'pay'))).toBe('deal');
    expect(store().stats.wallet).toBe(35000 - 15000);
    expect(store().flags.pg_signed).toBe(true);
    expect(store().counters.pg_rent).toBe(8000);
    expect(store().counters.pg_deposit).toBe(7000);
    expect(events).toEqual(['deal:15000']);
  });

  it('lets you walk, and remembers the price and the arguments next visit', () => {
    const n = begin();
    n.choose(pick(n, 'join Monday'));
    expect(n.choose(pick(n, 'other places'))).toBe('walk');
    const again = begin();
    expect(again.price('deposit')).toBe(7000);
    expect(again.options().some((o) => o.text.includes('join Monday'))).toBe(false);
  });

  it('locks agreeing when the wallet is short', () => {
    useGameStore.setState((s) => ({ stats: { ...s.stats, wallet: 1000 } }));
    const option = begin().options().find((o) => o.text.startsWith('Okay, Aunty'))!;
    expect(option.enabled).toBe(false);
    expect(option.lockedReason).toBe('Needs ₹18,000');
  });
});

describe('negotiation — firm (green-gate token)', () => {
  it('moves on comparison, calls you back once at half the remaining gap', () => {
    const n = new Negotiation(NEGOTIATIONS.neg_pg_token);
    n.choose(pick(n, 'Other PGs'));
    expect(n.total).toBe(800);
    n.choose(pick(n, 'landed'));
    expect(n.total).toBe(700);
    expect(n.choose(pick(n, 'after I see'))).toBeNull();
    expect(n.total).toBe(600);
    expect(n.line).toContain('Arre, wait');
    expect(n.choose(pick(n, 'after I see'))).toBe('walk');
  });
});

describe('negotiation — slick (HiveNest)', () => {
  it('drops to the floor when you leave — and the floor is still out of reach', () => {
    const n = new Negotiation(NEGOTIATIONS.neg_coliving);
    expect(n.total).toBe(62000);
    n.choose(pick(n, 'over my budget'));
    expect(n.total).toBe(43000);
    const sign = n.options().find((o) => o.text.startsWith('Sign up'))!;
    expect(sign.enabled).toBe(false);
    expect(sign.lockedReason).toBe('Needs ₹43,000');
  });
});

describe('dialogue ↔ negotiation', () => {
  it('runs the haggle inside the conversation and lands on the deal node', () => {
    const dm = DialogueManager.getInstance();
    let view = dm.start('dlg_shanthamma');
    view = dm.choose(view.choices.findIndex((c) => c.text.startsWith('How much')));
    expect(view.nodeId).toBe('price');
    expect(view.ledger).toBe('Deposit ₹10,000 + Rent ₹8,000 = ₹18,000');
    expect(view.canAdvance).toBe(false);
    view = dm.choose(view.choices.findIndex((c) => c.text.includes('join Monday')));
    expect(view.text).toContain('Deposit ₹7,000');
    view = dm.choose(view.choices.findIndex((c) => c.text.startsWith('Okay, Aunty')));
    expect(view.nodeId).toBe('done');
    expect(view.ledger).toBeUndefined();
    expect(store().flags.pg_signed).toBe(true);
  });

  it('walking lands on the walk node', () => {
    const dm = DialogueManager.getInstance();
    let view = dm.start('dlg_shanthamma');
    view = dm.choose(0);
    view = dm.choose(view.choices.findIndex((c) => c.text.includes('other places')));
    expect(view.nodeId).toBe('walked');
  });

  it('refuses a locked option', () => {
    useGameStore.setState((s) => ({ stats: { ...s.stats, wallet: 100 } }));
    const dm = DialogueManager.getInstance();
    let view = dm.start('dlg_shanthamma');
    view = dm.choose(0);
    const locked = view.choices.findIndex((c) => !c.enabled);
    expect(() => dm.choose(locked)).toThrow(/locked/);
  });
});

describe('dialogue entry branches (NPCs remember)', () => {
  it('opens on the first branch whose flag is set', () => {
    const dm = DialogueManager.getInstance();
    expect(dm.start('dlg_neighbour_leela').nodeId).toBe('start');
    dm.end();
    store().setFlag('pg_token_paid', true);
    expect(dm.start('dlg_neighbour_leela').nodeId).toBe('scammed');
    dm.end();
    store().setFlag('pg_token_scammed', true);
    expect(dm.start('dlg_neighbour_leela').nodeId).toBe('after');
  });

  it('a dialogue effect can grant local reputation', () => {
    useGameStore.setState({ activeDistrict: 'prashanth_layout' });
    const dm = DialogueManager.getInstance();
    let view = dm.start('dlg_pg_token');
    view = dm.choose(view.choices.findIndex((c) => c.text.includes('see the room')));
    view = dm.choose(view.choices.findIndex((c) => c.text.includes('No room, no token')));
    expect(view.nodeId).toBe('refused');
    expect(ReputationManager.getInstance().standingIn('prashanth_layout')).toBe(2);
  });
});

describe('planHaggle — the bot haggles with the game\'s own arithmetic (T-054 step 4)', () => {
  /** Play a plan through the real Negotiation and return the bill it agrees. */
  const play = (id: string, plan: HagglePlan) => {
    const def = NEGOTIATIONS[id];
    const n = new Negotiation(def);
    for (const c of plan.counters) expect(n.choose(pick(n, c.text))).toBeNull();
    if (plan.walkFirst) expect(n.choose(pick(n, def.walkText ?? 'Walk away'))).toBeNull();
    return n.total;
  };

  it('every negotiation: the planned total is what the game agrees, and never above the ask', () => {
    store().setFlag('pg_token_quoted', true);
    for (const def of Object.values(NEGOTIATIONS)) {
      const plan = planHaggle(def, { flags: store().flags })!;
      expect(plan, def.id).not.toBeNull();
      expect(plan.total, def.id).toBeLessThanOrEqual(def.terms.reduce((a, t) => a + t.ask, 0));
      useGameStore.getState().reset();
      store().setFlag('pg_token_quoted', true);
      expect(play(def.id, plan), def.id).toBe(plan.total);
    }
  });

  it('Shanthamma: three reasoned counters, never the lowball', () => {
    const plan = planHaggle(NEGOTIATIONS.neg_shanthamma, { flags: { pg_token_quoted: true } })!;
    expect(plan.counters.map((c) => c.id)).toEqual(['monday', 'corner_pg', 'amma']);
    expect(plan.total).toBe(14300);
  });

  it('skips counters already used and ones whose knowledge is missing; respects the wallet', () => {
    const def = NEGOTIATIONS.neg_shanthamma;
    const plan = planHaggle(def, { flags: { 'neg.neg_shanthamma.used.monday': true } })!;
    expect(plan.counters.map((c) => c.id)).not.toContain('monday');
    expect(plan.counters.map((c) => c.id)).not.toContain('corner_pg');
    expect(planHaggle(def, { wallet: 100 })).toBeNull();
  });
});
