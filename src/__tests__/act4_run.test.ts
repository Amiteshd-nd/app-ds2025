import { describe, expect, it } from 'vitest';
import { ENERGY, energy, resetEnergy, tickEnergy, type EnergyState } from '../systems/energy';
import { INFECTED, brain, detectRadius, detects, hears, struck, think, type Senses } from '../systems/infected';
import { FAIL_FORWARD, HARM, hitKind, itemsLost } from '../systems/harm';
import { ENCOUNTER, ambushSize, pickCover, rolls } from '../systems/encounters';
import { noiseFloor, playerState, resetPlayerState } from '../systems/playerState';
import { mulberry32, seedOf } from '../systems/rng';
import { PLAYER_RUN_SPEED, PLAYER_SPEED, TILE_SIZE } from '../utils/constants';

const T = TILE_SIZE;

describe('energy (ADR-32/145)', () => {
  const fresh = (max = 3): EnergyState => { const e = { ...energy }; resetEnergy(max, e); return e; };

  it('a pip every 2 s of running; empty forces a 3 s walk; refills a pip every 3 s', () => {
    const e = fresh(3);
    expect(tickEnergy(1999, true, 3, e)).toBe(true);
    expect(e.pips).toBe(3);
    tickEnergy(1, true, 3, e);
    expect(e.pips).toBe(2);
    tickEnergy(ENERGY.drainMs * 2, true, 3, e);
    expect(e.pips).toBe(0);
    expect(e.exhausted).toBe(ENERGY.exhaustedMs);
    expect(tickEnergy(100, true, 3, e)).toBe(false);
    tickEnergy(ENERGY.exhaustedMs, false, 3, e);
    tickEnergy(ENERGY.refillMs, false, 3, e);
    expect(e.pips).toBe(1);
  });

  it('more stamina = more pips (the gym pays off)', () => {
    const e = fresh(3);
    tickEnergy(16, false, 8, e);
    expect(e.max).toBe(8);
    expect(e.pips).toBe(8);
  });
});

describe('noise floor from what you do (ADR-49)', () => {
  it('still 0 · crouch 2 · walk 5 · run 8 · hidden 0', () => {
    resetPlayerState();
    const at = (mode: typeof playerState.mode, hidden = false) => { playerState.mode = mode; playerState.hidden = hidden; return noiseFloor(); };
    expect([at('idle'), at('crouch'), at('walk'), at('run'), at('run', true)]).toEqual([0, 2, 5, 8, 0]);
    resetPlayerState();
  });
});

describe('the infected (ADR-31/49, plan §3.3)', () => {
  const senses = (over: Partial<Senses> = {}): Senses => ({ dt: 16, sees: false, player: [0, 0], heard: null, packAlert: false, atTarget: false, night: false, ...over });
  const rng = mulberry32(1);
  const stroll = (): [number, number] => [100, 100];

  it('speeds: wander 0.4× walk, chase 0.9× run — you can outrun them, barely', () => {
    expect(INFECTED.wanderSpeed).toBeCloseTo(0.4 * PLAYER_SPEED);
    expect(INFECTED.chaseSpeed).toBeLessThan(PLAYER_RUN_SPEED);
    expect(INFECTED.chaseSpeed).toBeGreaterThan(PLAYER_SPEED);
  });

  it('detection = your noise in tiles (never under 2), +2 at night; hidden or in UV = unseen', () => {
    expect(detectRadius(0, false)).toBe(2 * T);
    expect(detectRadius(5, false)).toBe(5 * T);
    expect(detectRadius(8, true)).toBe(10 * T);
    expect(detects(4 * T, 5, false, true, false, false)).toBe(true);
    expect(detects(6 * T, 5, false, true, false, false)).toBe(false);
    expect(detects(1 * T, 8, false, false, false, false)).toBe(false);
    expect(detects(1 * T, 8, false, true, true, false)).toBe(false);
    expect(detects(1 * T, 8, false, true, false, true)).toBe(false);
    expect(hears(7 * T, 8, false, false)).toBe(true);
    expect(hears(7 * T, 5, false, false)).toBe(false);
  });

  it('wander → alert (0.5 s growl) → chase → loses sight at your last spot → search 3 s → wander', () => {
    const b = brain('wander');
    let i = think(b, senses({ sees: true, player: [50, 50] }), rng, stroll);
    expect(b.mode).toBe('alert');
    expect(i.growled).toBe(true);
    expect(i.speed).toBe(0);
    think(b, senses({ dt: INFECTED.growlMs, sees: true, player: [60, 60] }), rng, stroll);
    expect(b.mode).toBe('chase');
    i = think(b, senses({ sees: true, player: [70, 70] }), rng, stroll);
    expect(i.target).toEqual([70, 70]);
    expect(i.speed).toBe(INFECTED.chaseSpeed);
    i = think(b, senses({ sees: false, player: [200, 200] }), rng, stroll);
    expect(i.target).toEqual([70, 70]);
    think(b, senses({ sees: false, atTarget: true }), rng, stroll);
    expect(b.mode).toBe('search');
    think(b, senses({ dt: INFECTED.searchMs }), rng, stroll);
    expect(b.mode).toBe('wander');
  });

  it('a chase gives up after 8 s even in sight; night makes it faster', () => {
    const b = brain('wander');
    think(b, senses({ sees: true }), rng, stroll);
    think(b, senses({ dt: INFECTED.growlMs, sees: true }), rng, stroll);
    const fast = think(b, senses({ sees: true, night: true }), rng, stroll);
    expect(fast.speed).toBeCloseTo(INFECTED.chaseSpeed * INFECTED.nightSpeed);
    think(b, senses({ dt: INFECTED.chaseMs, sees: true }), rng, stroll);
    expect(b.mode).toBe('search');
  });

  it('someone you were Namma with hesitates a second, once', () => {
    const b = brain('wander', true);
    think(b, senses({ sees: true }), rng, stroll);
    think(b, senses({ dt: INFECTED.growlMs, sees: true }), rng, stroll);
    expect(b.mode).toBe('alert');
    think(b, senses({ dt: INFECTED.hesitateMs, sees: true }), rng, stroll);
    expect(b.mode).toBe('chase');
    expect(b.hesitated).toBe(true);
  });

  it('a pack wakes on its lead; a heard sound draws a wanderer without a chase; a hit gives you a second', () => {
    const member = brain('idle');
    think(member, senses({ packAlert: true }), rng, stroll);
    expect(member.mode).toBe('alert');
    const w = brain('wander');
    const i = think(w, senses({ heard: [300, 40] }), rng, stroll);
    expect(w.mode).toBe('wander');
    expect(i.target).toEqual([300, 40]);
    const c = brain('chase');
    struck(c);
    expect(think(c, senses(), rng, stroll).speed).toBe(0);
    think(c, senses({ dt: INFECTED.recoverMs }), rng, stroll);
    expect(c.mode).toBe('chase');
  });
});

