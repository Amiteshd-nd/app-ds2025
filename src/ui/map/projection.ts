import type { CityMapData, LatLng } from '../../utils/types';

/**
 * City → map pixels (P6b, ADR-115). Pure.
 *
 * Equirectangular around the city's middle latitude at `pxPerKm` (16 px/km
 * at 1×), then snapped to an 8px grid: the map is symbolic, so positions are
 * honest to ±250 m and every path runs on the grid. Paths become orthogonal
 * runs (horizontal then vertical, the longer leg first) like the reference's
 * subway-diagram lines.
 */
export const MAP_GRID = 8;
/** Empty border around the drawn city, px. */
export const MAP_PAD = 24;

export type Pt = [x: number, y: number];

export interface Projection {
  w: number;
  h: number;
  /** Unsnapped map px. */
  raw(p: LatLng): Pt;
  /** Snapped to the grid (what everything is drawn at). */
  at(p: LatLng): Pt;
  /** Back from map px to lat/lng (for tests and the legend scale). */
  toLatLng(p: Pt): LatLng;
}

const KM_PER_DEG_LAT = 110.574;

export function project(city: Pick<CityMapData, 'bounds' | 'pxPerKm'>): Projection {
  const { north, south, west, east } = city.bounds;
  const midLat = ((north + south) / 2) * (Math.PI / 180);
  const kmPerDegLng = 111.32 * Math.cos(midLat);
  const sx = kmPerDegLng * city.pxPerKm, sy = KM_PER_DEG_LAT * city.pxPerKm;
  const snap = (v: number) => Math.round(v / MAP_GRID) * MAP_GRID;
  const raw = ([lat, lng]: LatLng): Pt => [MAP_PAD + (lng - west) * sx, MAP_PAD + (north - lat) * sy];
  const w = snap(MAP_PAD * 2 + (east - west) * sx), h = snap(MAP_PAD * 2 + (north - south) * sy);
  return {
    w,
    h,
    raw,
    at: (p) => { const [x, y] = raw(p); return [snap(x), snap(y)]; },
    toLatLng: ([x, y]) => [north - (y - MAP_PAD) / sy, west + (x - MAP_PAD) / sx],
  };
}

/** Orthogonal polyline through snapped points: an L between each pair, consecutive duplicates removed. */
export function orthogonal(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  const push = (p: Pt) => { const last = out[out.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p); };
  points.forEach((p, i) => {
    if (i === 0) { push(p); return; }
    const a = points[i - 1];
    if (a[0] !== p[0] && a[1] !== p[1]) {
      // Longer leg first reads more like the real road's direction.
      push(Math.abs(p[0] - a[0]) >= Math.abs(p[1] - a[1]) ? [p[0], a[1]] : [a[0], p[1]]);
    }
    push(p);
  });
  // Drop collinear middles so corners are only real turns.
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1], b = out[i + 1];
    return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
  });
}

/** Every integer point along an orthogonal polyline, in order (corners once). */
export function walk(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  points.forEach((p, i) => {
    if (i === 0) { out.push(p); return; }
    const [ax, ay] = points[i - 1];
    const dx = Math.sign(p[0] - ax), dy = Math.sign(p[1] - ay);
    const n = Math.max(Math.abs(p[0] - ax), Math.abs(p[1] - ay));
    for (let k = 1; k <= n; k++) out.push([ax + dx * k, ay + dy * k]);
  });
  return out;
}

/** Is a point inside a polygon (even-odd)? Polygons are in map px. */
export function insidePolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Grid cells (top-left corners) whose centre lies inside the polygon. */
export function cellsInside(poly: Pt[]): Pt[] {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs) / MAP_GRID) * MAP_GRID, x1 = Math.max(...xs);
  const y0 = Math.floor(Math.min(...ys) / MAP_GRID) * MAP_GRID, y1 = Math.max(...ys);
  const out: Pt[] = [];
  for (let y = y0; y <= y1; y += MAP_GRID) {
    for (let x = x0; x <= x1; x += MAP_GRID) if (insidePolygon([x + MAP_GRID / 2, y + MAP_GRID / 2], poly)) out.push([x, y]);
  }
  return out;
}
