import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CONTACTS, DIALOGUE, DISTRICTS, NOTES, PHOTOS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { RelationshipManager, RELATIONSHIP_LABEL } from '../systems/RelationshipManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { cameraView, noteDetail } from '../ui/phone/viewModel';
import { missingGlyphs } from '../ui/kit/text';
import { BUS_DWELL_S, BUS_EVERY_S, CYCLE_FEE, GUITAR_PRICE, SAVE_VERSION, STARTING_WALLET } from '../utils/constants';
import { busPhase, busTimerText } from '../world/behaviours/busSchedule';
import { rideTimerText } from '../world/behaviours/busRide';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  PhoneManager.resetInstance();
  RelationshipManager.resetInstance();
  DialogueManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const phone = () => PhoneManager.getInstance();

describe('the 500-D on an interval (story 1.5 F2, ADR-123)', () => {
  it('waits a full cycle before the first bus, stands for the dwell, then waits again', () => {
    expect(busPhase(0, BUS_EVERY_S, BUS_DWELL_S)).toEqual({ state: 'waiting', seconds: BUS_EVERY_S - BUS_DWELL_S });
    expect(busPhase(BUS_EVERY_S - BUS_DWELL_S, BUS_EVERY_S, BUS_DWELL_S)).toEqual({ state: 'here', seconds: BUS_DWELL_S });
    expect(busPhase(BUS_EVERY_S - 1, BUS_EVERY_S, BUS_DWELL_S)).toEqual({ state: 'here', seconds: 1 });
    expect(busPhase(BUS_EVERY_S, BUS_EVERY_S, BUS_DWELL_S).state).toBe('waiting');
  });

  it('reads as a clock on the HUD plate', () => {
    expect(busTimerText('500-D', { state: 'waiting', seconds: 72 })).toBe('500-D in 1:12');
    expect(busTimerText('500-D', { state: 'here', seconds: 18 })).toBe('500-D at the stop · 0:18');
    expect(rideTimerText('Cubbon Park', 25)).toBe('Cubbon Park · 0:25');
    expect(rideTimerText('Cubbon Park', -1)).toBe('Cubbon Park · 0:00');
  });

  it('the stop only boards while the bus stands there; the ride ends through a flagged door', () => {
    const street = DISTRICTS.whitefield_street;
    const bus = street.buses![0];
    const boarding = street.exits!.find((e) => e.zone === bus.zone)!;
    expect(boarding.requiresFlag).toBe(bus.flag);
    expect(boarding.to).toBe('bus_interior');
    const interior = DISTRICTS.bus_interior;
    expect(interior.exits!.find((e) => e.zone === interior.ride!.exit)!.requiresFlag).toBe(interior.ride!.flag);
    expect(interior.behaviours).toContain('busRide');
  });
});

describe('City Moments (story 1.6 F1)', () => {
  it('frames the spot you stand in, snaps once, counts the set, and finishes it with a flag', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    expect(cameraView(null, phone().photos()).line).toBe('Nothing worth a photo here.');
    const framed = cameraView('bandstand', phone().photos());
    expect(framed.line).toBe('IN FRAME: THE BANDSTAND');
    expect(framed.canSnap).toBe(true);
    expect(phone().takePhoto('bandstand')).toBe(true);
    expect(phone().takePhoto('bandstand')).toBe(false);
    expect(store().flags.photo_bandstand).toBe(true);
    expect(cameraView('bandstand', phone().photos()).line).toBe('The bandstand · taken');
    expect(toasts.filter((t) => t.startsWith('City Moments'))[0]).toBe('City Moments · The bandstand · 1/5');
    for (const id of ['library', 'bamboo', 'red_building', 'dog']) phone().takePhoto(id);
    expect(store().flags.cubbon_photos_done).toBe(true);
    expect(cameraView(null, phone().photos()).sets).toEqual([{ set: 'cubbon', done: 5, total: 5 }]);
    expect(cameraView(null, phone().photos()).gallery.map((p) => p.id)).toHaveLength(5);
  });

  it('every photo spot in Cubbon Park names a real photo', () => {
    const ids = new Set(PHOTOS.map((p) => p.id));
    for (const spot of DISTRICTS.cubbon_park.photoSpots!) expect(ids.has(spot.photo), spot.photo).toBe(true);
    for (const p of PHOTOS) expect(missingGlyphs(`${p.title} ${p.caption}`), p.id).toEqual([]);
  });
});

