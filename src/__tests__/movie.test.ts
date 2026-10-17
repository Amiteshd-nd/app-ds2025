import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISTRICTS, NPCS, SCENES } from '../data';
import { MAPS } from '../assets/maps';
import { runStep } from '../playground/movie/actions';
import { MovieRunner, sceneSeed, summarise } from '../playground/movie/runner';
// @ts-expect-error — plain .mjs Node tooling, no types
import { compareRuns, exitCode, formatReport } from '../../scripts/movie-report.mjs';
import type { DriverState, MovieDriver, Step, Walkthrough } from '../playground/movie/types';
import { astar, bfs, buildGrid, cellAt, cellCentre, corners, lineFree, nearestFree, overlapsZone, rectsFromTmj, smooth, zoneOf, FEET_DY } from '../playground/movie/walkgrid';
import { reachable, validateWalkthroughs } from '../../scripts/validate-content.ts';
// @ts-expect-error — plain .mjs build check, no types
import { checkDist, MARKERS } from '../../scripts/check-dist.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const assets = join(__dirname, '..', 'assets');
const manifest = JSON.parse(readFileSync(join(assets, 'maps.manifest.json'), 'utf8'));
const tmjOf = (key: string) => JSON.parse(readFileSync(join(assets, 'tilemaps', manifest.maps[key].file), 'utf8'));
const npcs = Object.values(NPCS);

describe('walk grid (shared by the validator and the bot)', () => {
  it('A* finds a route the validator also accepts, and none where it refuses', () => {
    const tmj = tmjOf('airport_map'), def = manifest.maps.airport_map;
    const grid = buildGrid(rectsFromTmj(tmj, def), tmj.width * 32, tmj.height * 32);
    const spawns = tmj.layers.find((l: { name: string }) => l.name === 'spawns').objects as Array<{ name: string; x: number; y: number; width?: number; height?: number }>;
    const spawn = spawns.find((o) => o.name === 'player_spawn')!, exit = spawns.find((o) => o.name === 'zone_exit')!;
    const start = nearestFree(grid, cellAt(grid, spawn.x, spawn.y + FEET_DY));
    const zone = zoneOf(exit);
    const goal = (i: number) => overlapsZone(grid, i, zone);
    expect(reachable(tmj, def, 'player_spawn', 'zone_exit')).toBe(true);
    const path = astar(grid, start, goal, [zone.x + zone.w / 2, zone.y + zone.h / 2])!;
    expect(path).not.toBeNull();
    expect(path[0]).toBe(start);
    expect(goal(path[path.length - 1])).toBe(true);
    for (const i of path) expect(grid.blocked[i]).toBe(0);
    // Consecutive cells are 4-neighbours; corners compress straight runs.
    for (let k = 1; k < path.length; k++) { const [ax, ay] = cellCentre(grid, path[k - 1]), [bx, by] = cellCentre(grid, path[k]); expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(grid.cell); }
    const pts = corners(grid, path);
    expect(pts.length).toBeLessThan(path.length);
    // The runtime route prepends the start cell, so a leg never cuts a diagonal through the dilated edge the player stands in.
    expect(nearestFree(grid, cellAt(grid, spawn.x, spawn.y + FEET_DY))).toBe(start);
    expect(pts[pts.length - 1]).toEqual(cellCentre(grid, path[path.length - 1]));
  });

  it('a wall across the map blocks both BFS and A*', () => {
    const grid = buildGrid([[0, 60, 200, 8]], 200, 120);
    const start = cellAt(grid, 20, 20), end = cellAt(grid, 180, 100);
    expect(bfs(grid, start, (i) => i === end)).toBe(false);
    expect(astar(grid, start, (i) => i === end)).toBeNull();
    const gap = buildGrid([[0, 60, 80, 8], [120, 60, 80, 8]], 200, 120);
    const path = astar(gap, start, (i) => i === end, cellCentre(gap, end))!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toBe(end);
    // String-pulling: the staircase through the gap becomes a few straight legs, each over free cells only.
    const pts = smooth(gap, corners(gap, path));
    expect(pts.length).toBeLessThanOrEqual(corners(gap, path).length);
    for (let k = 1; k < pts.length; k++) expect(lineFree(gap, pts[k - 1], pts[k])).toBe(true);
    expect(lineFree(gap, [20, 20], [180, 100])).toBe(false);
  });
});

