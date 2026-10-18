import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, ITEMS, LOOT, SCENES } from '../data';
import { buildPrereqState } from '../dev/prereq';
import { panelsFor } from '../systems/cards';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { STOCK } from '../systems/trade';
import { act4Base, baseNightsKey, lampFailedFlag } from '../world/behaviours/act4Base';
import { sleepEvents } from '../world/behaviours/sleepEvents';
import type { SceneComponent } from '../utils/types';
import WALK from '../data/walkthroughs/act4_cafe.json';

const cafe = DISTRICTS.tiffin_room, lane = DISTRICTS.indiranagar_lane, office = DISTRICTS.office_gate, layout = DISTRICTS.prashanth_layout, hill = DISTRICTS.ambedkar_nagar_hill;
const store = () => useGameStore.getState();
const inv = () => InventoryManager.getInstance();
const reset = () => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear(); store().reset(); TimeManager.resetInstance(); StatsManager.resetInstance(); DialogueManager.resetInstance(); InventoryManager.resetInstance();
};
const choose = (id: string, text: string): { cards: string[]; node: string } => {
  const cards: string[] = [];
  const off = gameEvents.on('card:requested', ({ cardId }) => cards.push(cardId));
  const dm = DialogueManager.getInstance();
  let v = dm.start(id);
  while (v.canAdvance) v = dm.advance();
  v = dm.choose(v.choices.findIndex((c) => c.text.startsWith(text)));
  dm.end(); off();
  return { cards, node: v.nodeId };
};

