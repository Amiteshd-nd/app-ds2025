import { hex, type TokenName } from '../tokens';
import { bitmap, rect, type PixelCtx } from '../kit/pixel';
import type { AreaData, LatLng, PocketPlacement } from '../../utils/types';
import { REGION_GLYPHS } from './glyphs';
import { cellsInside, insidePolygon, MAP_GRID, type Pt } from './projection';

/**
 * The close-up "Area" view (ADR-117): a pocket's real neighbourhood from
 * OpenStreetMap at 1 px per metre, with the playable tilemap drawn on it at
 * true scale. Real angles (no grid snapping) — the point is that someone who
 * knows Prashanth Extension recognises it. Pure.
 */

const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Pixels per metre at area zoom 1×. */
export const AREA_PX_PER_M = 1;

export interface AreaProjection {
  w: number;
  h: number;
  at(p: LatLng): Pt;
  toLatLng(p: Pt): LatLng;
}

export function areaProjection(area: Pick<AreaData, 'centre' | 'radiusM'>, pxPerM = AREA_PX_PER_M): AreaProjection {
  const [lat0, lng0] = area.centre;
  const size = Math.round(area.radiusM * 2 * pxPerM);
  const kx = mPerDegLng(lat0) * pxPerM, ky = M_PER_DEG_LAT * pxPerM;
  return {
    w: size,
    h: size,
    at: ([lat, lng]) => [Math.round(size / 2 + (lng - lng0) * kx), Math.round(size / 2 + (lat0 - lat) * ky)],
    toLatLng: ([x, y]) => [lat0 - (y - size / 2) / ky, lng0 + (x - size / 2) / kx],
  };
}

/**
 * A tile position in the pocket's tilemap → the real point it stands on.
 * +x walks along `bearing`, +y along `bearing + 90` (screen-down is to the
 * right of the lane's direction).
 */
export function pocketToLatLng(p: PocketPlacement, [tx, ty]: [number, number]): LatLng {
  const dx = (tx - p.anchorTile[0]) * p.metresPerTile, dy = (ty - p.anchorTile[1]) * p.metresPerTile;
  const b = (p.bearing * Math.PI) / 180, b2 = ((p.bearing + 90) * Math.PI) / 180;
  const north = dx * Math.cos(b) + dy * Math.cos(b2);
  const east = dx * Math.sin(b) + dy * Math.sin(b2);
  const [lat, lng] = p.anchor;
  return [lat + north / M_PER_DEG_LAT, lng + east / mPerDegLng(lat)];
}

/** The pocket's four corners on the real map (NW, NE, SE, SW of the tilemap). */
export function pocketOutline(p: PocketPlacement): LatLng[] {
  const [w, h] = p.tiles;
  return [[0, 0], [w, 0], [w, h], [0, h]].map((t) => pocketToLatLng(p, t as [number, number]));
}

/** How a road class is drawn: width in px at 1×, colour. Main roads white, lanes grey. */
export const ROAD_STYLE: Record<string, { w: number; tint: TokenName; labelAt1x: boolean }> = {
  trunk: { w: 5, tint: 'map.path', labelAt1x: true },
  primary: { w: 4, tint: 'map.path', labelAt1x: true },
  secondary: { w: 3, tint: 'map.path', labelAt1x: true },
  tertiary: { w: 3, tint: 'hud.border', labelAt1x: true },
  unclassified: { w: 2, tint: 'hud.border', labelAt1x: false },
  residential: { w: 2, tint: 'hud.border', labelAt1x: false },
  living_street: { w: 2, tint: 'hud.border', labelAt1x: false },
};

