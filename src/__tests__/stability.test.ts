import { beforeEach, describe, expect, it } from 'vitest';
import { DISTRICTS } from '../data';
import { bandFor, musicState } from '../audio/mix';
import { useGameStore } from '../store';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { SURVIVAL, tuningFor } from '../systems/survival';
import { ACT4_DAY, ACT4_FLAG, CURVE, GRADES, act4Curve, act4DayOf, act4DefOf, grade, setStabilityOverride, stabilityFor, stageFor } from '../systems/stability';
import { stabilityNow } from '../systems/stabilityNow';
import { BEHAVIOUR_NAMES } from '../world/behaviours/names';
import { CORE_BEHAVIOURS } from '../world/behaviours';

const resolve = (id: string) => DISTRICTS[id];

describe('grade(): one dial (ADR-144, act4 doc §2)', () => {
  it('levels at 80 / 60 / 40 / 20, inclusive at the lower bound', () => {
    expect([100, 80, 79, 60, 59, 40, 39, 20, 19, 0].map(grade)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('every level drains more, never less: colour, people, encounters', () => {
    for (let i = 1; i < GRADES.length; i++) {
      expect(GRADES[i].desat).toBeGreaterThan(GRADES[i - 1].desat);
      expect(GRADES[i].people).toBeLessThanOrEqual(GRADES[i - 1].people);
      expect(GRADES[i].encounterRate).toBeGreaterThan(GRADES[i - 1].encounterRate);
    }
    expect(GRADES[0]).toMatchObject({ desat: 0, fog: 0, vignette: 0, people: 1, encounterRate: 0 });
  });

  it('the audio band IS the grade: L0 normal · L1 warning · L2 infected · L3–4 deep', () => {
    for (let s = 0; s <= 100; s++) expect(bandFor(s)).toBe(GRADES[grade(s)].band);
    expect([90, 70, 50, 30, 10].map(bandFor)).toEqual(['normal', 'warning', 'infected', 'deep', 'deep']);
  });

  it('the music drones from level 1', () => {
    const ctx = { districtId: null, transit: null, workday: false, minute: 720, pacing: null, chaseActive: false, reliefMs: 0, nearestInfected: null, stress: 0 };
    expect(musicState({ ...ctx, stability: 80 })).toBe('normal');
    expect(musicState({ ...ctx, stability: 79 })).toBe('drone');
  });
});

describe('the fall curve (plan §3.1)', () => {
  it('drifts before the fall, never below "warning"; drops on the day; sinks to its floor', () => {
    const def = { fallDay: 6 };
    expect(act4Curve(def, 0)).toBe(CURVE.start);
    expect(act4Curve(def, 5)).toBe(CURVE.start - 5 * CURVE.drift);
    expect(act4Curve({ fallDay: 40 }, 39)).toBe(CURVE.standing);
    expect(act4Curve(def, 6)).toBe(CURVE.onFall);
    expect(act4Curve(def, 7)).toBe(CURVE.onFall - CURVE.perDay);
    expect(act4Curve(def, 30)).toBe(CURVE.floor);
    expect(act4Curve({ fallDay: 0, floor: 10 }, 30)).toBe(10);
  });

  it('the pockets fall in the locked order: Hebbal first, Whitefield and the hill last', () => {
    const day = (id: string) => DISTRICTS[id].act4!.fallDay;
    expect(day('ward4')).toBe(0);
    expect(day('ward4')).toBeLessThan(day('airport'));
    expect(day('airport')).toBeLessThan(day('hyggeland'));
    expect(day('hyggeland')).toBeLessThan(day('majestic_interchange'));
    expect(day('majestic_interchange')).toBeLessThan(day('cubbon_park'));
    expect(day('cubbon_park')).toBeLessThan(day('whitefield_street'));
    expect(day('whitefield_street')).toBeLessThanOrEqual(day('ambedkar_nagar_hill'));
    // Hebbal is ground zero: it sinks below 20.
    expect(grade(act4Curve(DISTRICTS.ward4.act4!, 30))).toBe(4);
  });

  it('an interior falls with its pocket; the corridor (a flashback) never falls', () => {
    expect(act4DefOf(DISTRICTS.hill_flat, resolve)).toBe(DISTRICTS.ambedkar_nagar_hill.act4);
    expect(act4DefOf(DISTRICTS.guitar_shop, resolve)).toBe(DISTRICTS.church_street.act4);
    expect(act4DefOf(DISTRICTS.hivr_corridor, resolve)).toBeUndefined();
  });

  it('100 before Act 4; story flags win over the curve', () => {
    expect(stabilityFor(DISTRICTS.cubbon_park, {}, null, resolve)).toBe(100);
    expect(stabilityFor(DISTRICTS.cubbon_park, {}, 8, resolve)).toBe(CURVE.onFall);
    expect(stabilityFor(DISTRICTS.ward4, { wn_curfew: true }, 20, resolve)).toBe(85);
  });

  it('the ward still sounds the way 3.4 was built: normal, then warning, warning', () => {
    const at = (flags: Record<string, boolean>) => bandFor(stabilityFor(DISTRICTS.ward4, flags, null, resolve));
    expect([at({}), at({ wn_curfew: true }), at({ wn_curfew: true, wn_amma: true }), at({ wn_curfew: true, wn_amma: true, ravi_gone: true })])
      .toEqual(['normal', 'normal', 'warning', 'warning']);
  });

  it('infected stage by days since the fall: Fresh 0–2 · Degraded 3–6 · Evolved 7+', () => {
    expect([0, 2, 3, 6, 7, 20].map(stageFor)).toEqual(['fresh', 'fresh', 'degraded', 'degraded', 'evolved', 'evolved']);
  });
});

describe('the dial in the game', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    setStabilityOverride(null);
    TimeManager.resetInstance();
    StatsManager.resetInstance();
  });

  it('Act 4 counts its own days: one per night slept once it has begun', () => {
    const s = () => useGameStore.getState();
    TimeManager.getInstance().sleep();
    expect(act4DayOf(s())).toBeNull();
    s().setFlag(ACT4_FLAG, true);
    expect(act4DayOf(s())).toBe(0);
    TimeManager.getInstance().sleep();
    TimeManager.getInstance().sleep();
    expect(s().counters[ACT4_DAY]).toBe(2);
  });

  it('stabilityNow reads the store, and the Playground override beats everything', () => {
    const s = useGameStore.getState();
    s.setFlag(ACT4_FLAG, true);
    s.setCounter(ACT4_DAY, 9);
    expect(stabilityNow('cubbon_park')).toBe(CURVE.onFall - CURVE.perDay);
    setStabilityOverride(15);
    expect(stabilityNow('cubbon_park')).toBe(15);
  });

  it('every place wears its grade without listing it', () => {
    expect(CORE_BEHAVIOURS).toContain('stabilityLook');
    expect(BEHAVIOUR_NAMES).toContain('stabilityLook');
  });
});

