import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, ITEMS, LOOT, SCENES, getDialogue } from '../data';
import { COMBAT, pulseTarget } from '../systems/combat';
import { DialogueManager } from '../systems/DialogueManager';
import { EVOLVED } from '../systems/infected';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { STOCK } from '../systems/trade';
import { useGameStore } from '../store';
import { TILE_SIZE } from '../utils/constants';
import { act4Base, lampFailedFlag } from '../world/behaviours/act4Base';
import { sleepEvents } from '../world/behaviours/sleepEvents';
import WALK from '../data/walkthroughs/act4_palace.json';

const palace = DISTRICTS.palace_grounds, lane = DISTRICTS.malleswaram_lane;
const store = () => useGameStore.getState();
const inv = () => InventoryManager.getInstance();
const reset = () => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear(); store().reset(); TimeManager.resetInstance(); StatsManager.resetInstance(); DialogueManager.resetInstance(); InventoryManager.resetInstance();
};
const T = TILE_SIZE;

describe('4.3d "Twenty Charges" — the Palace, the Pulse Gun, Malleswaram (ADR-155)', () => {
  beforeEach(reset);

  it('is built (P27) between Cubbon and the stub (Lalbagh)', () => {
    expect(SCENES.act4_palace).toEqual(expect.objectContaining({ status: 'P27', seq: '4.3d' }));
    expect(CARDS.card_walk_palace.then).toEqual({ district: 'palace_grounds', spawn: 'palace_gate', minute: 630 });
    expect(DISTRICTS.cubbon_park.triggers).toContainEqual({ zone: 'run_gate', action: 'card', card: 'card_walk_palace', requiresFlag: 'base_cubbon_done' });
  });

  it('the gun: a key item (never lost, no slot), twenty charges, one beam, the first in line', () => {
    expect(ITEMS.pulse_gun.type).toBe('key_item');
    expect(COMBAT.pulse.charges).toBe(20);
    const clear = () => true;
    expect(pulseTarget([0, 0], 'right', [[3 * T, 0], [2 * T, 2], [-T, 0]], clear)).toBe(1);
    expect(pulseTarget([0, 0], 'right', [[3 * T, 3 * T]], clear)).toBe(-1);
    expect(pulseTarget([0, 0], 'right', [[7 * T, 0]], clear)).toBe(-1);
    expect(pulseTarget([0, 0], 'right', [[3 * T, 0]], () => false)).toBe(-1);
    expect(EVOLVED.pulseChargesMidSprint).toBe(2);
  });

  it('Sathish: tonight, then the gun; refilled only once the calibration is in', () => {
    store().setFlag('base_palace_set', true);
    const dm = DialogueManager.getInstance();
    expect(dm.start('dlg_engineer').nodeId).toBe('start'); dm.end();
    expect(store().flags.engineer_met).toBe(true);
    store().setFlag('pulse_built', true);
    dm.start('dlg_engineer'); dm.choose(0); dm.end();
    expect([inv().has('pulse_gun'), store().counters.pulse_charges]).toEqual([true, 20]);
    store().setCounter('pulse_charges', 4);
    let v = dm.start('dlg_engineer');
    expect(v.choices[0].enabled).toBe(false); dm.end();
    inv().add('calibration_data');
    dm.start('dlg_engineer'); dm.choose(0); dm.end();
    expect([store().flags.pulse_calibrated, store().flags.supply_run_5]).toEqual([true, true]);
    v = dm.start('dlg_engineer'); expect(v.nodeId).toBe('ready'); dm.choose(0); dm.end();
    expect(store().counters.pulse_charges).toBe(20);
  });

  it('the bag shows the charges', () => {
    store().setFlag('act4', true);
    inv().add('pulse_gun');
    expect(getDialogue('bag:', { pulse_charges: 17 }, { inventory: store().inventory, flags: store().flags }).nodes.start.text).toContain('Pulse Gun (17 charges)');
  });

  it('Malleswaram: the drive in the study; Vikram released for a charge, or left at his window', () => {
    expect(LOOT.krishnamurthy_house.items).toEqual({ calibration_data: 1 });
    expect(lane.npcs).toEqual([{ id: 'npc_vikram', spawn: 'vikram_spot', unlessFlag: 'vikram_released' }]);
    store().setCounter('pulse_charges', 20);
    inv().add('pulse_gun');
    const dm = DialogueManager.getInstance();
    dm.start('dlg_vikram'); dm.choose(0); dm.end();
    expect([store().flags.vikram_released, store().counters.pulse_charges]).toEqual([true, 19]);
    reset();
    const v = DialogueManager.getInstance().start('dlg_vikram');
    expect(v.choices[0].enabled).toBe(false);
    DialogueManager.getInstance().choose(1);
    expect(store().flags.vikram_left).toBe(true);
  });

  it('the Palace is a base with a ring of lamps; the gun is built after the first night; the ring fails on the third', () => {
    expect(palace.base).toEqual(expect.objectContaining({ requiresFlag: 'base_palace_set', lampFailsOnNight: 3 }));
    const s = store();
    for (const f of ['act4', 'base_palace_set']) s.setFlag(f, true);
    for (const c of Object.values(STOCK)) s.setCounter(c, 9);
    const cards: string[] = [];
    const offs = [act4Base.attach({ district: palace } as never), sleepEvents.attach({ district: palace, playCard: (id: string) => cards.push(id) } as never)] as Array<() => void>;
    TimeManager.getInstance().sleep();
    expect(store().flags.pulse_built).toBe(true);
    TimeManager.getInstance().sleep(); TimeManager.getInstance().sleep();
    expect([store().flags[lampFailedFlag('palace_grounds')], store().flags.palace_turned, cards]).toEqual([true, true, ['card_palace_dark']]);
    for (const off of offs) off();
  });

  it('the bot walks ground zero and needs no shortcut', () => {
    const steps = WALK.steps as Array<{ do: string; target?: string; pace?: string }>;
    expect(steps.some((s) => s.do === 'unresolved' || s.do === 'set_flag')).toBe(false);
    for (const t of ['zone:house_door', 'zone:vikram_call']) expect(steps.find((s) => s.target === t)?.pace, t).toBe('walk');
  });
});
