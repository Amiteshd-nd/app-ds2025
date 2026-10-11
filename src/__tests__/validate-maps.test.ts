import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs script, no types
import { validateMap, runValidation, mapWarnings, runWarnings } from '../../scripts/validate-maps.mjs';

const assetsDir = join(__dirname, '..', 'assets');
const manifest = JSON.parse(readFileSync(join(assetsDir, 'maps.manifest.json'), 'utf8'));

const AIRPORT = manifest.maps.airport_map;
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
    { name: 'Ground', type: 'tilelayer', visible: true },
    { name: 'Walls', type: 'tilelayer', visible: true },
    { name: 'Objects', type: 'tilelayer', visible: true },
    { name: 'Collision', type: 'tilelayer', visible: false },
    { name: 'Above Player', type: 'tilelayer', visible: true },
    { name: 'Spawns', type: 'objectgroup', visible: true, objects: [{ name: 'player_spawn', x: 1, y: 1 }] },
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
      m.layers.find((l) => l.name === 'Above Player')!.name = 'above player';
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('missing layer "Above Player"');
    expect(problems[0]).toContain('differs in case or spacing');
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
      m.layers.find((l) => l.name === 'Spawns')!.objects = [{ name: 'gaurd', x: 0, y: 0 }];
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
      m.layers.find((l) => l.name === 'Collision')!.visible = true;
    });
    expect(problems[0]).toContain('is visible');
  });

  it('catches a spawn layer authored as a tile layer', () => {
    const problems = check((m) => {
      m.layers.find((l) => l.name === 'Spawns')!.type = 'tilelayer';
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
    map.layers.find((l) => l.name === 'Spawns')!.objects!.push({ name: 'door_pg', x: 0, y: 0, width: 32, height: 32 } as never);
    const warnings = mapWarnings('test_map', AIRPORT, map);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('expected 32x48');
  });

  it('accepts a 32x48 door, by name or by type', () => {
    const map = goodMap();
    map.layers.find((l) => l.name === 'Spawns')!.objects!.push(
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
