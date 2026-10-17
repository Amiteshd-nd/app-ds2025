import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, LOOT, SCENES } from '../data';
import { panelsFor } from '../systems/cards';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { STOCK } from '../systems/trade';
import { useGameStore } from '../store';
import { act4Base, lampFailedFlag } from '../world/behaviours/act4Base';
import { sleepEvents } from '../world/behaviours/sleepEvents';
import WALK from '../data/walkthroughs/act4_cubbon.json';

const cubbon = DISTRICTS.cubbon_park;
const store = () => useGameStore.getState();
const inv = () => InventoryManager.getInstance();
const reset = () => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear(); store().reset(); TimeManager.resetInstance(); StatsManager.resetInstance(); DialogueManager.resetInstance(); InventoryManager.resetInstance();
};
const RUNS = [
  { card: 'card_run_hebbal', place: 'hebbal_gate', loot: 'hebbal_stores', item: 'med_crate', gate: 'rathore_runs' },
  { card: 'card_run_majestic', place: 'majestic_interchange', loot: 'majestic_kiosk', item: 'radio_set', gate: 'run2_ready' },
  { card: 'card_run_church', place: 'church_street', loot: 'digital_cores', item: 'battery_cores', gate: 'run3_ready' },
  { card: 'card_run_hivr', place: 'hivr_corridor', loot: 'hivr_emitter', item: 'uv_emitter_parts', gate: 'run4_ready' },
];

describe('4.3c "The Line" — Cubbon, Rathore\'s runs, the fire (ADR-154)', () => {
  beforeEach(reset);

  it('is built (P26); the stub keeps the Palace and Lalbagh (4.3d)', () => {
    expect(SCENES.act4_cubbon).toEqual(expect.objectContaining({ status: 'P26', seq: '4.3c' }));
    expect(SCENES.act4_base_chain.seq).toBe('4.3d');
    expect(CARDS.card_walk_cubbon.then).toEqual({ district: 'cubbon_park', spawn: 'bus_drop', minute: 630 });
    expect(panelsFor(CARDS.card_walk_cubbon, {}).flatMap((p) => p.setFlags ?? [])).toContain('base_cubbon_set');
  });

  it('the camp is a base on the lamp line: a cot, a crate, a bench, three lamps; the line is cut on the fourth night', () => {
    expect(cubbon.base).toEqual(expect.objectContaining({ spawn: 'camp_spot', requiresFlag: 'base_cubbon_set', lampFailsOnNight: 4 }));
    expect(cubbon.base!.uv).toHaveLength(3);
    const s = store();
    for (const f of ['act4', 'base_cubbon_set']) s.setFlag(f, true);
    for (const c of Object.values(STOCK)) s.setCounter(c, 9);
    const cards: string[] = [];
    const offs = [act4Base.attach({ district: cubbon } as never), sleepEvents.attach({ district: cubbon, playCard: (id: string) => cards.push(id) } as never)] as Array<() => void>;
    for (let i = 0; i < 4; i++) TimeManager.getInstance().sleep();
    expect([store().flags[lampFailedFlag('cubbon_park')], store().flags.cubbon_turned, cards]).toEqual([true, true, ['card_line_cut']]);
    for (const off of offs) off();
  });

  it('one run at a time: each opens the night after the last delivery, at the camp gate', () => {
    for (const r of RUNS) {
      expect(cubbon.triggers).toContainEqual({ zone: 'run_gate', action: 'card', card: r.card, requiresFlag: r.gate, unlessFlag: `looted:${r.loot}` });
      expect(CARDS[r.card].then!.district).toBe(r.place);
      expect(LOOT[r.loot].items).toEqual({ [r.item]: 1 });
      expect(DISTRICTS[r.place].triggers).toContainEqual(expect.objectContaining({ action: 'card', card: 'card_back_cubbon', requiresFlag: `looted:${r.loot}` }));
      expect(DISTRICTS[r.place].infected!.packs.every((p) => p.startMode === 'idle')).toBe(true);
    }
    expect(cubbon.sleepEvents!.slice(0, 3).map((e) => [e.after, e.set[0], e.nights])).toEqual([['supply_run_1', 'run2_ready', 1], ['supply_run_2', 'run3_ready', 1], ['supply_run_3', 'run4_ready', 1]]);
  });

  it('Rathore takes each thing you bring; four and the fifth waits for Malleswaram', () => {
    store().setFlag('rathore_runs', true);
    const dm = DialogueManager.getInstance();
    let v = dm.start('dlg_rathore');
    expect(v.nodeId).toBe('board');
    expect(v.choices.slice(0, 4).every((c) => !c.enabled)).toBe(true);
    dm.end();
    for (const r of RUNS) inv().add(r.item);
    for (let k = 0; k < 4; k++) {
      v = dm.start('dlg_rathore');
      v = dm.choose(k);
      dm.end();
      expect(store().flags[`supply_run_${k + 1}`]).toBe(true);
    }
    expect(v.nodeId).toBe('thanks_4');
    v = dm.start('dlg_rathore');
    expect(v.choices.slice(0, 4).map((c) => c.lockedReason)).toEqual(['Done', 'Done', 'Done', 'Done']);
    dm.end();
  });

  it('the fire: three voices, one choice each sets a trust', () => {
    const dm = DialogueManager.getInstance();
    let v = dm.start('dlg_argument');
    v = dm.advance();
    expect(v.choices.map((c) => c.text)).toEqual(["Karthik's right. We get out.", "Priya's right. We end it.", 'Suresh is right. We hold.']);
    dm.choose(1); dm.end();
    expect([store().flags.priya_trust, store().flags.argument_done]).toEqual([true, true]);
  });

  it('Ananya is at the camp unless 2.6 left you strained — then her photo on the noticeboard', () => {
    expect(cubbon.npcs!.find((n) => n.id === 'npc_ananya_camp')).toEqual(expect.objectContaining({ requiresFlag: 'base_cubbon_set', unlessFlag: 'ananya_strained' }));
    expect(cubbon.triggers).toContainEqual({ zone: 'ananya_board', dialogue: 'dlg_ananya_photo', requiresFlag: 'ananya_strained', unlessFlag: 'ananya_photo_seen' });
    store().setFlag('base_cubbon_set', true);
    expect(DialogueManager.getInstance().start('dlg_ananya_photo').text).toContain('Went with the first trucks');
  });

  it('the HIVR corridor plays as yourself in Act 4; Acts 0–3\'s people are gone from every run', () => {
    expect(DISTRICTS.hivr_corridor.ownSelfAfter).toBe('act4');
    // Everyone placed before Act 4 leaves with it; the camp's people arrive with the camp.
    for (const id of ['cubbon_park', 'majestic_interchange', 'church_street']) {
      for (const n of DISTRICTS[id].npcs!.filter((x) => x.requiresFlag !== 'base_cubbon_set')) expect([n.unlessFlag].flat(), `${id}/${n.id}`).toContain('act4');
    }
    for (const n of DISTRICTS.hebbal_gate.npcs!) expect([n.unlessFlag].flat()).toContain('act4_janata_done');
  });

  it('the bot walks every run quietly and needs no shortcut', () => {
    const steps = WALK.steps as Array<{ do: string; target?: string; pace?: string }>;
    expect(steps.some((s) => s.do === 'unresolved' || s.do === 'set_flag')).toBe(false);
    for (const t of ['zone:slot_front', 'zone:kiosk_front', 'zone:digital_front', 'zone:glove_zone']) expect(steps.find((s) => s.target === t)?.pace, t).toBe('walk');
  });
});
