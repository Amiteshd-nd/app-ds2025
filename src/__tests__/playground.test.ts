import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENES, NPCS } from '../data';
import { applyOverride, beatFlag, beatFlags, buildPrereqState, sceneOrder } from '../dev/prereq';
import { buildLocations } from '../playground/tree';
import { DISTRICTS } from '../data';
import { MAPS } from '../assets/maps';
import { buildTree, filterTree, findNode } from '../playground/tree';
import { lineDiff } from '../playground/diff';
import { STARTING_WALLET } from '../utils/constants';
import type { SceneComponent } from '../utils/types';
// @ts-expect-error — plain .mjs dev tooling, no types
import { exportWithValidation, presetFileName, readPresets, writePreset } from '../../scripts/vite-playground.mjs';
// @ts-expect-error — plain .mjs build check, no types
import { checkDist } from '../../scripts/check-dist.mjs';

const scenes = Object.values(SCENES);
const defaults = {
  stats: { health: 100, wallet: STARTING_WALLET, social: 0, stamina: 3, food: 100, stress: 0, battery: 100 },
  clock: { day: 1, minute: 370 },
};

describe('prerequisite-state builder', () => {
  it('orders scenes by seq; the Act 2–4 stubs follow the worked Acts 0–1', () => {
    const ordered = sceneOrder(scenes).map((s) => s.id);
    expect(ordered.slice(0, 9)).toEqual(['act0_arrivals', 'act0_hotel', 'act0_pg_hunt', 'act1_first_day', 'act1_ravi_intro', 'act1_pg_exit', 'act1_hill_flat', 'act1_bus_cubbon', 'act1_cubbon']);
    // "2.2b" (the ride, the second half of a beat that spans two places) follows "2.2" and precedes "2.3".
    expect(ordered.slice(9, 13)).toEqual(['act2_credited', 'act2_metro_opens', 'act2_metro_ride', 'act2_guitar']);
    expect(ordered[ordered.length - 1]).toBe('act4_tunnel');
    const built = ['act2_credited', 'act2_metro_opens', 'act2_metro_ride', 'act2_guitar', 'act2_ikea', 'act2_ravi_1am', 'act2_the_app', 'act2_breadcrumbs', 'act3_orr', 'act3_ward4', 'act3_corridor', 'act3_three_nights', 'act3_discharge'];
    for (const s of scenes) if (s.act >= 2 && !built.includes(s.id)) expect(s.status, s.id).toBe('STUB');
  });

  it('scene N gets every earlier scene\'s save_flags and completed quests, none of its own', () => {
    const state = buildPrereqState('act0_pg_hunt', scenes, defaults);
    for (const flag of [...SCENES.act0_arrivals.save_flags!, ...SCENES.act0_hotel.save_flags!]) expect(state.flags[flag]).toBe(true);
    for (const flag of SCENES.act0_pg_hunt.save_flags!) {
      if (![...SCENES.act0_arrivals.save_flags!, ...SCENES.act0_hotel.save_flags!].includes(flag)) expect(state.flags[flag]).toBeUndefined();
    }
    expect(state.questsCompleted).toEqual([...SCENES.act0_arrivals.quests, ...SCENES.act0_hotel.quests]);
    expect(state.position).toEqual({ districtId: 'prashanth_layout', spawnId: 'lane_mouth' });
    expect(state.stats.wallet).toBe(STARTING_WALLET);
  });

  it('the first scene starts clean', () => {
    const state = buildPrereqState('act0_arrivals', scenes, defaults);
    expect(state.flags).toEqual({});
    expect(state.questsCompleted).toEqual([]);
  });

  it('starting at a beat adds the flags of the beats before it', () => {
    const state = buildPrereqState('act0_pg_hunt', scenes, defaults, 'F4');
    expect(state.flags.pg_lane_found).toBe(true);   // F1
    expect(state.flags.pg_token_paid).toBe(true);   // F2 ("a | b" → first)
    expect(state.flags.coliving_seen).toBe(true);   // F3
    expect(state.flags.pg_signed).toBeUndefined();  // F4 itself
    expect(beatFlag({ id: 'x', pacing: 'Calm', what: 'w', flag: '-' })).toBeNull();
    // "a, b" sets both; "a | b" are alternatives (the first is taken) — story 2.2 F1 sets metro_open and metro_opening_seen.
    expect(beatFlags({ id: 'x', pacing: 'Calm', what: 'w', flag: 'metro_open, metro_opening_seen' })).toEqual(['metro_open', 'metro_opening_seen']);
    expect(beatFlags({ id: 'x', pacing: 'Calm', what: 'w', flag: 'seat_given | seat_kept' })).toEqual(['seat_given']);
  });

  it('reads the scene clock and refuses unknown scenes and beats', () => {
    expect(buildPrereqState('act0_hotel', scenes, defaults).clock.minute).toBe(8 * 60 + 30);
    expect(() => buildPrereqState('nope', scenes, defaults)).toThrow(/Unknown scene/);
    expect(() => buildPrereqState('act0_hotel', scenes, defaults, 'Z9')).toThrow(/no beat/);
  });

  it('works for a synthetic chain (scene 3 gets scenes 1 and 2)', () => {
    const mk = (id: string, seq: string, flags: string[]): SceneComponent => ({
      id, seq, act: 1, district: 'd', title: id, player_goal: '', design_goal: '', pacing: [], cast: [], quests: [`q_${id}`], beats: [], save_flags: flags,
    });
    const chain = [mk('c', '1.3', ['f3']), mk('a', '1.1', ['f1']), mk('b', '1.2', ['f2'])];
    const s = buildPrereqState('c', chain, defaults);
    expect(s.flags).toEqual({ f1: true, f2: true, 'visited:d': true }); // earlier scenes' places are visited (ADR-134)
    expect(s.questsCompleted).toEqual(['q_a', 'q_b']);
  });
});

