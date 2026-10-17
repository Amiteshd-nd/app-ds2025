import { beforeEach, describe, expect, it } from 'vitest';
import { CARDS, DIALOGUE, DISTRICTS, PHONE_APPS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { STOCK } from '../systems/trade';
import { useGameStore } from '../store';
import { baseActive } from '../world/behaviours/act4Base';

const hill = DISTRICTS.ambedkar_nagar_hill;
const flat = DISTRICTS.hill_flat;
const reset = () => { useGameStore.getState().reset(); DialogueManager.resetInstance(); InventoryManager.resetInstance(); StatsManager.resetInstance(); };

describe('4.2 "The Hill" (ADR-150)', () => {
  beforeEach(reset);

  it('4.1 lands at the foot of the hill at 21:30; the scene is built', () => {
    expect(CARDS.card_walk_east.then).toEqual({ district: 'ambedkar_nagar_hill', spawn: 'slope_base', minute: 1290 });
    expect(SCENES.act4_the_hill.status).toBe('P23');
    expect(QUESTS.q_act4_the_hill.objectives.map((o) => o.target)).toEqual(['hill_climbed', 'met_suresh', 'upi_dead', 'flat_found', 'hill_base_set', 'hill_first_night']);
  });

  it('the hill in Act 4: aunty, Rafiq, the kid and the broker gone; Suresh, Karthik and Manju\'s table instead; nothing runs', () => {
    const gone = hill.npcs!.filter((n) => n.unlessFlag === 'act4').map((n) => n.id).sort();
    expect(gone).toEqual(['npc_furniture_rafiq', 'npc_hill_kid', 'npc_manju', 'npc_owner_aunty']);
    expect(hill.npcs!.filter((n) => n.requiresFlag === 'act4').map((n) => n.id)).toEqual(expect.arrayContaining(['npc_suresh', 'npc_karthik', 'npc_manju_act4']));
    expect(hill.liveArrivals).toBe(true);
    // Only the walk to your room is left; the bus and the auto on the road don't run in Act 4 (Exits).
    expect(hill.exits!.filter((e) => e.transit === 'walk').map((e) => e.to)).toEqual(['hill_flat']);
  });

  it('the purple light at the top: lit in Act 4, and once Suresh has the base, only while there is fuel', () => {
    expect(hill.uv).toEqual([{ at: [23, 3], radius: 3, requiresFlag: 'act4', fuelAfter: 'met_suresh' }]);
  });

  it('two of them on the lower path, standing still; Mani tells you to crawl', () => {
    const pair = hill.infected!.packs[0];
    expect(pair).toEqual(expect.objectContaining({ size: 2, startMode: 'idle', minLevel: 0, requiresFlag: 'act4' }));
    expect(DIALOGUE.dlg_hill_chai.enter![0]).toEqual({ flag: 'act4', node: 'act4' });
    expect(DIALOGUE.dlg_hill_chai.nodes.act4.text).toContain('Crawl');
  });

  it('Suresh: aunty "went to the temple on Tuesday"; his water and rice start the stock', () => {
    const dm = DialogueManager.getInstance();
    dm.start('dlg_suresh');
    dm.choose(0);
    dm.advance();
    dm.choose(0);
    const s = useGameStore.getState();
    expect(s.flags.met_suresh).toBe(true);
    expect([s.counters[STOCK.food], s.counters[STOCK.water], s.counters[STOCK.fuel]]).toEqual([2, 2, 1]);
    expect(DIALOGUE.dlg_suresh.nodes.aunty.text).toContain('temple on Tuesday');
  });

  it('UPI dies at Manju\'s table, then he trades', () => {
    expect(DIALOGUE.dlg_manju_act4.nodes.start.choices![0].effect?.flags).toEqual({ upi_dead: true });
    expect(hill.npcs!.find((n) => n.id === 'npc_manju_trade')!.requiresFlag).toBe('upi_dead');
    const upi = [PHONE_APPS.find((a) => a.id === 'upi')!.noticeIf].flat();
    expect(upi.map((n) => n!.flag)).toEqual(['wn_server_busy', 'upi_dead']);
  });

  it('the flat: ransacked; the table makes it a base; containers; the first night', () => {
    expect(flat.objects!.filter((o) => o.requiresFlag === 'act4').map((o) => o.id)).toEqual(['RANSACK_HEAP', 'CHAIR_FALLEN']);
    expect(flat.base).toEqual({ spawn: 'door', uv: [], requiresFlag: 'hill_base_set', lampFailsOnNight: 4 });
    expect(baseActive(flat, { act4: true })).toBe(false);
    expect(baseActive(flat, { act4: true, hill_base_set: true })).toBe(true);
    const z = (zone: string) => flat.triggers!.filter((t) => t.zone === zone).map((t) => t.dialogue);
    expect(z('bench_zone')).toEqual(['dlg_hill_table', 'craft:bench']);
    // The bench works from the first morning: tonight you only unfold it.
    expect(flat.triggers!.find((t) => t.dialogue === 'craft:bench')!.requiresFlag).toBe('hill_first_night');
    expect(z('stock_zone')).toEqual(['base:hill_flat']);
    expect(flat.sleepEvents![flat.sleepEvents!.length - 1]).toEqual(expect.objectContaining({ after: 'hill_base_set', set: ['hill_first_night'] }));
  });
});
