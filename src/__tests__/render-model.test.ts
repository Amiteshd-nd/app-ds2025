import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no types
import { validateMap } from '../../scripts/validate-maps.mjs';
import { reachable } from '../../scripts/validate-content.ts';
import { depthForZY, feetY } from '../core/depth';
import { DEPTH, FEET_BOX, LAYERS, LAYER_DEPTH, SPRITE_HEIGHT, SPRITE_WIDTH } from '../utils/constants';

/**
 * The render model (ADR-125): standing things Y-sort by feet Y, overhead
 * things sit above everyone, buildings are walls below + collision, and only
 * the feet box collides.
 */
const character = (x: number, feet: number) => ({ x, y: feet - SPRITE_HEIGHT / 2, displayHeight: SPRITE_HEIGHT, body: { bottom: feet } });

describe('Y-sort: depth = feet Y', () => {
  it('a player behind a lamppost is drawn first; in front, last', () => {
    const lamppostBase = 300;
    const behind = character(100, 280), inFront = character(100, 320);
    expect(depthForZY(feetY(behind))).toBeLessThan(depthForZY(lamppostBase));
    expect(depthForZY(feetY(inFront))).toBeGreaterThan(depthForZY(lamppostBase));
  });

  it('a bus and a player order both ways, and feet come from the body, not the sprite centre', () => {
    const busBottom = 346;
    expect(depthForZY(feetY(character(0, 330)))).toBeLessThan(depthForZY(busBottom));
    expect(depthForZY(feetY(character(0, 360)))).toBeGreaterThan(depthForZY(busBottom));
    const noBody = { y: 100, displayHeight: 48 };
    expect(feetY(noBody)).toBe(124);
  });

  it('the band sits above the buildings and below props_above', () => {
    expect(LAYER_DEPTH[LAYERS.buildings]).toBeLessThan(DEPTH.ENTITIES);
    expect(depthForZY(99_999)).toBeLessThan(LAYER_DEPTH[LAYERS.propsAbove]);
    expect(Object.keys(LAYER_DEPTH).sort()).toEqual(['buildings', 'collision', 'fx', 'ground', 'ground_detail', 'props_above', 'sorted']);
  });
});

