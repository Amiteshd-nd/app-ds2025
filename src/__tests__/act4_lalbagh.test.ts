import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, QUESTS, SCENES } from '../data';
import { panelsFor } from '../systems/cards';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { STOCK } from '../systems/trade';
import { useGameStore } from '../store';
import { act4Base, lampFailedFlag } from '../world/behaviours/act4Base';
import { sleepEvents } from '../world/behaviours/sleepEvents';
import WALK from '../data/walkthroughs/act4_lalbagh.json';

const house = DISTRICTS.glass_house;
const store = () => useGameStore.getState();
const reset = () => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear(); store().reset(); TimeManager.resetInstance(); StatsManager.resetInstance(); DialogueManager.resetInstance(); InventoryManager.resetInstance();
};

describe('4.3e "The Glass House" — the last base and the table (ADR-156)', () => {
  beforeEach(reset);

  it('is built (P28); every base of the chain is now its own scene, and 4.5 / 4.6 start from here', () => {
    expect(SCENES.act4_lalbagh).toEqual(expect.objectContaining({ status: 'P28', seq: '4.3e' }));
    expect(SCENES.act4_ravi.entry!.from).toBe('act4_lalbagh');
    expect(SCENES.act4_tunnel.entry!.after).toContain('base_lalbagh_set');
    expect(QUESTS.q_act4_lalbagh.on_complete!.set_flags).toContain('base_chain_done');
    expect(panelsFor(CARDS.card_walk_lalbagh, {}).flatMap((p) => p.setFlags ?? [])).toContain('base_lalbagh_set');
    expect(DISTRICTS.palace_grounds.triggers).toContainEqual({ zone: 'palace_run_gate', action: 'card', card: 'card_walk_lalbagh', requiresFlag: 'base_palace_done' });
  });

  it('the glass house is a base whose lamp never fails; the first night calls the table', () => {
    expect(house.base!.lampFailsOnNight).toBeUndefined();
    const s = store();
    for (const f of ['act4', 'base_lalbagh_set']) s.setFlag(f, true);
    for (const c of Object.values(STOCK)) s.setCounter(c, 9);
    const offs = [act4Base.attach({ district: house } as never), sleepEvents.attach({ district: house, playCard: () => {} } as never)] as Array<() => void>;
    for (let i = 0; i < 6; i++) TimeManager.getInstance().sleep();
    expect([store().flags.council_called, store().flags[lampFailedFlag('glass_house')]]).toEqual([true, undefined]);
    for (const off of offs) off();
  });

  it('the table: out, end it, or hold — one path, and the decision is yours', () => {
    for (const [i, path] of [[0, 'path_evacuate'], [1, 'path_fight'], [2, 'path_hold']] as const) {
      reset();
      const dm = DialogueManager.getInstance();
      let v = dm.start('dlg_council');
      while (v.canAdvance) v = dm.advance();
      expect(v.choices.map((c) => c.text)).toEqual(['We get out.', 'We end it.', 'We hold here.']);
      dm.choose(i); dm.end();
      expect([store().flags[path], store().flags.ending_chosen]).toEqual([true, true]);
    }
    expect(house.triggers).toContainEqual({ zone: 'council', dialogue: 'dlg_council', requiresFlag: 'council_called', unlessFlag: 'ending_chosen' });
  });

  it('everyone you kept is here — the saved ones only if you saved them; Ananya unless strained', () => {
    const refs = Object.fromEntries(house.npcs!.map((n) => [n.id, n]));
    expect([refs.npc_deepa.requiresFlag, refs.npc_kumar.requiresFlag, refs.npc_raju_cafe.requiresFlag]).toEqual(['deepa_medicine', 'kumar_saved', 'raju_saved']);
    expect(refs.npc_ananya_camp.unlessFlag).toBe('ananya_strained');
    for (const n of DISTRICTS.palace_grounds.npcs!) expect([n.unlessFlag].flat()).toContain('base_lalbagh_set');
  });

  it('the bot plays it without a shortcut', () => {
    expect((WALK.steps as Array<{ do: string }>).some((s) => s.do === 'unresolved' || s.do === 'set_flag')).toBe(false);
  });
});
