/**
 * Walkability on a grid — pure, no Phaser (ADR-125 feet box, Movie Mode; the infected since ADR-145).
 *
 * The content validator's reachability rule and the Playground's walkthrough
 * bot share this one grid: an 8 px cell is blocked when the 20×12 feet box
 * standing on its centre would overlap any collision rect, placed-object
 * footprint or cut-out footprint. The validator asks "is there a way" (BFS);
 * the bot asks "which way" (A*), so a path the bot walks is exactly a path
 * the validator accepts.
 */
export const CELL = 8;
export const FEET = Object.freeze({ w: 20, h: 12 });
/** Sprite centre → feet-box centre (FEET_BOX offsetY 35 + h/2 − 24). */
export const FEET_DY = 17;

export type Rect = [x: number, y: number, w: number, h: number];
export interface Zone { x: number; y: number; w: number; h: number }

export interface Grid {
  cols: number;
  rows: number;
  cell: number;
  blocked: Uint8Array;
  /** Extra cost to step onto a cell (the infected's photophobia, ADR-159); absent = every free cell costs 1. */
  cost?: Float32Array;
}

/** Mark every cell whose feet box would overlap a rect. */
export function buildGrid(rects: Rect[], widthPx: number, heightPx: number, cell = CELL, feet: { w: number; h: number } = FEET): Grid {
  const cols = Math.ceil(widthPx / cell), rows = Math.ceil(heightPx / cell);
  const blocked = new Uint8Array(cols * rows);
  for (const [x, y, w, h] of rects) {
    const x0 = Math.max(0, Math.floor((x - feet.w / 2) / cell)), x1 = Math.min(cols - 1, Math.floor((x + w + feet.w / 2 - 1) / cell));
    const y0 = Math.max(0, Math.floor((y - feet.h / 2) / cell)), y1 = Math.min(rows - 1, Math.floor((y + h + feet.h / 2 - 1) / cell));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) blocked[cy * cols + cx] = 1;
  }
  return { cols, rows, cell, blocked };
}

/** Cell index under a point (feet-box centre), or -1 outside the grid. */
export function cellAt(grid: Grid, px: number, py: number): number {
  const cx = Math.floor(px / grid.cell), cy = Math.floor(py / grid.cell);
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return -1;
  return cy * grid.cols + cx;
}

export function cellCentre(grid: Grid, index: number): [number, number] {
  const cx = index % grid.cols, cy = (index - cx) / grid.cols;
  return [cx * grid.cell + grid.cell / 2, cy * grid.cell + grid.cell / 2];
}

/** The feet box standing on a cell overlaps the zone (zones often hug a wall's edge). */
export function overlapsZone(grid: Grid, index: number, zone: Zone, feet: { w: number; h: number } = FEET): boolean {
  const [px, py] = cellCentre(grid, index);
  return px + feet.w / 2 > zone.x && px - feet.w / 2 < zone.x + zone.w && py + feet.h / 2 > zone.y && py - feet.h / 2 < zone.y + zone.h;
}

/** A Tiled object as a zone: rectangles as drawn, points as 3×3 tiles around them (Zones.ts default). */
export function zoneOf(obj: { x?: number; y?: number; width?: number; height?: number }, defaultPx = 96): Zone {
  const w = obj.width || defaultPx, h = obj.height || defaultPx;
  return { x: obj.width ? (obj.x ?? 0) : (obj.x ?? 0) - w / 2, y: obj.height ? (obj.y ?? 0) : (obj.y ?? 0) - h / 2, w, h };
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Every rect a character collides with, from a .tmj + its manifest entry:
 * the collision object layer (or tile stencil) and the footprints of sorted
 * cut-outs. Placed objects and NPC bodies exist only at runtime (nav.ts adds them).
 */
export function rectsFromTmj(tmj: Json, def: Json): Rect[] {
  const rects: Rect[] = [];
  const layers: Json[] = tmj.layers ?? [];
  const collision = layers.find((l) => l.name === def.collisionLayer);
  if (collision?.type === 'objectgroup') for (const o of collision.objects ?? []) rects.push([o.x, o.y, o.width, o.height]);
  if (collision?.type === 'tilelayer') {
    for (let i = 0; i < (collision.data ?? []).length; i++) if (collision.data[i]) rects.push([(i % collision.width) * 32, Math.floor(i / collision.width) * 32, 32, 32]);
  }
  const sorted = layers.find((l) => l.name === def.sortedLayer);
  for (const o of sorted?.objects ?? []) {
    const get = (n: string) => o.properties?.find((p: Json) => p.name === n)?.value;
    if (o.type === 'cutout' && typeof get('footX') === 'number') rects.push([get('footX'), get('footY'), get('footW'), get('footH')]);
  }
  return rects;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Breadth-first: is any goal cell reachable from `start`? */
export function bfs(grid: Grid, start: number, goal: (index: number) => boolean): boolean {
  if (start < 0 || start >= grid.blocked.length) return false;
  const seen = new Uint8Array(grid.blocked.length);
  const queue: number[] = [start];
  seen[start] = 1;
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    if (goal(k)) return true;
    const cx = k % grid.cols, cy = (k - cx) / grid.cols;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const n = ny * grid.cols + nx;
      if (seen[n] || grid.blocked[n]) continue;
      seen[n] = 1; queue.push(n);
    }
  }
  return false;
}

