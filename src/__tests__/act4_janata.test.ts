import { beforeEach, describe, expect, it } from 'vitest';
import { CARDS, DIALOGUE, DISTRICTS, NEWS, PHONE_APPS, QUESTS, SCENES } from '../data';
import { outcome } from '../systems/cards';
import { MapManager } from '../systems/MapManager';
import { stabilityNow } from '../systems/stabilityNow';
import { setStabilityOverride, grade } from '../systems/stability';
import { useGameStore } from '../store';
import { CORE_BEHAVIOURS } from '../world/behaviours';

const gate = DISTRICTS.hebbal_gate;
const lane = DISTRICTS.indiranagar_lane;

describe('4.0 "Janata" (ADR-148)', () => {
  beforeEach(() => { useGameStore.getState().reset(); setStabilityOverride(null); });

  it('3.5\'s leaving card lands at the gate at 08:30 and starts Act 4', () => {
    const card = CARDS.card_leaving_ward;
    expect(card.then).toEqual({ district: 'hebbal_gate', spawn: 'hospital_steps', minute: 510 });
    expect(outcome(card, {}).set).toEqual(expect.arrayContaining(['act4', 'janata_out']));
    expect(SCENES.act4_janata.status).toBe('P22');
  });

  it('the gate: shut, already a little drained, opens only in Act 4', () => {
    expect(gate.unlock?.flags).toEqual(['act4']);
    useGameStore.getState().setFlag('act4', true);
    expect(grade(stabilityNow('hebbal_gate'))).toBe(1);
    expect(gate.npcs!.map((n) => n.id)).toEqual(['npc_gate_constable', 'npc_slot_shop', 'npc_balcony_watcher']);
  });

  it('the constable checks your slip and ID; "Why five?" gets no answer', () => {
    const d = DIALOGUE.dlg_gate_constable;
    expect(d.nodes.slip.choices![0].effect?.flags).toEqual({ janata_pass_checked: true });
    expect(d.nodes.why.text).toContain('Go home.');
    expect(d.nodes.why.choices).toBeUndefined();
  });

  it('the slot shop: triple price, "Server busy" first, then it goes through', () => {
    const d = DIALOGUE.dlg_slot_shop;
    expect(d.nodes.busy_water.text).toContain('Server busy');
    expect(d.nodes.busy_water.choices![0].effect).toEqual({ wallet: -60, item_add: 'water_bottle', flags: { janata_bought: true } });
    expect(d.nodes.busy_biscuits.choices![0].effect?.wallet).toBe(-90);
  });

  it('the way out waits for the constable, then the walk card lands in Indiranagar at 16:57', () => {
    // Only that morning: 4.3c's run comes back to the gate (ADR-154).
    expect(gate.triggers).toContainEqual({ zone: 'street_end', action: 'card', card: 'card_janata_walk', requiresFlag: 'janata_pass_checked', unlessFlag: 'act4_janata_done' });
    expect(CARDS.card_janata_walk.then).toEqual({ district: 'indiranagar_lane', spawn: 'lane_top', minute: 1017 });
    expect(outcome(CARDS.card_janata_walk, {}).set).toContain('act4_janata_done');
    expect(QUESTS.q_act4_janata.objectives.map((o) => o.target)).toEqual(['janata_out', 'janata_pass_checked', 'janata_bay_seen', 'janata_bought', 'act4_janata_done']);
  });

  it('the phone in Act 4: banners on Maps, Chats, Calls and Reels; the curfew in News; no metro, no rides', () => {
    for (const id of ['maps', 'chats', 'call', 'reels']) expect([PHONE_APPS.find((a) => a.id === id)!.noticeIf].flat()[0]?.flag).toBe('act4');
    expect(NEWS.find((n) => n.id === 'news_lockdown')!.after).toBe('act4');
    const s = useGameStore.getState();
    s.setFlag('metro_open', true); s.setFlag('scooter_owned', true); s.setFlag('act4', true);
    expect(MapManager.getInstance().fastTravel('cubbon_park')).toBeNull();
    expect(MapManager.getInstance().scooterRide('cubbon_park')).toBeNull();
  });
});

describe('4.1 "Five O\'Clock" (ADR-148)', () => {
  beforeEach(() => { useGameStore.getState().reset(); setStabilityOverride(null); });

  it('the clock: balconies at 16:58, plates at 16:59, the khaki shirt at 17:00, everyone in at 17:01', () => {
    expect(lane.behaviours).toContain('clockEvents');
    expect(lane.clockEvents!.map((e) => [e.at, e.set[0]])).toEqual([[1018, 'plates_out'], [1019, 'plates_started'], [1020, 'khaki_breaks'], [1021, 'plates_stopped']]);
    expect(lane.cueLoops![0]).toEqual(expect.objectContaining({ whileFlag: 'plates_started', untilFlag: 'plates_stopped' }));
    expect(lane.npcs!.filter((n) => n.id.startsWith('npc_balcony')).every((n) => n.requiresFlag === 'plates_out' && n.unlessFlag === 'plates_stopped')).toBe(true);
    expect(lane.liveArrivals).toBe(true);
  });

  it('the ritual turns the lane: normal before, "infected" once the plates start', () => {
    useGameStore.getState().setFlag('act4', true);
    expect(grade(stabilityNow('indiranagar_lane'))).toBe(0);
    useGameStore.getState().setFlag('plates_started', true);
    expect(grade(stabilityNow('indiranagar_lane'))).toBe(2);
  });

  it('the khaki shirt comes from behind you, already turning; the others walk to the noise', () => {
    const [khaki, top, bottom] = lane.infected!.packs;
    expect(khaki).toEqual(expect.objectContaining({ sheets: ['npc_auto_driver'], startMode: 'alert', requiresFlag: 'khaki_breaks', awayFrom: 'main_road' }));
    expect(khaki.leadOptions!.length).toBeGreaterThan(1);
    for (const p of [top, bottom]) expect(p).toEqual(expect.objectContaining({ drawnTo: 'plates_point', requiresFlag: 'plates_started' }));
    expect(lane.act4Zones![0].encounterRate).toBe(0);
  });

  it('the main road ends it: the walk card (or, caught, the lane\'s own card) lands at the foot of the hill at 21:30 (4.2)', () => {
    // Only that evening (4.3b walks the lane again, ADR-153).
    expect(lane.triggers).toContainEqual({ zone: 'main_road', action: 'card', card: 'card_walk_east', requiresFlag: 'khaki_breaks', unlessFlag: 'act4_five_done' });
    expect(lane.failCardUntil).toBe('act4_five_done');
    expect(CARDS.card_walk_east.then).toEqual({ district: 'ambedkar_nagar_hill', spawn: 'slope_base', minute: 1290 });
    expect(outcome(CARDS.card_walk_east, {}).set).toEqual(expect.arrayContaining(['first_run_done', 'act4_five_done']));
    expect(lane.failCard).toBe('card_lane_caught');
    expect(CARDS.card_lane_caught.then).toEqual({ district: 'ambedkar_nagar_hill', spawn: 'slope_base', minute: 1290 });
    expect(NEWS.find((n) => n.id === 'news_five')!.after).toBe('plates_out');
  });

  it('every place runs the clock behaviour without listing it only where it has events', () => {
    expect(CORE_BEHAVIOURS).not.toContain('clockEvents');
    expect(Object.values(DISTRICTS).filter((d) => d.clockEvents?.length).map((d) => d.id)).toEqual(['indiranagar_lane']);
  });
});
