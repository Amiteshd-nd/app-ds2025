import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CHATS, DIALOGUE, DISTRICTS, QUESTS, SCENES } from '../data';
import { CARRY_COMFORT, CARRY_COUNTER, CARRY_LIMIT, FLAG_CARRY_OVERLOADED, carried, carry, carryText } from '../systems/carry';
import { DialogueManager } from '../systems/DialogueManager';
import { MapManager } from '../systems/MapManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { BEHAVIOURS } from '../world/behaviours';
import { sleepEvents } from '../world/behaviours/sleepEvents';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  ReputationManager.resetInstance();
  MapManager.resetInstance();
  DialogueManager.resetInstance();
  PhoneManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
/** Sameer's earlier messages arrive first (chats deliver in order). */
const sameerSoFar = () => { for (const m of CHATS.sameer.messages) if (m.after && !m.id.startsWith('sameer_ikea')) store().setFlag(m.after, true); };
const dm = () => DialogueManager.getInstance();
const pick = (text: string) => {
  const v = dm().view();
  const i = v.choices.findIndex((c) => c.text.startsWith(text));
  if (i < 0) throw new Error(`no choice "${text}" in ${v.choices.map((c) => c.text).join(' | ')}`);
  return i;
};

describe('the carry limit (story 2.4, ADR-132)', () => {
  it('counts box slots, flags the fourth, and drops them all at once', () => {
    carry(2);
    expect(carried()).toBe(2);
    expect(carryText()).toBe(`BOXES 2/${CARRY_COMFORT}`);
    carry(2);
    expect(carried()).toBe(4);
    expect(store().flags[FLAG_CARRY_OVERLOADED]).toBe(true);
    carry(0, true);
    expect(store().counters[CARRY_COUNTER]).toBe(0);
    expect(store().flags[FLAG_CARRY_OVERLOADED]).toBe(false);
    expect(carryText()).toBeNull();
  });

  it('the aisle: a box is paid as you scan it, a box in the trolley is locked, past the limit is "Not enough space"', () => {
    const before = store().stats.wallet;
    dm().start('dlg_hygge_aisle');
    expect(dm().view().choices.find((c) => c.text.startsWith("That's enough"))).toMatchObject({ enabled: false, lockedReason: 'Your trolley is empty' });
    dm().choose(pick('Kitchen table'));
    dm().advance(); // back to the racks
    expect(store().flags.ikea_bought_table).toBe(true);
    expect(store().stats.wallet).toBe(before - 4999);
    expect(carried()).toBe(2);
    expect(dm().view().choices.find((c) => c.text.startsWith('Kitchen table'))).toMatchObject({ enabled: false, lockedReason: 'In your trolley' });
    dm().choose(pick('Bookshelf'));
    dm().advance();
    expect(carried()).toBe(CARRY_LIMIT);
    expect(dm().view().choices.find((c) => c.text.startsWith('Floor lamp'))).toMatchObject({ enabled: false, lockedReason: 'Not enough space' });
    expect(() => dm().choose(pick('Floor lamp'))).toThrow(/locked/);
    dm().choose(pick("That's enough"));
    expect(dm().view().nodeId).toBe('done');
  });

  it('the hill bus charges ₹10 a box; the scooter will not take flat-pack', () => {
    expect(DISTRICTS.whitefield_street.exits?.find((e) => e.zone === 'hill_bus')).toMatchObject({ fare: 20, farePerBox: 10 });
    store().setFlag('scooter_owned', true);
    store().setFlag('visited:cubbon_park', true);
    store().setActiveDistrict('whitefield_street');
    store().setCounter('fuel', 100);
    expect(MapManager.getInstance().scooterRide('cubbon_park')).not.toBeNull();
    carry(1);
    expect(MapManager.getInstance().scooterRide('cubbon_park')).toBeNull();
  });
});

