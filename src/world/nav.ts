import type Phaser from 'phaser';
import { buildGrid, CELL, FEET, type Grid, type Rect } from './walkgrid';

/**
 * The live place as grids (ADR-145): everything a character collides with —
 * the collision stencil, collision rects, placed objects, NPC bodies — read
 * from the running physics world, so the infected path through exactly what
 * the player bumps into. `walk` is dilated by the feet box (where a body can
 * stand); `sight` is the bare rects (what blocks a line of sight).
 */
export interface Nav { walk: Grid; sight: Grid }

export function navOf(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap, collisionLayer?: string): Nav {
  const rects: Rect[] = [];
  for (const b of scene.physics.world.staticBodies.getArray()) if (b.width > 0 && b.height > 0) rects.push([b.x, b.y, b.width, b.height]);
  const layer = collisionLayer ? map.getLayer(collisionLayer) : null;
  if (layer?.tilemapLayer) {
    for (const row of layer.data) for (const t of row) if (t.index > 0) rects.push([t.pixelX, t.pixelY, t.width, t.height]);
  }
  const w = map.widthInPixels, h = map.heightInPixels;
  return { walk: buildGrid(rects, w, h, CELL, FEET), sight: buildGrid(rects, w, h, CELL, { w: 0, h: 0 }) };
}

/** A copy of a grid with discs blocked (UV light the infected won't enter). */
export function withDiscs(grid: Grid, discs: Array<{ x: number; y: number; r: number }>): Grid {
  const blocked = grid.blocked.slice();
  for (const d of discs) {
    for (let i = 0; i < blocked.length; i++) {
      const cx = (i % grid.cols) * grid.cell + grid.cell / 2, cy = Math.floor(i / grid.cols) * grid.cell + grid.cell / 2;
      if (Math.hypot(cx - d.x, cy - d.y) <= d.r) blocked[i] = 1;
    }
  }
  return { ...grid, blocked };
}

/**
 * Photophobia as path costs (ADR-159, `data/infected/light.json`): a halo around each UV disc costs more the
 * nearer it gets, so the infected skirt a lamp wide; outdoors by day, a cell more than `shadeTiles` from
 * anything that blocks sight (a wall, a building, cover) is in the sun and costs `sunCost`, so a wanderer keeps
 * to the shade. Returns a copy of `grid` with `cost` set; reachability never changes.
 */
export function withLight(grid: Grid, sight: Grid, discs: Array<{ x: number; y: number; r: number }>, sun: boolean, o: { uvHaloTiles: number; uvHaloCost: number; sunCost: number; shadeTiles: number }, tile = 32): Grid {
  const cost = new Float32Array(grid.blocked.length);
  const halo = o.uvHaloTiles * tile;
  const reach = Math.round((o.shadeTiles * tile) / sight.cell);
  for (let i = 0; i < cost.length; i++) {
    if (grid.blocked[i]) continue;
    const cx = (i % grid.cols) * grid.cell + grid.cell / 2, cy = Math.floor(i / grid.cols) * grid.cell + grid.cell / 2;
    for (const d of discs) {
      const out = Math.hypot(cx - d.x, cy - d.y) - d.r;
      if (out > 0 && out < halo) cost[i] += o.uvHaloCost * (1 - out / halo);
    }
    if (!sun) continue;
    const sx = Math.floor(cx / sight.cell), sy = Math.floor(cy / sight.cell);
    let shade = false;
    for (let dy = -reach; dy <= reach && !shade; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const nx = sx + dx, ny = sy + dy;
      if (nx < 0 || ny < 0 || nx >= sight.cols || ny >= sight.rows || sight.blocked[ny * sight.cols + nx]) { shade = true; break; }
    }
    if (!shade) cost[i] += o.sunCost;
  }
  return { ...grid, cost };
}