describe('presets', () => {
  it('save then load round-trips, with safe file names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-presets-'));
    const id = writePreset('Act 1 broke (₹200)', { state: { stats: { wallet: 200 } } }, dir);
    expect(id).toBe('act-1-broke-200');
    expect(presetFileName('../../etc/passwd')).toBe('etc-passwd');
    const [p] = readPresets(dir);
    expect(p).toMatchObject({ id: 'act-1-broke-200', name: 'Act 1 broke (₹200)', state: { stats: { wallet: 200 } } });
  });

  it('a preset overrides the built state without dropping the rest', () => {
    const base = buildPrereqState('act0_pg_hunt', scenes, defaults);
    const broke = JSON.parse(readFileSync(join(__dirname, '..', 'data/playground/presets/act-0-broke-200.json'), 'utf8'));
    const s = applyOverride(base, broke.state);
    expect(s.stats.wallet).toBe(200);
    expect(s.stats.health).toBe(100);
    expect(s.flags).toEqual(base.flags);
    expect(base.stats.wallet).toBe(STARTING_WALLET); // the base is not mutated
  });

  it('the shipped presets parse', () => {
    const dir = join(__dirname, '..', 'data/playground/presets');
    for (const p of readPresets(dir)) expect(p.name && p.state).toBeTruthy();
  });
});

describe('export changes', () => {
  it('writes only scene files, and puts the original back when validation fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pg-data-'));
    mkdirSync(join(root, 'scenes'));
    writeFileSync(join(root, 'scenes/x.json'), '{"id":"x"}\n');
    const bad = await exportWithValidation('scenes/x.json', { id: 'broken' }, async () => ['scenes/x.json: broken'], root);
    expect(bad.ok).toBe(false);
    expect(readFileSync(join(root, 'scenes/x.json'), 'utf8')).toBe('{"id":"x"}\n');
    const good = await exportWithValidation('scenes/x.json', { id: 'x', title: 'new' }, async () => [], root);
    expect(good.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(root, 'scenes/x.json'), 'utf8')).title).toBe('new');
    const refused = await exportWithValidation('quests/q.json', {}, async () => [], root);
    expect(refused.ok).toBe(false);
  });

  it('diffs line by line', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual(['  a', '- b', '+ B', '  c']);
  });
});

describe('content tree', () => {
  const tree = buildTree(scenes, ['player_m_1', 'player_m_2', 'npc_shanthamma', 'npc_shanthamma__breath', 'crowd_techie'], Object.values(NPCS), ['scenes/act0_hotel.json: something is wrong']);

  it('is built from data: intro, chapters (act → scene → beat), characters', () => {
    expect(tree.map((n) => n.label)).toEqual(['Intro', 'Chapters', 'Characters', 'Audio', 'Act 4 · stability dial', 'Devices']);
    const act0 = findNode(tree, 'act:0')!;
    expect(act0.children!.map((c) => c.ref)).toEqual(['act0_arrivals', 'act0_hotel', 'act0_pg_hunt']);
    expect(findNode(tree, 'beat:act0_pg_hunt:F4')).not.toBeNull();
    const player = findNode(tree, 'char:player_m')!;
    expect(player.sheets).toEqual(['player_m_1', 'player_m_2']);
    expect(findNode(tree, 'char:npc_shanthamma__breath')).toBeNull(); // derived sheets are not characters
    expect(findNode(tree, 'char:npc_shanthamma')!.npc?.name).toBe('Shanthamma');
  });

  it('marks failing and stub nodes', () => {
    expect(findNode(tree, 'scene:act0_hotel')!.status).toBe('failing');
    expect(findNode(tree, 'scene:act0_pg_hunt')!.status).toBe('built');
    const stub = buildTree([{ ...SCENES.act0_hotel, id: 'act2_x', act: 2, seq: '2.1', status: 'STUB' }], [], []);
    expect(findNode(stub, 'scene:act2_x')!.status).toBe('stub');
  });

  it('search keeps matches and their ancestors', () => {
    const hits = filterTree(tree, 'shanthamma');
    expect(findNode(hits, 'char:npc_shanthamma')).not.toBeNull();
    expect(findNode(hits, 'intro:TitleScene')).toBeNull();
  });
});