/** A fake game: steps resolve instantly, the clock is ours, nothing is real. */
function fakeDriver(over: Partial<DriverState> = {}, options: { routes?: Record<string, { ok: true; corners: Array<[number, number]>; px: number } | { ok: false; reason: string }>; moveOnWalk?: boolean } = {}) {
  let now = 0;
  const state: DriverState = { activeScene: 'WorldScene', district: 'airport', overlay: null, free: true, dialogueOpen: false, flags: {}, wallet: 35_000, ...over };
  const feet: [number, number] = [100, 100];
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  const log: string[] = [];
  const driver: MovieDriver & { now(): number; state(): DriverState; emit(e: string, p?: unknown): void; log: string[]; loaded: string[] } = {
    loaded: [],
    log,
    loadScene: (id) => { driver.loaded.push(id); },
    frames: async (n) => { now += n * 16.67; },
    now: () => now,
    state: () => state,
    walk: (dx, dy) => { if (options.moveOnWalk !== false) { feet[0] += dx * 2; feet[1] += dy * 2; } },
    interact: () => { log.push('interact'); },
    key: async (code) => { log.push(`key ${code}`); now += 7 * 16.67; },
    route: (t) => options.routes?.[t] ?? { ok: false, reason: `unknown_target:${t}` },
    feet: () => feet,
    dialogue: () => null,
    phone: () => null,
    tap: async () => undefined,
    freeAt: () => true,
    talkingTo: () => null,
    on: (e, cb) => { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e)!.add(cb); return () => listeners.get(e)!.delete(cb); },
    setFlag: (f, v) => { state.flags[f] = v; },
    screenshot: async () => 'data:image/png;base64,AAAA',
    overlay: { title: (t) => log.push(`title ${t}`), pill: () => undefined, clear: () => undefined },
    emit: (e, p) => { for (const cb of listeners.get(e) ?? []) cb(p); },
  };
  return driver;
}

const ctx = { speed: 1 as const, cancelled: () => false, log: () => undefined };

describe('actions', () => {
  it('goto walks the route corner by corner through the virtual stick and arrives', async () => {
    const d = fakeDriver({}, { routes: { 'npc:x': { ok: true, corners: [[100, 140], [160, 140]], px: 100 } } });
    const r = await runStep(d, { do: 'goto', target: 'npc:x' }, ctx);
    expect(r.status).toBe('passed');
    // Arrived = within the stick's tolerance (3 px + 2 px per speed step) of the last corner.
    expect(d.feet()![0]).toBeGreaterThanOrEqual(155);
    expect(d.feet()![1]).toBeGreaterThanOrEqual(135);
  });

  it('goto fails with the planner\'s reason for an unknown target, and as stuck when the stick moves nothing', async () => {
    const d = fakeDriver({}, { moveOnWalk: false, routes: { 'zone:far': { ok: true, corners: [[300, 100]], px: 200 } } });
    expect((await runStep(d, { do: 'goto', target: 'zone:nowhere' }, ctx)).reason).toMatch(/unknown_target/);
    const r = await runStep(d, { do: 'goto', target: 'zone:far' }, ctx);
    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/stuck|timeout:goto/); // sidesteps and replans first; the walk's own timeout may end it
  });

  it('wait_for times out as a failure, never an exception; expect names what was wrong; set_flag is a cheat', async () => {
    const d = fakeDriver();
    const r = await runStep(d, { do: 'wait_for', ready: 'flag', flag: 'never', timeout: 500 }, ctx);
    expect(r).toEqual({ status: 'failed', reason: 'timeout:flag:never' });
    const e = await runStep(d, { do: 'expect', flag: 'act0_arrived', wallet_lte: 100 }, ctx);
    expect(e.status).toBe('failed');
    expect(e.reason).toContain('flag act0_arrived not set');
    expect(e.reason).toContain('wallet ₹35000 > ₹100');
    const c = await runStep(d, { do: 'set_flag', flag: 'act0_arrived' }, ctx);
    expect(c.status).toBe('cheated');
    expect((await runStep(d, { do: 'expect', flag: 'act0_arrived' }, ctx)).status).toBe('passed');
  });

  it('wait_for objective listens to the quest event', async () => {
    const d = fakeDriver();
    const p = runStep(d, { do: 'wait_for', ready: 'objective', objective: 'reach_stop', timeout: 2000 }, ctx);
    await d.frames(2);
    d.emit('quest:objective', { questId: 'q_act0_arrival', objectiveId: 'reach_stop' });
    expect((await p).status).toBe('passed');
  });
});