/** A w-px-thick straight line on whole pixels (Bresenham with a square brush). */
export function thickLine(g: PixelCtx, [x0, y0]: Pt, [x1, y1]: Pt, w: number, colour: string): void {
  g.fillStyle = colour;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  const off = Math.floor(w / 2);
  for (;;) {
    g.fillRect(x - off, y - off, w, w);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Black ground, parks as tree glyphs, water as waves, streets by class (narrow first, main roads on top). */
export function paintArea(g: PixelCtx, area: AreaData, proj: AreaProjection): void {
  rect(g, 0, 0, proj.w, proj.h, hex('map.bg'));
  const field = (outline: LatLng[], kind: 'park' | 'lake') => {
    const { tint, glyphs } = REGION_GLYPHS[kind];
    for (const [x, y] of cellsInside(outline.map((p) => proj.at(p)))) bitmap(g, glyphs[((x + y) / MAP_GRID) % 2], x + 1, y + 1, hex(tint));
  };
  for (const p of area.parks) if (p.outline.length >= 3) field(p.outline, 'park');
  for (const w of area.water) if (w.outline.length >= 3) field(w.outline, 'lake');
  const order = [...area.roads].sort((a, b) => (ROAD_STYLE[a.class]?.w ?? 2) - (ROAD_STYLE[b.class]?.w ?? 2));
  for (const road of order) {
    const style = ROAD_STYLE[road.class] ?? ROAD_STYLE.residential;
    const pts = road.points.map((p) => proj.at(p));
    for (let i = 1; i < pts.length; i++) thickLine(g, pts[i - 1], pts[i], style.w, hex(style.tint));
  }
}

/** The pocket outline: a dashed yellow border (the ★ colour — this is where you can walk). */
export function paintPocket(g: PixelCtx, corners: Pt[]): void {
  const c = hex('map.star');
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    g.fillStyle = c;
    for (let k = 0; k <= n; k++) {
      if (k % 6 >= 4) continue;
      g.fillRect(Math.round(a[0] + ((b[0] - a[0]) * k) / n), Math.round(a[1] + ((b[1] - a[1]) * k) / n), 1, 1);
    }
  }
}

export interface LabelCandidate {
  name: string;
  at: Pt;
  w: number;
}

/**
 * One label per street name, at the middle of its longest piece, main roads
 * first; any label that would overlap one already placed is dropped. At 1×
 * only main roads are named.
 */
export function placeLabels(area: AreaData, proj: AreaProjection, zoom: 1 | 2, measure: (s: string) => number): LabelCandidate[] {
  const best = new Map<string, { len: number; at: Pt; rank: number }>();
  for (const road of area.roads) {
    if (!road.name) continue;
    const style = ROAD_STYLE[road.class] ?? ROAD_STYLE.residential;
    if (zoom === 1 && !style.labelAt1x) continue;
    const pts = road.points.map((p) => proj.at(p));
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const prev = best.get(road.name);
      if (!prev || len > prev.len) best.set(road.name, { len, at: [Math.round((pts[i][0] + pts[i - 1][0]) / 2), Math.round((pts[i][1] + pts[i - 1][1]) / 2)], rank: style.w });
    }
  }
  const placed: Array<LabelCandidate & { box: [number, number, number, number] }> = [];
  for (const [name, b] of [...best.entries()].sort((x, y) => y[1].rank - x[1].rank || y[1].len - x[1].len)) {
    const w = measure(name); // labels are screen text: they do not scale with zoom
    const box: [number, number, number, number] = [b.at[0] * zoom - w / 2 - 2, b.at[1] * zoom - 6, w + 4, 12];
    if (placed.some((p) => box[0] < p.box[0] + p.box[2] && p.box[0] < box[0] + box[2] && box[1] < p.box[1] + p.box[3] && p.box[1] < box[1] + box[3])) continue;
    placed.push({ name, at: b.at, w: measure(name), box });
  }
  return placed.map(({ name, at, w }) => ({ name, at, w }));
}

/** Is a real point inside the pocket's outline? (The dot is shown only when it is.) */
export const insidePocket = (proj: AreaProjection, p: PocketPlacement, at: LatLng): boolean =>
  insidePolygon(proj.at(at), pocketOutline(p).map((c) => proj.at(c)));
