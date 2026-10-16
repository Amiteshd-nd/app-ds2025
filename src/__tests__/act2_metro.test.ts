import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { DISTRICTS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { FLAG, MapManager, metroFare } from '../systems/MapManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { STARTING_WALLET } from '../utils/constants';
import { FLAG_METRO_FREE_DAY, FLAG_METRO_OPEN, FLAG_SCOOTER_DECIDED } from '../world/behaviours/metroFlags';
import { metroOpening } from '../world/behaviours/metroOpening';
import { BEHAVIOURS } from '../world/behaviours';

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
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const time = () => TimeManager.getInstance();

describe('the opening (story 2.2 F1, ADR-127)', () => {
  it('opens the line on the first sleep after the scooter decision, free that day, and clears the free day on the next sleep', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    const off = metroOpening.attach({} as never) as () => void;
    time().sleep();
    expect(store().flags[FLAG_METRO_OPEN]).toBeUndefined(); // nothing decided yet
    store().setFlag(FLAG_SCOOTER_DECIDED, true);
    time().sleep();
    expect(store().flags[FLAG_METRO_OPEN]).toBe(true);
    expect(store().flags[FLAG_METRO_FREE_DAY]).toBe(true);
    expect(toasts.some((t) => t.includes('Purple Line'))).toBe(true);
    time().sleep();
    expect(store().flags[FLAG_METRO_OPEN]).toBe(true);
    expect(store().flags[FLAG_METRO_FREE_DAY]).toBe(false);
    off();
  });

  it('is a registered behaviour the flat lists, and the street swaps its props on the flag', () => {
    expect(BEHAVIOURS.metroOpening).toBe(metroOpening);
    expect(DISTRICTS.hill_flat.behaviours).toContain('metroOpening');
    const street = DISTRICTS.whitefield_street;
    const gone = street.objects!.filter((o) => o.unlessFlag === FLAG_METRO_OPEN).map((o) => o.id).sort();
    expect(gone).toEqual(['METRO_BARRICADE', 'METRO_PILLAR']);
    const came = street.objects!.filter((o) => o.requiresFlag === FLAG_METRO_OPEN).map((o) => o.id).sort();
    expect(came).toEqual(['BUNTING', 'CROWD_BARRIER', 'FLAGPOLE', 'MARIGOLD_POTS', 'METRO_ENTRANCE', 'METRO_PILLAR_DONE']);
    expect(street.npcs!.every((n) => n.requiresFlag === FLAG_METRO_OPEN)).toBe(true);
    expect(DISTRICTS.metro_station.unlock).toEqual({ flags: [FLAG_METRO_OPEN] });
  });
});

describe('the concourse challenges (story 2.2 F3/F4)', () => {
  it('the lost kid follows, and either the guard or his mother returns him — the mother for more rep', () => {
    const dm = DialogueManager.getInstance();
    const rep = () => ReputationManager.getInstance().total;
    dm.start('dlg_lost_kid');
    dm.choose(0);
    expect(store().flags.kid_following).toBe(true);
    expect(DISTRICTS.metro_station.companion).toEqual({ npc: 'npc_lost_kid', whileFlag: 'kid_following', untilFlag: 'lost_kid_returned' });
    const before = rep();
    dm.start('dlg_metro_guard'); // enters at the handover while the kid follows
    expect(dm.view()!.text).toContain('Spider-Man');
    expect(store().flags.lost_kid_returned).toBe(true);
    expect(store().flags.kid_following).toBe(false);
    expect(rep()).toBe(before + 1);
    // The other route, from a clean slate: the reunion is worth three.
    useGameStore.getState().reset(); ReputationManager.resetInstance(); DialogueManager.resetInstance();
    const dm2 = DialogueManager.getInstance();
    dm2.start('dlg_lost_kid'); dm2.choose(1);
    const b2 = ReputationManager.getInstance().total;
    dm2.start('dlg_kid_mother');
    expect(dm2.view()!.text).toContain('ADI');
    expect(store().flags.lost_kid_returned).toBe(true);
    expect(ReputationManager.getInstance().total).toBe(b2 + 3);
    // Once returned, the kid is gone from the concourse.
    expect(DISTRICTS.metro_station.npcs!.find((n) => n.id === 'npc_lost_kid')!.unlessFlag).toBe('lost_kid_returned');
  });

  it('the token jam clears by any of three options; lending costs ₹10', () => {
    const dm = DialogueManager.getInstance();
    dm.start('dlg_token_uncle');
    dm.choose(2);
    expect(store().flags.token_jam_fixed).toBe(true);
    expect(store().stats.wallet).toBe(STARTING_WALLET - 10);
    dm.start('dlg_token_uncle');
    expect(dm.view()!.text).toContain('cancel button');
  });
});

