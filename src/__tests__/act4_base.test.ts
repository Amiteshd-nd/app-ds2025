import { beforeEach, describe, expect, it } from 'vitest';
import { DISTRICTS, ITEMS, LOOT, RECIPES, TRADERS, getDialogue, hasDialogue } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { STOCK, baseNight, valueOf } from '../systems/trade';
import { useGameStore } from '../store';
import { CORE_BEHAVIOURS } from '../world/behaviours';
import { baseActive } from '../world/behaviours/act4Base';

const reset = () => { useGameStore.getState().reset(); DialogueManager.resetInstance(); InventoryManager.resetInstance(); StatsManager.resetInstance(); };
const give = (bag: Record<string, number>) => { for (const [id, n] of Object.entries(bag)) InventoryManager.getInstance().add(id, n); };
const inv = (id: string) => InventoryManager.getInstance().count(id);

describe('the bench: four recipes (act4 doc §7, ADR-149)', () => {
  beforeEach(reset);

  it('the four, as data', () => {
    expect(RECIPES.map((r) => r.id)).toEqual(['smoke_bomb', 'noise_maker', 'uv_torch', 'bandage']);
    expect(hasDialogue('craft:bench')).toBe(true);
  });

  it('locked until you carry the ingredients; crafting swaps them for the result', () => {
    const dm = DialogueManager.getInstance();
    let v = dm.start('craft:bench');
    expect(v.choices[0].enabled).toBe(false);
    expect(v.choices[0].lockedReason).toContain('Need');
    dm.end();
    give({ bottle: 1, cloth: 1 });
    v = dm.start('craft:bench');
    expect(v.choices[0].enabled).toBe(true);
    dm.choose(0);
    expect(inv('smoke_bomb')).toBe(1);
    expect(inv('bottle') + inv('cloth')).toBe(0);
  });
});

describe('barter (plan §3.8, Q7)', () => {
  beforeEach(reset);

  it('every item has a value; the guitar is never traded', () => {
    for (const it of Object.values(ITEMS)) expect(typeof it.act4_value, it.id).toBe('number');
    expect(ITEMS.guitar.tradeable).toBe(false);
    expect(ITEMS.water_bottle.act4_value).toBe(1);
  });

  it('a trader asks 1.5× what he gives; a haggle brings it to even, never better', () => {
    for (const [, t] of Object.entries(TRADERS)) for (const d of t.deals) {
      expect(valueOf(d.get, ITEMS) * t.margin, d.id).toBeLessThanOrEqual(valueOf(d.give, ITEMS));
      expect(valueOf(d.better, ITEMS), d.id).toBeLessThanOrEqual(valueOf(d.give, ITEMS));
    }
  });

  it('a deal: your laptop for a food packet; the haggle needs a little City Survival', () => {
    const dm = DialogueManager.getInstance();
    give({ laptop: 1 });
    let v = dm.start('trade:trader_manju');
    const k = v.choices.findIndex((c) => c.text.startsWith('Your laptop'));
    expect(v.choices[k].enabled).toBe(true);
    v = dm.choose(k);
    const haggle = v.choices.find((c) => c.text === 'Haggle.')!;
    expect(haggle.enabled).toBe(false);
    v = dm.choose(v.choices.findIndex((c) => c.text === 'Deal.'));
    expect(inv('laptop')).toBe(0);
    expect(inv('food_packet')).toBe(1);
  });
});

describe('containers and the stock (plan §3.9)', () => {
  beforeEach(reset);

  it('a container is found once', () => {
    const dm = DialogueManager.getInstance();
    dm.start('search:bench_drawer');
    dm.choose(0);
    expect(inv('flashlight')).toBe(1);
    expect(useGameStore.getState().flags['looted:bench_drawer']).toBe(true);
    expect(Object.keys(LOOT)).toContain('bench_bag');
  });

  it('the stock shelf takes food, water and fuel into the base\'s counters', () => {
    const dm = DialogueManager.getInstance();
    give({ fuel_can: 1, canned_food: 1 });
    let v = dm.start('base:act4_base_bench');
    expect(v.text).toContain('fuel 0');
    dm.choose(v.choices.findIndex((c) => c.text.includes('Fuel can')));
    dm.end();
    v = dm.start('base:act4_base_bench');
    dm.choose(v.choices.findIndex((c) => c.text.includes('Canned food')));
    const c = useGameStore.getState().counters;
    expect([c[STOCK.fuel], c[STOCK.food]]).toEqual([1, 2]);
  });

  it('a night takes one of each; the lamp needs fuel and fails on its night', () => {
    const full = { [STOCK.food]: 2, [STOCK.water]: 1, [STOCK.fuel]: 1 };
    expect(baseNight(full, 1, 3)).toEqual({ take: { [STOCK.food]: -1, [STOCK.water]: -1, [STOCK.fuel]: -1 }, ate: true, drank: true, lit: true, failed: false });
    expect(baseNight(full, 3, 3).lit).toBe(false);
    expect(baseNight({}, 1).lit).toBe(false);
    expect(baseNight({}, 1).ate).toBe(false);
  });

  it('a base works only in Act 4; every place runs the base behaviour without listing it', () => {
    const bench = DISTRICTS.act4_base_bench;
    expect(baseActive(bench, {})).toBe(false);
    expect(baseActive(bench, { act4: true })).toBe(true);
    expect(baseActive(DISTRICTS.indiranagar_lane, { act4: true })).toBe(false);
    expect(CORE_BEHAVIOURS).toContain('act4Base');
    expect(getDialogue('base:act4_base_bench').speaker).toBe('Act 4 base bench');
  });
});