describe('4.3b "The Tiffin Room" — the chain\'s second base (ADR-153)', () => {
  beforeEach(reset);

  it('is built (P25) between the hill and the stub (now 4.3c: Cubbon, the Palace, Lalbagh)', () => {
    expect(SCENES.act4_cafe).toEqual(expect.objectContaining({ status: 'P25', seq: '4.3b' }));
    expect(SCENES.act4_base_chain).toEqual(expect.objectContaining({ status: 'STUB' }));
    const s = buildPrereqState('act4_cafe', Object.values(SCENES) as SceneComponent[], { stats: store().stats, clock: { day: 1, minute: 420 } });
    expect(s.inventory.filter((i) => i === 'steel_tumbler')).toHaveLength(2);
    expect(s.counters.act4_day).toBe(4);
  });

  it('the walk west waits for Suresh\'s decision; Kumar\'s horn in the lane, 4.1\'s run never replays', () => {
    expect(hill.triggers).toContainEqual({ zone: 'walk_out', action: 'card', card: 'card_walk_west', requiresFlag: 'base_hill_done' });
    expect(CARDS.card_walk_west.then).toEqual({ district: 'indiranagar_lane', spawn: 'lane_top', minute: 580 });
    for (const p of lane.infected!.packs.filter((p) => p.id !== 'auto_pack')) expect(p.unlessFlag, p.id).toBe('act4_five_done');
    expect(lane.infected!.packs.find((p) => p.id === 'auto_pack')).toEqual(expect.objectContaining({ startMode: 'idle', requiresFlag: 'base_hill_done' }));
  });

  it('Kumar: a tumbler down the side lane saves him; walking on ends his line — either way, the tiffin room', () => {
    store().setFlag('base_hill_done', true);
    let v = DialogueManager.getInstance().start('dlg_kumar_trapped');
    expect(v.choices[0]).toEqual(expect.objectContaining({ enabled: false, lockedReason: 'Nothing that clangs' }));
    DialogueManager.getInstance().end();
    inv().add('steel_tumbler', 2);
    expect(choose('dlg_kumar_trapped', 'Throw the tumbler')).toEqual({ cards: ['card_kumar_saved'], node: 'saved' });
    expect([store().flags.kumar_saved, inv().count('steel_tumbler')]).toEqual([true, 1]);
    reset();
    expect(choose('dlg_kumar_trapped', '(Keep walking.)').cards).toEqual(['card_kumar_left']);
    expect(store().flags.kumar_left).toBe(true);
    for (const id of ['card_kumar_saved', 'card_kumar_left']) {
      expect(CARDS[id].then!.district).toBe('tiffin_room');
      expect(panelsFor(CARDS[id], {}).flatMap((p) => p.setFlags ?? [])).toContain('base_cafe_set');
    }
    v = DialogueManager.getInstance().start('dlg_kumar_trapped');
    DialogueManager.getInstance().end();
  });

  it('the tiffin room is a base: mats, shelf, bench, kitchen; the generator lasts three nights, then Cubbon', () => {
    expect(cafe.base).toEqual({ spawn: 'shutter_in', uv: [{ at: [6, 1], radius: 3 }], requiresFlag: 'base_cafe_set', lampFailsOnNight: 3 });
    expect(cafe.triggers!.map((t) => t.dialogue ?? t.action)).toEqual(['sleep', 'base:tiffin_room', 'craft:bench', 'search:cafe_kitchen', 'card', 'card']);
    const s = store();
    for (const f of ['act4', 'base_cafe_set']) s.setFlag(f, true);
    for (const c of Object.values(STOCK)) s.setCounter(c, 9);
    const cards: string[] = [];
    const offs = [act4Base.attach({ district: cafe } as never), sleepEvents.attach({ district: cafe, playCard: (id: string) => cards.push(id) } as never)] as Array<() => void>;
    TimeManager.getInstance().sleep();
    expect(store().flags.cafe_day5).toBe(true);
    TimeManager.getInstance().sleep();
    expect(store().flags[lampFailedFlag('tiffin_room')]).toBeUndefined();
    TimeManager.getInstance().sleep();
    expect(store().counters[baseNightsKey('tiffin_room')]).toBe(3);
    expect([store().flags.cafe_turned, cards]).toEqual([true, ['card_cafe_dark']]);
    for (const off of offs) off();
    expect(choose('dlg_uncle', '(Pack.)').node).toBe('go');
    expect(store().flags.base_cafe_done).toBe(true);
  });

  it('the run: Kumar\'s back roads or the railway line; the colleagues at the shuttle bay; the AMR-07 log', () => {
    expect(cafe.triggers).toContainEqual({ zone: 'shutter_zone', action: 'card', card: 'card_run_whitefield', requiresFlag: 'cafe_day5', unlessFlag: 'raju_decided' });
    expect(panelsFor(CARDS.card_run_whitefield, { kumar_saved: true }).map((p) => p.title)).toContain('SERVICE ROADS · 08:15');
    expect(panelsFor(CARDS.card_run_whitefield, {}).map((p) => p.title)).toContain('THE RAILWAY LINE · 08:15');
    expect(office.infected!.packs[0]).toEqual(expect.objectContaining({ former: 'npc_prakash', startMode: 'idle' }));
    expect(office.npcs!.every((n) => [n.unlessFlag].flat().includes('act4'))).toBe(true);
    expect(LOOT.office_server.items).toEqual({ amr07_log: 1 });
    expect(ITEMS.amr07_log.type).toBe('key_item');
  });

  it('Raju: stones on a van free him; either way home at dusk', () => {
    store().setFlag('raju_heard', true);
    inv().add('stones', 2);
    expect(choose('dlg_raju_trapped', 'Throw stones').cards).toEqual(['card_back_cafe']);
    expect(store().flags.raju_saved).toBe(true);
    expect(CARDS.card_back_cafe.then).toEqual({ district: 'tiffin_room', spawn: 'shutter_in', minute: 1100 });
    expect(cafe.npcs!.find((n) => n.id === 'npc_raju_cafe')!.requiresFlag).toBe('raju_saved');
    expect(layout.npcs!.filter((n) => n.id !== 'npc_raju_shut').every((n) => [n.unlessFlag].flat().includes('act4'))).toBe(true);
  });

  it('Deepa reads the log: 14 March, 02:10 — your parser', () => {
    store().setFlag('base_cafe_set', true);
    inv().add('amr07_log');
    expect(choose('dlg_deepa', '(Give her the log.)').node).toBe('log');
    expect(store().flags.amr07_read).toBe(true);
    expect(inv().has('amr07_log')).toBe(false);
  });

  it('under the curfew nobody strolls; the bot walks past the still ones and needs no shortcut', () => {
    const steps = WALK.steps as Array<{ do: string; target?: string; pace?: string }>;
    expect(steps.some((s) => s.do === 'unresolved' || s.do === 'set_flag')).toBe(false);
    for (const t of ['zone:kumar_call', 'zone:office_door', 'zone:raju_call']) expect(steps.find((s) => s.target === t)?.pace, t).toBe('walk');
  });
});