describe('runner', () => {
  const scenes = [
    { id: 'a', title: 'A', act: 0, place: 'Airport', beats: ['F1'] },
    { id: 'b', title: 'B', act: 0, place: 'Street', beats: [] },
    { id: 'c', title: 'C', act: 0, place: 'Lane', beats: [] },
  ];
  const walkthroughs: Record<string, Walkthrough> = {
    a: { scene: 'a', steps: [{ id: 'ok', do: 'wait', ms: 10 }, { id: 'hang', do: 'wait_for', ready: 'flag', flag: 'never', timeout: 300 }, { id: 'after', do: 'wait', ms: 10 }] },
    c: { scene: 'c', steps: [{ id: 'cheat', do: 'set_flag', flag: 'x' }, { id: 'fine', do: 'expect', flag: 'x' }] },
  };
  const run = (): Promise<MovieRunner> => new Promise((resolve) => {
    const runner = new MovieRunner(fakeDriver(), scenes, walkthroughs, { seed: 3 });
    runner.subscribe((s) => { if (s.status === 'done') resolve(runner); });
    runner.play();
  });

  it('a timed-out step fails its scene, the next scene still runs, a missing walkthrough is yellow, a cheat is counted', async () => {
    const runner = await run();
    const report = runner.state.report!;
    expect(report.scenes.map((s) => s.status)).toEqual(['failed', 'missing', 'cheated']);
    expect(report.scenes[0].failedStep?.id).toBe('hang');
    expect(report.scenes[0].steps.map((s) => s.status)).toEqual(['passed', 'failed']);
    expect(report.scenes[0].screenshot).toMatch(/^data:image/);
    expect(report.scenes[2].cheats).toBe(1);
    expect(report.totals).toMatchObject({ scenes: 3, passed: 0, failed: 1, cheated: 1, missing: 1 });
    expect(runner.state.scenes.map((s) => s.status)).toEqual(['failed', 'missing', 'cheated']);
  });

  it('two runs with the same seed leave the same trace', async () => {
    const a = (await run()).state.report!.trace, b = (await run()).state.report!.trace;
    expect(a).toEqual(['a:ok:passed', 'a:hang:failed', 'b:missing', 'c:cheat:cheated', 'c:fine:passed']);
    expect(b).toEqual(a);
  });

  it('plays from a chosen scene and summarises steps for the pill', async () => {
    const runner = new MovieRunner(fakeDriver(), scenes, walkthroughs, {});
    runner.play({ scene: 'c' });
    await new Promise((r) => setTimeout(r, 0)); // play() starts after any stopping run has finished
    const [a, b, c] = runner.state.scenes.map((s) => s.status);
    expect([a, b]).toEqual(['skipped', 'skipped']);
    expect(c).not.toBe('pending'); // c is running, or already through (the fake game resolves frames instantly)
    expect(summarise({ do: 'goto', target: 'npc:x' } as Step)).toBe('goto npc:x');
    expect(summarise({ do: 'expect', flag: 'f', wallet_lte: 10 } as Step)).toBe('expect f wallet≤10');
  });
});

describe('walkthrough validator', () => {
  const maps: Record<string, unknown> = {};
  for (const key of Object.keys(manifest.maps)) maps[key] = tmjOf(key);
  const scenes = Object.values(SCENES), districts = Object.values(DISTRICTS);
  const check = (json: unknown, file = 'walkthroughs/act0_arrivals.json') => validateWalkthroughs([{ file, json: json as never }], scenes as never, districts as never, npcs as never, manifest, maps as never);

  it('accepts the real airport walkthrough', () => {
    const json = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'walkthroughs', 'act0_arrivals.json'), 'utf8'));
    expect(check(json).problems).toEqual([]);
    expect(Object.keys(MAPS)).toContain('airport_map');
  });

  it('catches unknown actions, targets that are not in the district, stub scenes and bad beats', () => {
    const p = check({ scene: 'act0_arrivals', steps: [
      { do: 'teleport', target: 'x' },
      { do: 'goto', target: 'npc:npc_noor' },
      { do: 'goto', target: 'zone:nowhere' },
      { do: 'interact', target: 'bus_stop', beat: 'F9' },
      { do: 'wait_for', ready: 'scene_loaded', scene: 'whitefield_street' },
      { do: 'goto', target: 'spawn:bus_stop' },
      { do: 'expect' },
    ] }).problems;
    expect(p.some((x) => x.includes('unknown action "teleport"'))).toBe(true);
    expect(p.some((x) => x.includes('"npc:npc_noor" is not placed in district "airport"'))).toBe(true);
    expect(p.some((x) => x.includes('"zone:nowhere" is not a spawn or zone'))).toBe(true);
    expect(p.some((x) => x.includes('beat "F9"'))).toBe(true);
    expect(p.some((x) => x.includes('expects nothing'))).toBe(true);
    // After scene_loaded whitefield_street, the street's spawns resolve.
    expect(p.some((x) => x.includes('"spawn:bus_stop"'))).toBe(false);
    expect(check({ scene: 'act4_the_hill', steps: [{ do: 'wait', ms: 1 }] }, 'walkthroughs/act4_the_hill.json').problems.some((x) => x.includes('STUB'))).toBe(true);
    expect(check({ scene: 'act0_arrivals', steps: [{ do: 'set_flag', flag: 'x' }] }).warnings[0]).toContain('set_flag');
  });
});