describe('Ananya and the relationship system (story 1.6 F2–F3)', () => {
  it('paying her sixty spends through the ledger, opens the relationship at "met"; the walk makes it "warm"', () => {
    const dm = DialogueManager.getInstance();
    dm.start('dlg_ananya');
    dm.choose(0);
    expect(store().stats.wallet).toBe(STARTING_WALLET - CYCLE_FEE);
    expect(store().flags.ananya_paid).toBe(true);
    expect(RelationshipManager.getInstance().get('npc_ananya')).toBe('met');
    expect(phone().contacts().find((c) => c.id === 'ananya')).toBeUndefined(); // no number yet
    dm.choose(0); // "Sure. Here."
    expect(store().flags.ananya_number).toBe(true);
    expect(phone().contacts().find((c) => c.id === 'ananya')!.status).toBe(RELATIONSHIP_LABEL.met);
    dm.choose(0); // Lead the way
    expect(store().flags.ananya_walk).toBe(true);
    dm.end();
    // The three stops, in whatever order the enter-branches pick.
    for (let i = 0; i < 3; i++) { dm.start('dlg_ananya_walk'); dm.end(); }
    expect(store().flags.ananya_walk_done).toBe(true);
    expect(store().flags.photo_ananya_portrait).toBe(true);
    expect(RelationshipManager.getInstance().get('npc_ananya')).toBe('warm');
    expect(phone().photos().find((p) => p.id === 'ananya_portrait')!.taken).toBe(true);
  });

  it('her refund arrives with a chat message, on the UPI ledger under her name', () => {
    phone();
    store().setFlag('ananya_number', true);
    const before = store().stats.wallet;
    store().setFlag('amma_news_called', true);
    expect(store().stats.wallet).toBe(before + CYCLE_FEE);
    expect(store().transactions[store().transactions.length - 1]).toMatchObject({ amount: CYCLE_FEE, label: 'Ananya', reason: 'upi_received' });
  });

  it('relationship states are saved and restored', () => {
    RelationshipManager.getInstance().set('npc_ananya', 'warm');
    const sm = SaveManager.getInstance();
    const mem = new Map<string, Record<string, unknown>>();
    sm.useBackend({ read: async (s) => mem.get(s) ?? null, write: async (s, p) => void mem.set(s, p), remove: async (s) => void mem.delete(s) });
    sm.save({ districtId: 'cubbon_park', x: 1, y: 1 });
    useGameStore.getState().reset();
    expect(sm.restore()).toBe(true);
    expect(store().relationships.npc_ananya).toBe('warm');
    expect(sm.load()!.version).toBe(SAVE_VERSION);
  });

  it('a 1.6.0 save without relationships migrates to an empty map', () => {
    const sm = SaveManager.getInstance();
    const old = { ...JSON.parse(JSON.stringify((() => { sm.save(); return (sm as unknown as { cache: Map<string, unknown> }).cache.get('autosave'); })())), version: '1.6.0' } as Record<string, unknown>;
    delete old.relationships;
    const mem = new Map<string, Record<string, unknown>>([['autosave', old]]);
    SaveManager.resetInstance();
    const fresh = SaveManager.getInstance();
    fresh.useBackend({ read: async (s) => mem.get(s) ?? null, write: async () => {}, remove: async () => {} });
    return fresh.init().then(() => {
      const data = fresh.load();
      expect(data!.version).toBe(SAVE_VERSION);
      expect(data!.relationships).toEqual({});
    });
  });
});

describe('the guitar (story 1.6 F4) and the Act 1 close', () => {
  it('cannot be bought today; the Notes app shows how far the wallet is from it', () => {
    expect(phone().notes()).toEqual([]);
    const dm = DialogueManager.getInstance();
    dm.start('dlg_guitar_shop');
    dm.choose(0); // I'll take it → booked till Tuesday
    expect(store().flags.guitar_wishlisted).toBe(true);
    expect(store().stats.wallet).toBe(STARTING_WALLET);
    const [note] = phone().notes();
    expect(note.price).toBe(GUITAR_PRICE);
    expect(noteDetail(note.price, note.toGo)).toBe('₹6,500 · you can afford it');
    StatsManager.getInstance().spend(STARTING_WALLET - 1000, 'test');
    expect(noteDetail(GUITAR_PRICE, phone().notes()[0].toGo)).toBe('₹6,500 · ₹5,500 to go');
    for (const n of NOTES) expect(missingGlyphs(n.text), n.id).toEqual([]);
    for (const c of CONTACTS) expect(missingGlyphs(`${c.name} ${c.note ?? ''}`), c.id).toEqual([]);
  });

  it('1.5 → 1.6 → Act 2: the bus quest completes on arrival, the park quest ends on the last sleep and opens the Dating app', () => {
    const qm = QuestManager.getInstance();
    store().setQuests({ active: {}, completed: ['q_act0_arrival', 'q_act0_pg_hunt', 'q_act1_first_day', 'q_act1_pg_exit', 'q_act1_hill_flat'] });
    expect(qm.start('q_act1_bus_cubbon')).toBe(true);
    expect(qm.start('q_act1_cubbon')).toBe(false); // waits for the bus quest
    store().setFlag('metro_seen', true);
    store().setFlag('on_bus_500d', true);
    store().setFlag('cubbon_arrived', true);
    expect(qm.isCompleted('q_act1_bus_cubbon')).toBe(true);
    expect(qm.start('q_act1_cubbon')).toBe(true);
    for (const f of ['cubbon_photos_done', 'ananya_paid', 'ananya_number', 'amma_news_called']) store().setFlag(f, true);
    expect(qm.isCompleted('q_act1_cubbon')).toBe(false);
    store().setFlag('act1_done', true);
    expect(qm.isCompleted('q_act1_cubbon')).toBe(true);
    expect(store().flags.act2_started).toBe(true);
    expect(SCENES.act1_cubbon.seq).toBe('1.6');
    expect(QUESTS.q_act1_cubbon.on_complete!.set_flags).toContain('act2_started');
  });

  it('the new lines are drawable', () => {
    for (const id of ['dlg_metro_sign', 'dlg_bus_nurse', 'dlg_bus_uncle', 'dlg_bus_kid', 'dlg_cycle_guy', 'dlg_ananya', 'dlg_ananya_walk', 'dlg_icecream', 'dlg_jogger', 'dlg_guitar_shop', 'dlg_amma_news']) {
      for (const node of Object.values(DIALOGUE[id].nodes)) {
        expect(missingGlyphs(node.text), `${id} text`).toEqual([]);
        for (const c of node.choices ?? []) expect(missingGlyphs(c.text), `${id} choice`).toEqual([]);
      }
    }
  });
});