describe('harm and failing forward (act4 doc §5, plan Q4)', () => {
  it('a second touch within 5 s is a grab', () => {
    expect(hitKind(null, 1000)).toBe('touch');
    expect(hitKind(1000, 1000 + HARM.grabWindowMs)).toBe('grab');
    expect(hitKind(1000, 1001 + HARM.grabWindowMs)).toBe('touch');
    expect(HARM.grab.health).toBeLessThan(HARM.touch.health);
  });

  it('you lose every second thing you carry, never a key item', () => {
    expect(itemsLost([{ id: 'water_bottle', count: 3 }, { id: 'id_card', count: 1, key: true }, { id: 'cutting_chai', count: 2 }]))
      .toEqual([{ id: 'water_bottle', count: 1 }, { id: 'cutting_chai', count: 1 }]);
    expect(FAIL_FORWARD.stress).toBe(20);
  });
});

describe('ambushes from cover (ADR-50)', () => {
  it('the roll: rate, halved when crouched, never at 0', () => {
    const always = () => 0.2;
    expect(rolls(0.25, false, always)).toBe(true);
    expect(rolls(0.25, true, always)).toBe(false);
    expect(rolls(0, false, () => 0)).toBe(false);
  });

  it('cover 4–6 tiles away, nearest 5; else beyond 3; else none', () => {
    const p: [number, number] = [0, 0];
    expect(pickCover([[2 * T, 0], [4 * T, 0], [5 * T, 0], [9 * T, 0]], p)).toEqual([5 * T, 0]);
    expect(pickCover([[2 * T, 0], [9 * T, 0]], p)).toEqual([9 * T, 0]);
    expect(pickCover([[T, 0]], p)).toBeNull();
    const r = mulberry32(seedOf('lane:0'));
    for (let k = 0; k < 50; k++) { const n = ambushSize(r); expect(n).toBeGreaterThanOrEqual(ENCOUNTER.count[0]); expect(n).toBeLessThanOrEqual(ENCOUNTER.count[1]); }
  });

  it('seeded: the same place and day roll the same', () => {
    const a = mulberry32(seedOf('whitefield_street:3')), b = mulberry32(seedOf('whitefield_street:3'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('wiring (ADR-145)', async () => {
  const { withDiscs } = await import('../world/nav');
  const { buildGrid, cellAt } = await import('../world/walkgrid');
  const { CORE_BEHAVIOURS } = await import('../world/behaviours');
  const { BEHAVIOUR_NAMES } = await import('../world/behaviours/names');
  const { DISTRICTS } = await import('../data');
  const { meters } = await import('../ui/hud/viewModel');
  const { STEP_ACTIONS } = await import('../playground/movie/types');

  it('UV lamps are walls to the infected', () => {
    const g = buildGrid([], 320, 320);
    const uv = withDiscs(g, [{ x: 160, y: 160, r: 48 }]);
    expect(uv.blocked[cellAt(uv, 160, 160)]).toBe(1);
    expect(uv.blocked[cellAt(uv, 20, 20)]).toBe(0);
    expect(g.blocked[cellAt(g, 160, 160)]).toBe(0);
  });

  it('every place runs the threat behaviour; only places with data have infected', () => {
    expect(CORE_BEHAVIOURS).toContain('act4Threat');
    expect(BEHAVIOUR_NAMES).toContain('act4Threat');
    const withInfected = Object.values(DISTRICTS).filter((d) => d.infected?.packs.length).map((d) => d.id);
    expect(withInfected).toEqual(['act4_bench']);
    expect(DISTRICTS.act4_bench.dev).toBe(true);
  });

  it('the HUD shows energy pips (one block per stamina pip) only when asked', () => {
    const stats = { health: 100, food: 100, stress: 0 };
    expect(meters(stats, 'auto').map((m) => m.id)).toEqual([]);
    const e = meters(stats, 'auto', null, { pips: 2, max: 6 });
    expect(e).toEqual([{ id: 'energy', icon: 'run', blocks: 2, max: 6, critical: false }]);
  });

  it('the playthrough bot can flee and hide', () => {
    expect(STEP_ACTIONS).toEqual(expect.arrayContaining(['flee', 'hide']));
  });
});
