import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DIALOGUE, DISTRICTS, ITEMS, LOOT, QUESTS, SCENES } from '../data';
import { buildPrereqState } from '../dev/prereq';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { STOCK } from '../systems/trade';
import { grade } from '../systems/stability';
import { stabilityNow } from '../systems/stabilityNow';
import { useGameStore } from '../store';
import { act4Base, baseNightsKey, lampFailedFlag } from '../world/behaviours/act4Base';
import { sleepEvents } from '../world/behaviours/sleepEvents';
import type { SceneComponent } from '../utils/types';
import WALK from '../data/walkthroughs/act4_hill_days.json';

const hill = DISTRICTS.ambedkar_nagar_hill, flat = DISTRICTS.hill_flat, ward = DISTRICTS.ward4;
const store = () => useGameStore.getState();
const reset = () => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear(); store().reset(); TimeManager.resetInstance(); StatsManager.resetInstance(); DialogueManager.resetInstance(); InventoryManager.resetInstance();
};
const talk = (id: string, picks: string[] = []): string[] => {
  const dm = DialogueManager.getInstance();
  let v = dm.start(id);
  const seen = [v.nodeId];
  for (const p of picks) {
    while (v.canAdvance) { v = dm.advance(); seen.push(v.nodeId); }
    v = dm.choose(v.choices.findIndex((c) => c.text.startsWith(p)));
    seen.push(v.nodeId);
  }
  while (v.canAdvance) { v = dm.advance(); seen.push(v.nodeId); }
  dm.end();
  return seen;
};