describe('survival: gentle, then harsh (ADR-16, profile §3)', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    TimeManager.resetInstance();
    StatsManager.resetInstance();
  });

  it('the table switches with Act 4', () => {
    expect(tuningFor({})).toBe(SURVIVAL.gentle);
    expect(tuningFor({ [ACT4_FLAG]: true })).toBe(SURVIVAL.harsh);
    expect(SURVIVAL.harsh.foodMinutesPerPoint).toBeLessThan(SURVIVAL.gentle.foodMinutesPerPoint);
    expect(SURVIVAL.harsh.sleepHealth).toBeLessThan(SURVIVAL.gentle.sleepHealth);
  });

  it('Acts 0–3: an empty stomach slows you but never costs health', () => {
    const s = () => useGameStore.getState();
    StatsManager.getInstance().adjust('food', -100);
    TimeManager.getInstance().advance(60);
    expect(s().stats.health).toBe(100);
  });

  it('Act 4: starving costs half a health point a minute; sleep gives 15 and no free food', () => {
    const s = () => useGameStore.getState();
    s().setFlag(ACT4_FLAG, true);
    StatsManager.getInstance().adjust('food', -100);
    TimeManager.getInstance().advance(60);
    expect(s().stats.health).toBe(70);
    TimeManager.getInstance().sleep();
    expect(s().stats.health).toBe(85);
    expect(s().stats.food).toBe(0);
  });

  it('Act 4: food drains faster', () => {
    const s = () => useGameStore.getState();
    TimeManager.getInstance().advance(60);
    const gentle = 100 - s().stats.food;
    s().reset(); TimeManager.resetInstance();
    s().setFlag(ACT4_FLAG, true);
    TimeManager.getInstance().advance(60);
    expect(100 - s().stats.food).toBeGreaterThan(gentle);
  });
});