describe('the feet box', () => {
  it('is smaller than the sprite and sits at its bottom', () => {
    expect(FEET_BOX.w).toBeLessThan(SPRITE_WIDTH);
    expect(FEET_BOX.h).toBeLessThan(SPRITE_HEIGHT / 2);
    expect(FEET_BOX.offsetY + FEET_BOX.h).toBeLessThanOrEqual(SPRITE_HEIGHT);
    expect(FEET_BOX.offsetY + FEET_BOX.h).toBeGreaterThan(SPRITE_HEIGHT - 4);
  });

  it('no world code sets a numeric depth by hand (the title screen is its own stage)', () => {
    const dirs = ['src/scenes', 'src/world', 'src/entities', 'src/world/behaviours'];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
        if (f === 'TitleScene.ts') continue;
        const src = readFileSync(join(dir, f), 'utf8');
        for (const m of src.matchAll(/setDepth\(\s*(-?\d+(?:\.\d+)?)\s*\)/g)) offenders.push(`${dir}/${f}: setDepth(${m[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('walls, doors and tall tiles in the map validator', () => {
  const W = 4, H = 2;
  const tileset = (tiles: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }>) => ({ name: 'kit', firstgid: 1, tiles });
  const map = (opts: { buildings?: number[]; collision?: number[]; above?: number[]; ground?: number[]; tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }> }) => ({
    tilewidth: 32, tileheight: 32, orientation: 'orthogonal', width: W, height: H,
    tilesets: [tileset(opts.tiles ?? [])],
    layers: [
      { name: 'ground', type: 'tilelayer', width: W, height: H, data: opts.ground ?? new Array(W * H).fill(1) },
      { name: 'ground_detail', type: 'tilelayer', width: W, height: H, data: new Array(W * H).fill(0) },
      { name: 'buildings', type: 'tilelayer', width: W, height: H, data: opts.buildings ?? new Array(W * H).fill(0) },
      { name: 'sorted', type: 'objectgroup', objects: [] },
      { name: 'props_above', type: 'tilelayer', width: W, height: H, data: opts.above ?? new Array(W * H).fill(0) },
      { name: 'collision', type: 'tilelayer', visible: false, width: W, height: H, data: opts.collision ?? new Array(W * H).fill(0) },
      { name: 'fx', type: 'tilelayer', width: W, height: H, data: new Array(W * H).fill(0) },
      { name: 'spawns', type: 'objectgroup', objects: [{ name: 'player_spawn', x: 16, y: 16 }] },
    ],
  });
  const def = { collisionLayer: 'collision', spawnLayer: 'spawns', sortedLayer: 'sorted', requiredSpawns: ['player_spawn'] };
  const order = ['ground', 'ground_detail', 'buildings', 'sorted', 'props_above', 'collision', 'fx'];
  const check = (m: object) => validateMap('t', def, m, ['kit'], 32, order, []);

  it('a wall tile without collision fails; a door tile is the exception', () => {
    expect(check(map({ buildings: [2, 0, 0, 0, 0, 0, 0, 0] })).some((p: string) => p.includes('no collision tile under it'))).toBe(true);
    expect(check(map({ buildings: [2, 0, 0, 0, 0, 0, 0, 0], collision: [1, 0, 0, 0, 0, 0, 0, 0] }))).toEqual([]);
    expect(check(map({ buildings: [3, 0, 0, 0, 0, 0, 0, 0], tiles: [{ id: 2, properties: [{ name: 'door', value: true }] }] }))).toEqual([]);
  });

  it('props_above never collides; a tall tile in a flat layer fails', () => {
    expect(check(map({ above: [5, 0, 0, 0, 0, 0, 0, 0], collision: [1, 0, 0, 0, 0, 0, 0, 0] })).some((p: string) => p.includes('overhead things never block'))).toBe(true);
    const tall = [{ id: 6, properties: [{ name: 'tall', value: true }] }];
    expect(check(map({ ground: [7, 1, 1, 1, 1, 1, 1, 1], tiles: tall })).some((p: string) => p.includes('tall tile in flat layer "ground"'))).toBe(true);
    expect(check(map({ above: [7, 0, 0, 0, 0, 0, 0, 0], tiles: tall }))).toEqual([]);
  });

  it('every one of the seven layers must exist, in order', () => {
    const m = map({});
    m.layers.splice(1, 1); // drop ground_detail
    expect(check(m).some((p: string) => p.includes('missing layer "ground_detail"'))).toBe(true);
  });
});

describe('reachability with the feet box (rule 7)', () => {
  const tmj = (collision: Array<[number, number, number, number]>) => ({
    width: 10, height: 4,
    layers: [
      { name: 'collision', type: 'objectgroup', objects: collision.map(([x, y, width, height], i) => ({ id: i, x, y, width, height })) },
      { name: 'sorted', type: 'objectgroup', objects: [] },
      { name: 'spawns', type: 'objectgroup', objects: [{ name: 'start', x: 40, y: 47 }, { name: 'exit', x: 280, y: 40, width: 32, height: 48 }] },
    ],
  });
  const def = { collisionLayer: 'collision', spawnLayer: 'spawns', sortedLayer: 'sorted' };

  it('a full-height wall seals the way; a wall with a door gap does not', () => {
    expect(reachable(tmj([[160, 0, 16, 128]]), def, 'start', 'exit')).toBe(false);
    expect(reachable(tmj([[160, 0, 16, 40], [160, 88, 16, 40]]), def, 'start', 'exit')).toBe(true);
  });

  it('a gap narrower than the feet box is a wall', () => {
    expect(reachable(tmj([[160, 0, 16, 56], [160, 72, 16, 56]]), def, 'start', 'exit')).toBe(false);
  });
});