describe('the playground is absent from production', () => {
  it('the dist check catches playground files and dev-API code', () => {
    const dist = mkdtempSync(join(tmpdir(), 'pg-dist-'));
    writeFileSync(join(dist, 'index.js'), 'console.log("game")');
    expect(checkDist(dist)).toEqual([]);
    writeFileSync(join(dist, 'app.js'), 'window.__nqDev = api');
    writeFileSync(join(dist, 'playground.html'), '<html></html>');
    const p = checkDist(dist);
    expect(p.some((x: string) => x.includes('__nqDev'))).toBe(true);
    expect(p.some((x: string) => x.includes('playground file'))).toBe(true);
  });

  it('no game source imports the playground or the dev API', () => {
    const src = join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const path = join(d, name);
        if (statSync(path).isDirectory()) {
          if (!['playground', 'dev', '__tests__'].includes(name)) walk(path);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const text = readFileSync(path, 'utf8');
        if (/from ['"][^'"]*(playground|dev\/devApi|dev\/prereq)['"]/.test(text)) offenders.push(path.slice(src.length + 1));
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });

  it('the production build input is the game page only', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/rollupOptions:\s*\{\s*input:\s*'index\.html'\s*\}/);
    expect(readFileSync(join(__dirname, '..', '..', 'scripts/vite-playground.mjs'), 'utf8')).toMatch(/apply: 'serve'/);
  });
});

describe('phone-in-landscape ergonomics', async () => {
  const { DEVICES, deviceById, checkControl, reachAt, thumbPivots, reachPx, MIN_TARGET_MM } = await import('../playground/ergonomics');
  const iphone = deviceById('iphone15');

  it('simulates real CSS-pixel viewports', () => {
    expect(iphone).toMatchObject({ width: 852, height: 393 });
    expect(deviceById('nope').id).toBe('desktop');
    expect(DEVICES.every((d) => d.width > d.height)).toBe(true); // all landscape
  });

  it('thumbs pivot just outside each edge; reach grows with hand size', () => {
    const { left, right } = thumbPivots(iphone);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(iphone.width);
    expect(reachPx(iphone, 'large').comfortable).toBeGreaterThan(reachPx(iphone, 'small').comfortable);
  });

  it('bottom corners are comfortable, the middle of the screen is hard', () => {
    expect(reachAt(iphone, 60, iphone.height - 60)).toBe('comfortable');
    expect(reachAt(iphone, iphone.width - 60, iphone.height - 60)).toBe('comfortable');
    expect(reachAt(iphone, iphone.width / 2, iphone.height / 2)).toBe('hard');
  });

  it('checks a control: size in mm, reach and safe-area overlap', () => {
    // The game's joystick: 112 px, 24 px from the left, 72 px up.
    const stick = checkControl(iphone, 'Joystick', { x: 24, y: iphone.height - 72 - 112, w: 112, h: 112 });
    expect(stick.sizeMm).toBeGreaterThanOrEqual(MIN_TARGET_MM);
    expect(stick.bigEnough).toBe(true);
    expect(stick.reach).toBe('comfortable');
    expect(stick.inSafeArea).toBe(true); // 24 px < the 59 px notch inset
    const tiny = checkControl(iphone, 'Tiny', { x: 300, y: 100, w: 20, h: 20 });
    expect(tiny.bigEnough).toBe(false);
    expect(tiny.inSafeArea).toBe(false);
  });

  it('lists every map as a Location, labelled by its district, and under each scene the maps it uses (Part B)', () => {
    const locations = buildLocations(Object.keys(MAPS), Object.values(DISTRICTS), scenes);
    expect(locations.map((l) => l.mapKey).sort()).toEqual(Object.keys(MAPS).sort());
    expect(locations.find((l) => l.mapKey === 'airport_map')!.label).toBe('Kempegowda International');
    expect(locations.find((l) => l.mapKey === 'cubbon_park')!.scenes).toContain('act1_cubbon');
    expect(locations.find((l) => l.mapKey === 'bus_interior')!.scenes).toContain('act1_bus_cubbon');
    const t = buildTree(scenes, [], [], ['airport_map: layer "fx" is missing'], locations);
    expect(t.map((n) => n.label)).toEqual(['Intro', 'Chapters', 'Locations', 'Characters', 'Audio', 'Act 4 · stability dial', 'Devices']);
    expect(findNode(t, 'loc:airport_map')!.status).toBe('failing');
    expect(findNode(t, 'loc:cubbon_park')!.status).toBe('built');
    expect(findNode(t, 'scene-locs:act1_cubbon')!.children!.map((c) => c.ref).sort()).toEqual(['cubbon_park', 'whitefield_street']);
  });

  it('the tree offers the phone simulation under Devices', () => {
    const t = buildTree(scenes, [], []);
    expect(findNode(t, 'device:phone-landscape')?.kind).toBe('device');
  });
});
