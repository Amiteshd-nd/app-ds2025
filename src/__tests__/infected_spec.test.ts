import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EVOLVED, HOST, INFECTED, LIGHT, QUIRKS, brain, chaseSpeed, gait, quirksFor, stun, think, twitchGap, type Senses } from '../systems/infected';
import { mulberry32 } from '../systems/rng';
import { withDiscs, withLight } from '../world/nav';
import { astar, buildGrid, cellAt, cellCentre } from '../world/walkgrid';
import { PLAYER_RUN_SPEED, PLAYER_SPEED, TILE_SIZE } from '../utils/constants';

const T = TILE_SIZE;
const SPRITES = join(__dirname, '../assets/sprites');

describe('seeded asymmetry (the infected spec step 4, ADR-159)', () => {
  it('the same seed gives the same body; another seed another', () => {
    expect(quirksFor(mulberry32(7))).toEqual(quirksFor(mulberry32(7)));
    expect(quirksFor(mulberry32(7))).not.toEqual(quirksFor(mulberry32(8)));
  });

  it('a chase never beats its tier: you can still outrun the Fresh and Degraded', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const q = quirksFor(rng);
      expect(q.chase).toBeLessThanOrEqual(1);
      expect(q.chase).toBeGreaterThanOrEqual(QUIRKS.speed.chase[0]);
      expect(chaseSpeed('degraded', true) * q.chase).toBeLessThan(PLAYER_RUN_SPEED);
      for (let ms = 0; ms < 2000; ms += 37) { const g = gait(q, ms); expect(g).toBeGreaterThan(0.6); expect(g).toBeLessThanOrEqual(1); }
    }
  });

  it('a pack does not move in step: paces, limps and animation rates differ', () => {
    const rng = mulberry32(42);
    const pack = Array.from({ length: 5 }, () => quirksFor(rng));
    expect(new Set(pack.map((q) => q.wander.toFixed(3))).size).toBe(5);
    expect(new Set(pack.map((q) => q.anim.toFixed(3))).size).toBe(5);
  });
});

describe('twitches (the infected spec step 3, ADR-159)', () => {
  it('the Degraded twitch most, the Fresh and the Evolved rarely', () => {
    const r = mulberry32(3);
    const mean = (t: 'fresh' | 'degraded' | 'evolved' | 'host') => Array.from({ length: 50 }, () => twitchGap(t, r)).reduce((a, b) => a + b) / 50;
    expect(mean('degraded')).toBeLessThan(mean('fresh'));
    expect(mean('fresh')).toBeLessThan(mean('evolved'));
  });

  it('every infected walk sheet has twitch frames, and no twitch sheet is stale', () => {
    const files = readdirSync(SPRITES).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
    const twitchers = files.filter((f) => !f.includes('__') && /^(inf_(fresh|degraded)_.+|inf_evolved_(male|female|elder)|inf_base_(male|female|elder)_\d|inf_host)$/.test(f));
    expect(twitchers.length).toBeGreaterThan(40);
    for (const s of twitchers) expect(files, s).toContain(`${s}__twitch`);
    for (const t of files.filter((f) => f.endsWith('__twitch'))) expect(files).toContain(t.replace(/__twitch$/, ''));
  });
});

describe('photophobia as path costs (the infected spec step 5, ADR-159)', () => {
  it('a halo around a lamp costs more the nearer it gets; the lamp itself stays a wall', () => {
    const g = buildGrid([], 640, 640);
    const lamp = { x: 320, y: 320, r: 3 * T };
    const lit = withLight(withDiscs(g, [lamp]), g, [lamp], false, LIGHT, T);
    const at = (x: number) => lit.cost![cellAt(lit, x, 320)];
    expect(lit.blocked[cellAt(lit, 320, 320)]).toBe(1);
    expect(at(320 + 3 * T + 8)).toBeGreaterThan(at(320 + 4 * T + 8));
    expect(at(320 + 4 * T + 8)).toBeGreaterThan(0);
    expect(at(320 + 6 * T)).toBe(0);
  });

  it('outdoors by day the open sun costs more than ground by a wall; at night (or indoors) it costs nothing', () => {
    const wall: [number, number, number, number] = [0, 0, 640, 32];
    const walk = buildGrid([wall], 640, 640), sight = buildGrid([wall], 640, 640, 8, { w: 0, h: 0 });
    const day = withLight(walk, sight, [], true, LIGHT, T), night = withLight(walk, sight, [], false, LIGHT, T);
    expect(day.cost![cellAt(day, 320, 48)]).toBe(0); // in the wall's shade
    expect(day.cost![cellAt(day, 320, 320)]).toBeCloseTo(LIGHT.sunCost);
    expect(night.cost![cellAt(night, 320, 320)]).toBe(0);
    // Reachability never changes.
    expect(Array.from(day.blocked)).toEqual(Array.from(walk.blocked));
  });

  it('by day a wanderer takes the shaded way round when the sunny way is barely shorter', () => {
    // A wall along the top: the straight line across the middle is all sun, the line under the wall is shade.
    const wall: [number, number, number, number] = [0, 0, 640, 16];
    const walk = buildGrid([wall], 640, 160), sight = buildGrid([wall], 640, 160, 8, { w: 0, h: 0 });
    const day = withLight(walk, sight, [], true, LIGHT, T);
    const from = cellAt(day, 40, 70), to = cellAt(day, 600, 70);
    const path = astar(day, from, (i) => i === to, [600, 70])!;
    const minY = Math.min(...path.map((i) => cellCentre(day, i)[1]));
    expect(minY).toBeLessThan(50);
    // Without costs it walks straight.
    const flat = astar(walk, cellAt(walk, 40, 70), (i) => i === cellAt(walk, 600, 70), [600, 70])!;
    expect(Math.min(...flat.map((i) => cellCentre(walk, i)[1]))).toBeGreaterThanOrEqual(60);
  });
});

