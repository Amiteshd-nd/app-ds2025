import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs script, no types
import { validateMap, runValidation, mapWarnings, runWarnings, validateBreath } from '../../scripts/validate-maps.mjs';

const assetsDir = join(__dirname, '..', 'assets');
const manifest = JSON.parse(readFileSync(join(assetsDir, 'maps.manifest.json'), 'utf8'));

/** A fixed hand-authored-style definition — the validator's behaviour, not whichever map is the airport today. */
const AIRPORT = {
  file: 'test_map.tmj',
  collisionLayer: 'collision',
  spawnLayer: 'spawns',
  sortedLayer: 'sorted',
  requiredSpawns: ['player_spawn'],
  optionalLayers: ['Effects', 'Foreground'],
};
const TILESETS = [
  'airport', 'wall', 'skirting', 'airport-exitgate',
  'tourist-info-desk', 'luggage-belt', 'objects', 'shops',
];

/** A minimal .tmj that passes, so each test can break exactly one thing. */
const goodMap = () => ({
  orientation: 'orthogonal',
  infinite: false,
  tilewidth: 32,
  tileheight: 32,
  tilesets: TILESETS.map((name, i) => ({ name, firstgid: i + 1, image: `../tilesets/${name}.png` })),
  layers: [
    { name: 'ground', type: 'tilelayer', visible: true },
    { name: 'ground_detail', type: 'tilelayer', visible: true },
    { name: 'buildings', type: 'tilelayer', visible: true },
    { name: 'sorted', type: 'objectgroup', visible: true, objects: [] },
    { name: 'props_above', type: 'tilelayer', visible: true },
    { name: 'collision', type: 'tilelayer', visible: false },
    { name: 'fx', type: 'tilelayer', visible: true },
    { name: 'spawns', type: 'objectgroup', visible: true, objects: [{ name: 'player_spawn', x: 1, y: 1 }] },
  ],
});

const check = (mutate: (m: ReturnType<typeof goodMap>) => void) => {
  const map = goodMap();
  mutate(map);
  return validateMap('test_map', AIRPORT, map, TILESETS, 32);
};