describe('4.3 "Four Nights" — the hill base, days 1–4 (ADR-152)', () => {
  beforeEach(reset);

  it('is built (P24) as the chain\'s first base; the stub keeps B2–B5', () => {
    expect(SCENES.act4_hill_days.status).toBe('P24');
    expect(SCENES.act4_base_chain.status).toBe('STUB');
    expect(SCENES.act4_hill_days.entry).toEqual(expect.objectContaining({ from: 'act4_the_hill', counters: { 'base_nights:hill_flat': 1, act4_day: 1 } }));
    expect(QUESTS.q_act4_hill_days.prerequisite_quests).toEqual(['q_act4_the_hill']);
  });

  it('a solo start carries the nights already slept at the base (so the lamp fails on the same night as in a full run)', () => {
    const s = buildPrereqState('act4_hill_days', Object.values(SCENES) as SceneComponent[], { stats: store().stats, clock: { day: 1, minute: 420 } });
    expect(s.counters[baseNightsKey('hill_flat')]).toBe(1);
    expect(s.flags.hill_first_night).toBe(true);
  });

  it('the mornings: Deepa back after night 2, Karthik gone after night 3, the lamp fails on night 4 and the hill turns', () => {
    const cards: string[] = [];
    const s = store();
    for (const f of ['act4', 'hill_base_set', 'hill_first_night']) s.setFlag(f, true);
    s.setCounter(baseNightsKey('hill_flat'), 1);
    for (const c of Object.values(STOCK)) s.setCounter(c, 9);
    const offs = [act4Base.attach({ district: flat } as never), sleepEvents.attach({ district: flat, playCard: (id: string) => cards.push(id) } as never)] as Array<() => void>;
    TimeManager.getInstance().sleep();
    expect([store().flags.deepa_back, store().flags.karthik_gone]).toEqual([true, undefined]);
    TimeManager.getInstance().sleep();
    expect(store().flags.karthik_gone).toBe(true);
    expect(store().flags[lampFailedFlag('hill_flat')]).toBeUndefined();
    TimeManager.getInstance().sleep();
    expect(store().flags[lampFailedFlag('hill_flat')]).toBe(true);
    expect(store().flags.hill_turned).toBe(true);
    expect(cards).toEqual(['card_hill_turned']);
    for (const off of offs) off();
  });

  it('a night dark for want of fuel is not the failure', () => {
    const s = store();
    for (const f of ['act4', 'hill_base_set']) s.setFlag(f, true);
    const off = act4Base.attach({ district: flat } as never) as () => void;
    TimeManager.getInstance().sleep();
    expect(store().flags['base_dark:hill_flat']).toBe(true);
    expect(store().flags[lampFailedFlag('hill_flat')]).toBeUndefined();
    off();
  });

  it('Suresh: day one (Deepa missing, Mani\'s store); after the dark night, the move to Uncle\'s tiffin room', () => {
    store().setFlag('met_suresh', true);
    store().setFlag('hill_first_night', true);
    expect(talk('dlg_suresh', ['(Nod.)'])).toEqual(['day1', 'day1_store', 'day1_bye']);
    expect(store().flags.suresh_day1).toBe(true);
    expect(hill.triggers).toContainEqual({ zone: 'stall_store', dialogue: 'search:hill_chai_store', requiresFlag: 'suresh_day1', unlessFlag: 'looted:hill_chai_store' });
    expect(LOOT.hill_chai_store.items).toEqual({ steel_tumbler: 2, stones: 2 });
    store().setFlag('hill_turned', true);
    expect(talk('dlg_suresh', ['(Start packing.)'])).toEqual(['turned', 'turned_go', 'moving']);
    expect(store().flags.base_hill_done).toBe(true);
  });

  it('Deepa asks for Ward 4\'s antivirals; the strip is hers only once you carry it', () => {
    store().setFlag('act4', true);
    expect(talk('dlg_deepa', ['What do you need?', "I'll go."])).toEqual(['start', 'need', 'go']);
    expect(store().flags.deepa_asked).toBe(true);
    const dm = DialogueManager.getInstance();
    let v = dm.start('dlg_deepa');
    expect(v.nodeId).toBe('waiting');
    expect(v.choices[0]).toEqual(expect.objectContaining({ enabled: false }));
    dm.end();
    InventoryManager.getInstance().add('antivirals');
    v = dm.start('dlg_deepa');
    dm.choose(0);
    expect(store().flags.deepa_medicine).toBe(true);
    expect(InventoryManager.getInstance().has('antivirals')).toBe(false);
    expect(ITEMS.antivirals.type).toBe('key_item');
  });

  it('the walk to Hebbal and back: a card each way, the way out waits for the strip', () => {
    expect(hill.triggers).toContainEqual({ zone: 'walk_out', action: 'card', card: 'card_walk_hebbal', requiresFlag: 'deepa_asked', unlessFlag: 'looted:ward4_cabinet' });
    expect(CARDS.card_walk_hebbal.then).toEqual({ district: 'ward4', spawn: 'ward_door', minute: 750 });
    expect(CARDS.card_walk_home.then).toEqual({ district: 'ambedkar_nagar_hill', spawn: 'slope_base', minute: 1120 });
    expect(ward.triggers).toContainEqual({ zone: 'ward_exit', action: 'card', card: 'card_walk_home', requiresFlag: 'looted:ward4_cabinet' });
    expect(LOOT.ward4_cabinet.items).toEqual({ antivirals: 1 });
  });

  it('Ward 4 in Act 4: the staff and the patients gone, Act 3\'s corners quiet, two in scrubs standing by the glass', () => {
    expect(ward.npcs!.filter((n) => !n.unlessFlag || n.unlessFlag === 'act4').map((n) => n.unlessFlag)).toEqual(['act4', 'act4']);
    for (const t of ward.triggers!.filter((t) => ['tv_zone', 'tray_zone'].includes(t.zone))) expect([t.unlessFlag].flat()).toContain('act4');
    expect(ward.triggers!.find((t) => t.card === 'card_leaving_ward')!.unlessFlag).toBe('act4');
    expect(ward.walkSpeedUnless).toBe('discharged');
    expect(ward.infected!.packs[0]).toEqual(expect.objectContaining({ id: 'scrubs', startMode: 'idle', sheets: ['npc_nurse', 'inf_base_male_1'] }));
    store().setFlag('act4', true);
    expect(grade(stabilityNow('ward4'))).toBe(4);
  });

  it('the hill after the dark night: Mani gone, the hill at "hot"', () => {
    expect(hill.npcs!.find((n) => n.id === 'npc_hill_chai')!.unlessFlag).toBe('hill_turned');
    expect(hill.npcs!.find((n) => n.id === 'npc_karthik')!.unlessFlag).toBe('karthik_gone');
    expect(hill.npcs!.find((n) => n.id === 'npc_deepa')).toEqual({ id: 'npc_deepa', spawn: 'deepa_spot', requiresFlag: 'deepa_back', unlessFlag: 'base_cafe_set' });
    store().setFlag('act4', true); store().setFlag('hill_turned', true);
    expect(grade(stabilityNow('ambedkar_nagar_hill'))).toBe(3);
    expect(DIALOGUE.dlg_hill_chai).toBeDefined();
  });

  it('the bot walks (never runs) past the still ones, and needs no shortcut', () => {
    const steps = WALK.steps as Array<{ do: string; target?: string; pace?: string }>;
    expect(steps.some((s) => s.do === 'unresolved' || s.do === 'set_flag')).toBe(false);
    for (const t of ['zone:cabinet_zone', 'zone:ward_exit']) expect(steps.find((s) => s.target === t)?.pace).toBe('walk');
  });
});