describe('Movie Mode never ships', () => {
  it('the dist check knows the runner\'s markers and the movie folder trips it', () => {
    expect(MARKERS).toContain('MovieRunner');
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'index.js'), 'class MovieRunner {}');
    expect(checkDist(dir).some((p: string) => p.includes('MovieRunner'))).toBe(true);
  });
});

describe('headless movie report (pnpm movie)', () => {
  const scene = (id: string, status: string, durationMs: number, walletEnd = 100) => ({ scene: id, title: id, status, startedAt: 0, durationMs, steps: [{ index: 0, id: 's1', action: 'goto', summary: 'goto x', status: status === 'failed' ? 'failed' : 'passed', reason: status === 'failed' ? 'timeout' : undefined, ms: 10 }], failedStep: status === 'failed' ? { index: 0, id: 's1', action: 'goto', summary: 'goto x', status: 'failed', reason: 'timeout', ms: 10 } : undefined, cheats: status === 'cheated' ? 1 : 0, flagsSet: [], walletEnd });
  const report = (scenes: ReturnType<typeof scene>[], trace = ['a:s1:passed', 'b:s1:passed']) => ({
    version: 1, startedAt: 'x', seed: 7, speed: 1, scenes, trace,
    totals: { scenes: scenes.length, passed: scenes.filter((s) => s.status === 'passed').length, failed: scenes.filter((s) => s.status === 'failed').length, cheated: scenes.filter((s) => s.status === 'cheated').length, missing: scenes.filter((s) => s.status === 'missing').length, playMs: 0, walletEnd: 0, flagsSet: 0 },
  });

  it('exits non-zero on a failed scene; --strict also on cheated or missing', () => {
    expect(exitCode(report([scene('a', 'passed', 1), scene('b', 'cheated', 1)]))).toBe(0);
    expect(exitCode(report([scene('a', 'passed', 1), scene('b', 'cheated', 1)]), { strict: true })).toBe(1);
    expect(exitCode(report([scene('a', 'failed', 1)]))).toBe(1);
  });

  it('prints one line per scene and the failing step under a red one', () => {
    const text = formatReport(report([scene('a', 'passed', 1500), scene('b', 'failed', 900)]));
    expect(text).toMatch(/✓ a\s+passed/);
    expect(text).toMatch(/✗ b\s+failed/);
    expect(text).toContain('s1 goto x — timeout');
    expect(text).toContain('2 scenes · 1 passed · 1 failed');
  });

  it('two runs agree when trace, status, wallet and time match; the first divergence is named', () => {
    const a = report([scene('a', 'passed', 1000), scene('b', 'passed', 2000)]);
    expect(compareRuns(a, report([scene('a', 'passed', 1000), scene('b', 'passed', 2000)]))).toEqual([]);
    expect(compareRuns(a, report([scene('a', 'passed', 1000), scene('b', 'passed', 2100)]), { toleranceMs: 0 })).toEqual(['b: 2000 ms ≠ 2100 ms']);
    const diffs = compareRuns(a, report([scene('a', 'passed', 1000), scene('b', 'passed', 2000, 50)], ['a:s1:passed', 'b:s1:failed']));
    expect(diffs).toEqual(['trace[1]: b:s1:passed ≠ b:s1:failed', 'b: wallet ₹100 ≠ ₹50']);
  });

  it('every scene has its own seed stream, stable across runs', () => {
    expect(sceneSeed(7, 'act1_cubbon')).toBe(sceneSeed(7, 'act1_cubbon'));
    expect(sceneSeed(7, 'act1_cubbon')).not.toBe(sceneSeed(7, 'act1_hill_flat'));
    expect(sceneSeed(7, 'act1_cubbon')).not.toBe(sceneSeed(8, 'act1_cubbon'));
  });
});