describe('the Host (the infected spec step 6, ADR-159)', () => {
  const senses = (o: Partial<Senses> = {}): Senses => ({ dt: 16, sees: false, player: [0, 0], heard: null, packAlert: false, atTarget: false, night: false, ...o });

  it('slow: you can walk away from it, and it wanders slower than anyone', () => {
    expect(chaseSpeed('host', false)).toBeLessThan(PLAYER_SPEED);
    expect(chaseSpeed('host', true)).toBeLessThan(PLAYER_RUN_SPEED);
    const b = brain('wander', false, 'host');
    const i = think(b, senses({ dt: 5000 }), () => 0.5, () => [100, 100]);
    expect(i.speed).toBeCloseTo(HOST.wanderRatio * PLAYER_SPEED);
    expect(i.speed).toBeLessThan(INFECTED.wanderSpeed);
  });

  it("can't be stunned", () => {
    const b = brain('chase', false, 'host');
    stun(b, 2000);
    expect(b.mode).toBe('chase');
    const d = brain('chase', false, 'degraded');
    stun(d, 2000);
    expect(d.mode).toBe('stunned');
  });

  it('growls longer and hunts longer than the rest', () => {
    const b = brain('wander', false, 'host');
    think(b, senses({ sees: true }), () => 0.5, () => null);
    expect(b.mode).toBe('alert');
    think(b, senses({ dt: INFECTED.growlMs + 10 }), () => 0.5, () => null);
    expect(b.mode).toBe('alert');
    think(b, senses({ dt: HOST.growlMs }), () => 0.5, () => null);
    expect(b.mode).toBe('chase');
    think(b, senses({ dt: INFECTED.chaseMs + 100, sees: true }), () => 0.5, () => null);
    expect(b.mode).toBe('chase');
    expect(HOST.pulseCharges).toBeGreaterThan(EVOLVED.pulseChargesMidSprint);
  });

  it('its sheet is the one large class: 144×256 (48×64 frames), and only inf_host* may be large', async () => {
    const sharp = (await import('sharp')).default;
    const m = await sharp(join(SPRITES, `${HOST.sheet}.png`)).metadata();
    expect([m.width, m.height]).toEqual([144, 256]);
    // @ts-expect-error — plain .mjs script, no types
    const { LARGE_SHEET } = await import('../../scripts/validate-maps.mjs');
    expect(LARGE_SHEET.pattern.test('inf_host')).toBe(true);
    expect(LARGE_SHEET.pattern.test('inf_evolved_male')).toBe(false);
  });

  it('lives only near HIVR, and the bench has one', async () => {
    const { DISTRICTS } = await import('../data');
    for (const d of Object.values(DISTRICTS)) {
      const hosts = (d.infected?.packs ?? []).filter((p) => p.host);
      expect(hosts.length, d.id).toBeLessThanOrEqual(1);
      if (hosts.length && !d.dev) expect(HOST.places).toContain(d.id);
    }
    expect(DISTRICTS.act4_bench.infected!.packs.some((p) => p.host && p.sheets[0] === HOST.sheet)).toBe(true);
    expect(JSON.parse(readFileSync(join(__dirname, '../assets/_raw/characters/breath.json'), 'utf8')).inf_host).toBeTruthy();
  });
});