describe('the ride (story 2.2b, ADR-127)', () => {
  it('the coach is a 30 s ride on the bus pattern whose door opens only at the end, into Cubbon Park', () => {
    const coach = DISTRICTS.metro_interior;
    expect(coach.behaviours).toContain('busRide');
    expect(coach.ride).toEqual({ seconds: 30, exit: 'coach_door', flag: 'metro_ride_over', label: 'Cubbon Park' });
    const door = coach.exits!.find((e) => e.zone === 'coach_door')!;
    expect(door).toMatchObject({ to: 'cubbon_park', spawn: 'metro_drop', requiresFlag: 'metro_ride_over' });
    expect(DISTRICTS.metro_station.exits!.find((e) => e.zone === 'platform')).toMatchObject({ to: 'metro_interior', transit: 'metro' });
  });

  it("the ajji's seat check: standing earns rep, the phone loses it and adds stress", () => {
    const dm = DialogueManager.getInstance();
    const rep = () => ReputationManager.getInstance().total;
    const r0 = rep(), s0 = store().stats.stress;
    dm.start('dlg_metro_ajji'); dm.choose(0);
    expect(store().flags).toMatchObject({ seat_given: true, seat_decided: true });
    expect(rep()).toBe(r0 + 2);
    useGameStore.getState().reset(); ReputationManager.resetInstance(); DialogueManager.resetInstance(); StatsManager.resetInstance();
    const dm2 = DialogueManager.getInstance();
    dm2.start('dlg_metro_ajji'); dm2.choose(1);
    expect(store().flags).toMatchObject({ seat_kept: true, seat_decided: true });
    expect(ReputationManager.getInstance().total).toBe(r0 - 2);
    expect(store().stats.stress).toBe(s0 + 3);
  });

  it('the quest closes on arrival with the first rung of the metro ladder', () => {
    const q = QUESTS.q_act2_metro_opens;
    expect(q.objectives.filter((o) => !o.optional).map((o) => o.target)).toEqual(['metro_open', 'metro_opening_seen', 'metro_station_entered', 'lost_kid_returned', 'token_jam_fixed', 'first_metro_ride', 'metro_ridden']);
    expect(q.on_complete?.set_flags).toEqual(['act2_metro_done', 'metro_tier_1']);
    expect(DISTRICTS.cubbon_park.triggers!.find((t) => t.zone === 'metro_arrival')!.setFlags).toContain('metro_ridden');
  });
});

describe('Maps after the opening (ADR-115/127)', () => {
  it('offers METRO between Whitefield and Cubbon Park only once open and visited; ₹0 on the free day, the fare after', () => {
    const mm = MapManager.getInstance();
    store().setActiveDistrict('whitefield_street');
    store().setFlag(FLAG.visited('cubbon_park'), true);
    expect(mm.fastTravel('cubbon_park')).toBeNull();
    store().setFlag(FLAG_METRO_OPEN, true);
    store().setFlag(FLAG_METRO_FREE_DAY, true);
    expect(mm.fastTravel('cubbon_park')).toEqual({ fare: 0, station: 'stn_cubbon_park' });
    store().setFlag(FLAG_METRO_FREE_DAY, false);
    const ft = mm.fastTravel('cubbon_park')!;
    expect(ft.fare).toBe(metroFare(0) <= ft.fare ? ft.fare : -1);
    expect(ft.fare).toBeGreaterThanOrEqual(40);
    expect(ft.fare).toBeLessThanOrEqual(60);
    // Interiors never sit on a station: the scooter cannot ride to the concourse, and the concourse is no fast-travel target.
    expect(mm.scooterRide('metro_station')).toBeNull();
    expect(mm.fastTravel('metro_station')).toBeNull();
  });

  it('the two scene components follow each other in story order and are built, not stubs', () => {
    expect(SCENES.act2_metro_opens.status).toBe('P11');
    expect(SCENES.act2_metro_ride.status).toBe('P11');
    expect(SCENES.act2_metro_ride.seq).toBe('2.2b');
    expect(SCENES.act2_metro_ride.district).toBe('metro_interior');
  });
});
