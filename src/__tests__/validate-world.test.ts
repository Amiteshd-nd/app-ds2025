import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateWorld, type WorldInputs } from '../../scripts/validate-content.ts';

const assetsDir = join(__dirname, '..', 'assets');
const dataDir = join(__dirname, '..', 'data');

/** The real manifest, maps and sprites — what the build runs against. */
const realWorld = (): WorldInputs => {
  const manifest = JSON.parse(readFileSync(join(assetsDir, 'maps.manifest.json'), 'utf8'));
  const maps: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(manifest.maps as Record<string, { file: string }>)) {
    maps[key] = JSON.parse(readFileSync(join(assetsDir, 'tilemaps', def.file), 'utf8'));
  }
  const sprites = readdirSync(join(assetsDir, 'sprites'))
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.replace(/\.png$/, ''));
  return { manifest, maps: maps as WorldInputs['maps'], sprites };
};

const realDistricts = () => JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8'));

/** A two-map, two-district synthetic world so each rule can be broken alone. */
const tinyMap = (spawns: Array<Record<string, unknown>>, extraLayers: Array<Record<string, unknown>> = []) => ({
  width: 10, height: 10,
  layers: [
    { name: 'Ground', type: 'tilelayer' },
    { name: 'Spawns', type: 'objectgroup', objects: spawns },
    ...extraLayers,
  ],
});

const world = (): WorldInputs => ({
  manifest: {
    maps: {
      a_map: { file: 'a.tmj', spawnLayer: 'Spawns', objectLayer: 'Objects Layer' },
      b_map: { file: 'b.tmj', spawnLayer: 'Spawns', pulseLayer: 'Pulse Slots' },
    },
  },
  maps: {
    a_map: tinyMap([
      { name: 'player_spawn', x: 1, y: 1 }, { name: 'desk', x: 2, y: 2 }, { name: 'zone_exit', x: 3, y: 3 },
      { name: 'crowd', x: 0, y: 0, width: 64, height: 64 },
    ]),
    b_map: tinyMap([{ name: 'arrive', x: 1, y: 1 }], [
      { name: 'Pulse Slots', type: 'objectgroup', objects: [{ name: 'wall_1', type: 'wall', x: 0, y: 0 }] },
    ]),
  },
  sprites: ['citizen'],
  startDistrict: 'a',
});

const districts = () => [
  {
    id: 'a', name: 'A', map: 'a_map', defaultSpawn: 'player_spawn',
    npcs: [{ id: 'npc1', spawn: 'desk' }],
    exits: [{ zone: 'zone_exit', to: 'b', spawn: 'arrive', transit: 'bus' }],
    ambient: { base: ['citizen'], count: 3, area: 'crowd' },
  },
  { id: 'b', name: 'B', map: 'b_map', defaultSpawn: 'arrive', pulse_slots: ['wall_1'] },
];

const run = (mutate: (ds: ReturnType<typeof districts>, w: WorldInputs) => void = () => {}) => {
  const ds = districts();
  const w = world();
  mutate(ds, w);
  return validateWorld(ds, w);
};

describe('world validator — districts × maps', () => {
  it('passes the real districts against the real maps', () => {
    const report = validateWorld(realDistricts(), realWorld());
    expect(report.problems).toEqual([]);
  });

  it('accepts a well-formed synthetic world', () => {
    expect(run().problems).toEqual([]);
  });

  it('catches a district whose map is not in the manifest', () => {
    const { problems } = run((ds) => { ds[0].map = 'ghost_map'; });
    expect(problems.some((p) => p.includes('names map "ghost_map"'))).toBe(true);
  });

  it('catches a defaultSpawn that was renamed in Tiled', () => {
    const { problems } = run((ds) => { ds[0].defaultSpawn = 'player_spwan'; });
    expect(problems.some((p) => p.includes('defaultSpawn "player_spwan"'))).toBe(true);
  });

  it('catches an NPC placed on a spawn the map does not have', () => {
    const { problems } = run((ds) => { ds[0].npcs![0].spawn = 'counter'; });
    expect(problems.some((p) => p.includes('NPC "npc1" spawn "counter"'))).toBe(true);
  });

  it('catches an exit zone missing from the map', () => {
    const { problems } = run((ds) => { ds[0].exits![0].zone = 'door'; });
    expect(problems.some((p) => p.includes('exit zone "door"'))).toBe(true);
  });

  it('catches an exit that lands on a spawn the destination map lacks', () => {
    const { problems } = run((ds) => { ds[0].exits![0].spawn = 'bus_stop'; });
    expect(problems.some((p) => p.includes('lands on spawn "bus_stop" in "b"'))).toBe(true);
  });

  it('catches an ambient sheet with no PNG on disk', () => {
    const { problems } = run((ds) => { ds[0].ambient!.base = ['citizen_neon']; });
    expect(problems.some((p) => p.includes('sprites/citizen_neon.png'))).toBe(true);
  });

  it('catches an ambient area drawn as a point instead of a rectangle', () => {
    const { problems } = run((_, w) => {
      const layer = (w.maps.a_map as { layers: Array<{ name: string; objects?: Array<Record<string, unknown>> }> }).layers[1];
      layer.objects!.find((o) => o.name === 'crowd')!.width = 0;
    });
    expect(problems.some((p) => p.includes('is a point'))).toBe(true);
  });

  it('catches a City Pulse slot the map does not carry', () => {
    const { problems } = run((ds) => { ds[1].pulse_slots = ['corner_9']; });
    expect(problems.some((p) => p.includes('City Pulse slot "corner_9"'))).toBe(true);
  });

  it('catches a district offering slots on a map with no pulse layer', () => {
    const { problems } = run((ds) => { ds[0].pulse_slots = ['wall_1']; });
    expect(problems.some((p) => p.includes('declares no pulseLayer'))).toBe(true);
  });

  it('catches a district nobody can reach — the dead-end class of bug, inverted', () => {
    const { problems } = run((ds) => { ds[0].exits = []; });
    expect(problems.some((p) => p.includes('district "b" is unreachable from "a"'))).toBe(true);
  });

  it('catches a start district that does not exist', () => {
    const { problems } = run((_, w) => { w.startDistrict = 'nowhere'; });
    expect(problems.some((p) => p.includes('start district "nowhere"'))).toBe(true);
  });

  it('warns, not fails, when a district is an empty screen (ADR-40)', () => {
    const report = run((ds, w) => {
      (w.maps.b_map as { width: number; height: number }).width = 50;
      (w.maps.b_map as { width: number; height: number }).height = 40;
      ds[1].pulse_slots = [];
    });
    expect(report.problems).toEqual([]);
    expect(report.warnings.some((m) => m.includes('district "b"') && m.includes('ADR-40'))).toBe(true);
  });
});