describe('the trip', () => {
  it('the first sleep after the guitar plans the trip (sleepEvents, data on the flat)', () => {
    const flat = DISTRICTS.hill_flat;
    expect(flat.behaviours).toContain('sleepEvents');
    expect(BEHAVIOURS.sleepEvents).toBe(sleepEvents);
    const off = sleepEvents.attach({ district: flat } as never) as () => void;
    TimeManager.getInstance().sleep();
    expect(store().flags.ikea_planned).toBeUndefined();
    store().setFlag('act2_guitar_done', true);
    TimeManager.getInstance().sleep();
    expect(store().flags.ikea_planned).toBe(true);
    off();
    sameerSoFar();
    PhoneManager.getInstance().deliver({ quiet: true });
    expect(store().phone.delivered).toEqual(expect.arrayContaining(['sameer_ikea_1', 'sameer_ikea_2']));
  });

  it('Majestic is known from the plan and opens with metro_tier_1; the store is reached through it', () => {
    expect(DISTRICTS.majestic_interchange).toMatchObject({ knownIf: 'ikea_planned', unlock: { flags: ['metro_tier_1'] }, metroStation: 'stn_majestic' });
    store().setActiveDistrict('cubbon_park');
    store().setFlag('metro_open', true);
    expect(MapManager.getInstance().fastTravel('majestic_interchange')).toBeNull();
    store().setFlag('ikea_planned', true);
    expect(MapManager.getInstance().fastTravel('majestic_interchange')?.station).toBe('stn_majestic');
    expect(MapManager.getInstance().fastTravel('hyggeland')).toBeNull(); // not before the first visit
    expect(DISTRICTS.green_coach.exits?.[0]).toMatchObject({ to: 'hyggeland', requiresFlag: 'green_ride_over' });
    expect(DISTRICTS.green_coach_home.unlock).toEqual({ flags: ['ikea_paid'] });
  });

  it('the tills need a box; the aunty beat has a four-box version', () => {
    dm().start('dlg_hygge_cashier');
    expect(dm().view().nodeId).toBe('start');
    dm().end();
    store().setFlag('ikea_boxed', true);
    dm().start('dlg_hygge_cashier');
    expect(dm().view().nodeId).toBe('checkout');
    dm().end();
    store().setFlag(FLAG_CARRY_OVERLOADED, true);
    dm().start('dlg_aunty_boxes');
    expect(dm().view().nodeId).toBe('overloaded');
  });

  it('assembly: the bought pieces appear by flag, the table always folds, the boxes go', () => {
    const flat = DISTRICTS.hill_flat;
    expect(flat.objects).toContainEqual({ id: 'BOOKSHELF', at: 'shelf_spot', requiresFlags: ['ikea_bought_shelf', 'ikea_assembled'] });
    expect(flat.objects).toContainEqual({ id: 'FOLDED_TABLE', at: 'folded_spot', requiresFlag: 'table_folded' });
    store().setFlag('ikea_bought_table', true);
    carry(2);
    dm().start('dlg_ikea_assembly');
    expect(dm().view().nodeId).toBe('start_table');
    dm().advance();
    dm().choose(pick('Panel first'));
    dm().advance(); // back to step 2
    dm().choose(pick('Dowel first'));
    expect(store().flags.ikea_assembled).toBe(true);
    expect(store().flags.table_folded).toBe(true);
    expect(carried()).toBe(0);
  });

  it('Sameer pays back ₹699 only for a shoe rack', () => {
    sameerSoFar();
    for (const f of ['ikea_planned', 'ikea_assembled']) store().setFlag(f, true);
    PhoneManager.getInstance().deliver({ quiet: true });
    expect(store().phone.delivered).toContain('sameer_ikea_3');
    expect(store().phone.delivered).not.toContain('sameer_ikea_4');
    const before = store().stats.wallet;
    store().setFlag('ikea_bought_shoerack', true);
    PhoneManager.getInstance().deliver({ quiet: true });
    expect(store().stats.wallet).toBe(before + 699);
  });

  it('the scene is built and the quest follows the guitar', () => {
    expect(SCENES.act2_ikea.status).toBe('P13');
    expect(QUESTS.q_act2_ikea.prerequisite_quests).toEqual(['q_act2_guitar']);
    expect(DIALOGUE.dlg_majestic_uncle_thanks.nodes.start.effect?.reputation).toBe(1);
  });
});
