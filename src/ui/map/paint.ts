import { hex, type TokenName } from '../tokens';
import { bitmap, rect, type PixelCtx } from '../kit/pixel';
import type { CityMapData } from '../../utils/types';
import type { PathState } from '../../systems/MapManager';
import { REGION_GLYPHS } from './glyphs';
import { cellsInside, MAP_GRID, orthogonal, walk, type Projection, type Pt } from './projection';

/**
 * Map painters (P6b). The base — glyph-field regions, roads, metro lines —
 * is baked into one texture per open; nodes, the route, icons and cards sit
 * on top in the scene. Pure PixelCtx calls.
 */

export type StrokeStyle = 'solid' | 'dotted' | 'dashed';

/** Snapped, orthogonal pixel run for a lat/lng polyline. */
export const runOf = (proj: Projection, points: Array<[number, number]>): Pt[] => orthogonal(points.map((p) => proj.at(p)));

/**
 * A 2px stroke along an orthogonal run. Solid strokes get pixel-rounded
 * corners (the outer corner pixel is knocked back to the map background).
 * Dotted = a 2×2 dot every 6px (undiscovered); dashed = 4 on, 4 off (route).
 */
export function stroke(g: PixelCtx, run: Pt[], colour: string, style: StrokeStyle, bg = hex('map.bg'), phase = 0): void {
  const pts = walk(run);
  g.fillStyle = colour;
  pts.forEach(([x, y], i) => {
    const k = i + phase;
    if (style === 'dotted' && k % 6 !== 0) return;
    if (style === 'dashed' && k % 8 >= 4) return;
    g.fillRect(x - 1, y - 1, 2, 2);
  });
  if (style !== 'solid') return;
  for (let i = 1; i < run.length - 1; i++) {
    const [ax, ay] = run[i - 1], [x, y] = run[i], [bx, by] = run[i + 1];
    const d1 = [Math.sign(x - ax), Math.sign(y - ay)], d2 = [Math.sign(bx - x), Math.sign(by - y)];
    const vx = d1[0] - d2[0], vy = d1[1] - d2[1];
    rect(g, x + (vx > 0 ? 0 : -1), y + (vy > 0 ? 0 : -1), 1, 1, bg);
  }
}

/** 1px coloured dash beside a run (metro accent), offset 2px to the run's right. */
export function accent(g: PixelCtx, run: Pt[], colour: string): void {
  const pts = walk(run);
  g.fillStyle = colour;
  for (let i = 1; i < pts.length; i++) {
    if (i % 4 >= 2) continue;
    const dx = Math.sign(pts[i][0] - pts[i - 1][0]), dy = Math.sign(pts[i][1] - pts[i - 1][1]);
    g.fillRect(pts[i][0] - dy * 2 + (dy > 0 ? -1 : 0), pts[i][1] + dx * 2 + (dx < 0 ? -1 : 0), 1, 1);
  }
}

export interface BaseStates {
  path: (id: string) => PathState;
  line: (id: string) => PathState;
}

/** Everything that does not move: black ground, glyph fields, roads, metro. */
export function paintBase(g: PixelCtx, city: CityMapData, proj: Projection, states: BaseStates): void {
  rect(g, 0, 0, proj.w, proj.h, hex('map.bg'));

  for (const region of city.regions) {
    const { tint, glyphs } = REGION_GLYPHS[region.kind];
    const c = hex(tint);
    for (const [x, y] of cellsInside(region.outline.map((p) => proj.raw(p)))) {
      const variant = ((x + y) / MAP_GRID) % 2;
      bitmap(g, glyphs[variant], x + 1, y + 1, c);
    }
  }

  for (const path of city.paths) {
    const state = states.path(path.id);
    // A path being revealed draws dotted here; the scene animates it solid on top.
    stroke(g, runOf(proj, path.points), hex('map.path'), state === 'travelled' ? 'solid' : 'dotted');
  }

  for (const line of city.metro) {
    const run = runOf(proj, line.stations.map((s) => s.at));
    const colour = hex(line.colour as TokenName);
    if (states.line(line.id) === 'travelled') {
      stroke(g, run, hex('map.path'), 'solid');
      accent(g, run, colour);
    } else {
      stroke(g, run, colour, 'dotted');
    }
  }
}