describe('tilemap validator', () => {
  it('accepts a well-formed map', () => {
    expect(check(() => {})).toEqual([]);
  });

  it('catches the real airport map as valid', () => {
    const problems = runValidation({
      manifest,
      mapsDir: join(assetsDir, 'tilemaps'),
      tilesetsDir: join(assetsDir, 'tilesets'),
    });
    expect(problems).toEqual([]);
  });

  it('catches a renamed layer, and points at the near-miss', () => {
    const problems = check((m) => {
      m.layers.find((l) => l.name === 'props_above')!.name = 'Props Above';
    });
    const missing = problems.find((p: string) => p.includes('missing layer "props_above"'));
    expect(missing).toBeDefined();
    expect(missing).toContain('differs in case or spacing');
    expect(problems.some((p: string) => p.includes('not in the layer taxonomy'))).toBe(true);
  });

  it('catches a tileset with no matching image — the silent-empty-layer bug', () => {
    const problems = check((m) => {
      m.tilesets.push({ name: 'airport_tiles', firstgid: 999, image: '../tilesets/airport_tiles.png' });
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('airport_tiles');
    expect(problems[0]).toContain('src/assets/tilesets/airport_tiles.png');
  });

  it('catches a missing required spawn', () => {
    const problems = check((m) => {
      m.layers.find((l) => l.name === 'spawns')!.objects = [{ name: 'gaurd', x: 0, y: 0 }];
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('missing spawn object "player_spawn"');
  });

  it('catches a wrong tile size', () => {
    const problems = check((m) => { m.tilewidth = 16; m.tileheight = 16; });
    expect(problems[0]).toContain('expected 32x32');
  });

  it('catches an infinite map', () => {
    expect(check((m) => { m.infinite = true; })[0]).toContain('infinite');
  });

  it('catches an external .tsx tileset', () => {
    const problems = check((m) => {
      m.tilesets = [{ source: 'shared.tsx' } as never];
    });
    expect(problems.some((p: string) => p.includes('Embed tilesets'))).toBe(true);
  });

  it('warns when the collision stencil is left visible', () => {
    const problems = check((m) => {
      m.layers.find((l) => l.name === 'collision')!.visible = true;
    });
    expect(problems[0]).toContain('is visible');
  });

  it('catches a spawn layer authored as a tile layer', () => {
    const problems = check((m) => {
      m.layers.find((l) => l.name === 'spawns')!.type = 'tilelayer';
    });
    expect(problems[0]).toContain('expected an object layer');
  });
});

describe('tilemap validator — doors and City Pulse slots', () => {
  it('the real maps raise no warnings', () => {
    expect(runWarnings({ manifest, mapsDir: join(assetsDir, 'tilemaps') })).toEqual([]);
  });

  it('warns on a door that is not 32x48 — player height is door height', () => {
    const map = goodMap();
    map.layers.find((l) => l.name === 'spawns')!.objects!.push({ name: 'door_pg', x: 0, y: 0, width: 32, height: 32 } as never);
    const warnings = mapWarnings('test_map', AIRPORT, map);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('expected 32x48');
  });

  it('accepts a 32x48 door, by name or by type', () => {
    const map = goodMap();
    map.layers.find((l) => l.name === 'spawns')!.objects!.push(
      { name: 'door_pg', x: 0, y: 0, width: 32, height: 48 } as never,
      { name: 'front', type: 'door', x: 0, y: 0, width: 32, height: 48 } as never,
    );
    expect(mapWarnings('test_map', AIRPORT, map)).toEqual([]);
  });

  const withPulse = (objects: Array<Record<string, unknown>>) => {
    const map = goodMap();
    map.layers.push({ name: 'Pulse Slots', type: 'objectgroup', visible: true, objects } as never);
    return validateMap('test_map', { ...AIRPORT, pulseLayer: 'Pulse Slots' }, map, TILESETS, 32, manifest.layerOrder);
  };

  it('accepts named, typed, unique City Pulse slots', () => {
    expect(withPulse([{ name: 'wall_1', type: 'wall' }, { name: 'corner_1', type: 'corner' }])).toEqual([]);
  });

  it('catches an unnamed slot, a duplicate slot and an unknown slot type', () => {
    const problems = withPulse([
      { type: 'wall' },
      { name: 'wall_1', type: 'wall' }, { name: 'wall_1', type: 'wall' },
      { name: 'x', type: 'billboard' },
    ]);
    expect(problems.some((p: string) => p.includes('has no name'))).toBe(true);
    expect(problems.some((p: string) => p.includes('declared twice'))).toBe(true);
    expect(problems.some((p: string) => p.includes('type "billboard"'))).toBe(true);
  });

  it('catches a manifest pulseLayer the map does not have', () => {
    const problems = validateMap('test_map', { ...AIRPORT, pulseLayer: 'Pulse Slots' }, goodMap(), TILESETS, 32);
    expect(problems.some((p: string) => p.includes('missing City Pulse object layer'))).toBe(true);
  });
});

describe('the sorted band (render model, ADR-125)', () => {
  const withSorted = (objects: unknown[], sop = true) => {
    const map = goodMap();
    (map.layers.find((l) => l.name === 'sorted') as { objects: unknown[] }).objects = objects;
    return validateMap('test_map', { ...AIRPORT, sop }, map, TILESETS, 32, [], ['test_map__pole', 'test_map__wires']);
  };
  const foot = [{ name: 'footX', value: 0 }, { name: 'footY', value: 30 }, { name: 'footW', value: 8 }, { name: 'footH', value: 6 }];

  it('accepts a placed object, a cutout with a feet line and footprint, and an overhead image', () => {
    expect(withSorted([
      { id: 1, type: 'BENCH', x: 0, y: 0 },
      { id: 2, name: 'pole', type: 'cutout', properties: [{ name: 'image', value: 'test_map__pole' }, { name: 'baseY', value: 40 }, ...foot] },
      { id: 3, name: 'wires', type: 'above', properties: [{ name: 'image', value: 'test_map__wires' }] },
    ])).toEqual([]);
  });

  it('on a migrated map a cutout without a footprint is an error; unmigrated maps are let through', () => {
    const pole = { id: 2, name: 'pole', type: 'cutout', properties: [{ name: 'image', value: 'test_map__pole' }, { name: 'baseY', value: 40 }] };
    expect(withSorted([pole]).some((x: string) => x.includes('no footprint'))).toBe(true);
    expect(withSorted([pole], false)).toEqual([]);
  });

  it('catches legacy shapes, a missing cut-out, a missing baseY and an overhead image that blocks', () => {
    const p = withSorted([
      { id: 1, type: 'solid', x: 0, y: 0, width: 10, height: 10 },
      { id: 2, name: 'tree', type: 'cutout', properties: [{ name: 'image', value: 'test_map__tree' }, ...foot] },
      { id: 3, name: 'wires', type: 'above', properties: [{ name: 'image', value: 'test_map__wires' }, ...foot] },
    ]);
    expect(p.some((x: string) => x.includes('legacy type "solid"'))).toBe(true);
    expect(p.some((x: string) => x.includes('not in src/assets/overlays'))).toBe(true);
    expect(p.some((x: string) => x.includes('no numeric baseY'))).toBe(true);
    expect(p.some((x: string) => x.includes('overhead things never block'))).toBe(true);
  });
});

describe('breath lines (ADR-107)', () => {
  const all = (head_y: number, waist_y: number, enabled = true) =>
    Object.fromEntries(['down', 'left', 'right', 'up'].map((d) => [d, { head_y, waist_y, enabled }]));

  it('accepts lines for every base and breath sheets that belong to a character', () => {
    expect(validateBreath({ player_m: all(24, 32), npc_x: all(22, 30) }, ['player_m_1', 'player_m_2', 'npc_x', 'npc_x__breath'])).toEqual([]);
  });

  it('fails a missing base, an out-of-range waist and a stale breath sheet', () => {
    const p = validateBreath({ npc_x: all(30, 50) }, ['npc_x', 'npc_y', 'npc_z__breath']);
    expect(p.some((x: string) => x.includes('no lines for character "npc_y"'))).toBe(true);
    expect(p.some((x: string) => x.includes('"npc_x" down needs integers'))).toBe(true);
    expect(p.some((x: string) => x.includes('npc_z__breath'))).toBe(true);
  });

  it('lets a disabled direction through without lines', () => {
    expect(validateBreath({ npc_x: all(0, 0, false) }, ['npc_x'])).toEqual([]);
  });
});