/**
 * A* over the 4-connected grid: the shortest path (cell indices, start first)
 * to any cell that satisfies `goal`, or null. `towards` guides the heuristic
 * (the target's point); without it the search is Dijkstra.
 */
export function astar(grid: Grid, start: number, goal: (index: number) => boolean, towards?: [number, number]): number[] | null {
  if (start < 0 || start >= grid.blocked.length) return null;
  if (goal(start)) return [start];
  const n = grid.blocked.length;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (i: number) => {
    if (!towards) return 0;
    const [x, y] = cellCentre(grid, i);
    return (Math.abs(x - towards[0]) + Math.abs(y - towards[1])) / grid.cell;
  };
  // A binary heap keyed by f = g + h.
  const heap: number[] = [];
  const f = new Float64Array(n).fill(Infinity);
  const push = (i: number) => { heap.push(i); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = (): number => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  g[start] = 0; f[start] = h(start); push(start);
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (goal(k)) {
      const path: number[] = [];
      for (let i = k; i !== -1; i = from[i]) path.push(i);
      return path.reverse();
    }
    const cx = k % grid.cols, cy = (k - cx) / grid.cols;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const m = ny * grid.cols + nx;
      if (closed[m] || grid.blocked[m]) continue;
      const cost = g[k] + 1 + (grid.cost ? grid.cost[m] : 0);
      if (cost < g[m]) { g[m] = cost; from[m] = k; f[m] = cost + h(m); push(m); }
    }
  }
  return null;
}

/** The nearest free cell to an index (the player's own cell can sit inside a dilated edge). */
export function nearestFree(grid: Grid, index: number, radius = 3): number {
  if (index >= 0 && !grid.blocked[index]) return index;
  if (index < 0) return -1;
  const cx = index % grid.cols, cy = (index - cx) / grid.cols;
  let best = -1, bestD = Infinity;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
    const i = ny * grid.cols + nx;
    const d = dx * dx + dy * dy;
    if (!grid.blocked[i] && d < bestD) { best = i; bestD = d; }
  }
  return best;
}

/** Drop the cells where the direction does not change: a path becomes its corners. */
export function corners(grid: Grid, path: number[]): Array<[number, number]> {
  if (path.length < 2) return path.map((i) => cellCentre(grid, i));
  const out: Array<[number, number]> = [];
  let prevDir = '';
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dir = `${(b % grid.cols) - (a % grid.cols)},${Math.floor(b / grid.cols) - Math.floor(a / grid.cols)}`;
    if (dir !== prevDir && i > 1) out.push(cellCentre(grid, a));
    prevDir = dir;
  }
  out.push(cellCentre(grid, path[path.length - 1]));
  return out;
}

/** True when every cell under the segment a→b is free (sampled every half cell). */
export function lineFree(grid: Grid, a: [number, number], b: [number, number]): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / (grid.cell / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const idx = cellAt(grid, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (idx < 0 || grid.blocked[idx]) return false;
  }
  return true;
}

/** String-pulling: drop every waypoint that a straight free line can skip, so a staircase becomes a diagonal. */
export function smooth(grid: Grid, points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return points;
  const out: Array<[number, number]> = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !lineFree(grid, points[i], points[j])) j--;
    out.push(points[j]);
    i = j;
  }
  return out;
}
