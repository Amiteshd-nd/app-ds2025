import type { MapNode } from '../../systems/MapManager';
import type { Bitmap } from '../kit/pixel';
import type { TokenName } from '../tokens';
import { POI_GLYPHS, REGION_GLYPHS } from './glyphs';
import type { Pt } from './projection';

/**
 * Fullscreen-map view maths and copy (P6b). Pure: no Phaser.
 */

export type Zoom = 1 | 2;

/** Screen px of a map px at this pan and zoom. */
export const toScreen = ([mx, my]: Pt, pan: Pt, zoom: Zoom): Pt => [pan[0] + mx * zoom, pan[1] + my * zoom];
export const toMap = ([sx, sy]: Pt, pan: Pt, zoom: Zoom): Pt => [(sx - pan[0]) / zoom, (sy - pan[1]) / zoom];

/** Pan that puts map point `m` at screen point `s`. Integer, so pixels stay whole. */
export const panFor = (m: Pt, s: Pt, zoom: Zoom): Pt => [Math.round(s[0] - m[0] * zoom), Math.round(s[1] - m[1] * zoom)];

/** Keep the map from leaving: an edge may come no further than the screen's centre. */
export function clampPan(pan: Pt, zoom: Zoom, map: { w: number; h: number }, screen: { w: number; h: number }): Pt {
  const minX = Math.round(screen.w / 2 - map.w * zoom), maxX = Math.round(screen.w / 2);
  const minY = Math.round(screen.h / 2 - map.h * zoom), maxY = Math.round(screen.h / 2);
  return [Math.max(minX, Math.min(maxX, pan[0])), Math.max(minY, Math.min(maxY, pan[1]))];
}

/** Zooming keeps the map point under `focus` (screen px) where it is. */
export function zoomAbout(pan: Pt, from: Zoom, to: Zoom, focus: Pt): Pt {
  return panFor(toMap(focus, pan, from), focus, to);
}

/** The node nearest a tap, within `radius` screen px (nodes are denser than fingers). */
export function nodeAt(nodes: Array<{ id: string; screen: Pt }>, tap: Pt, radius = 22): string | null {
  let best: string | null = null, bestD = radius * radius;
  for (const n of nodes) {
    const d = (n.screen[0] - tap[0]) ** 2 + (n.screen[1] - tap[1]) ** 2;
    if (d <= bestD) { bestD = d; best = n.id; }
  }
  return best;
}

export interface CardContent {
  title: string;
  /** ★ familiarity, 0–5; districts only. */
  stars: number | null;
  /** ☠ danger, 0–5; Act 4 only. */
  danger: number | null;
  sub: string | null;
}

/** What a node's label card says (map label-card style: UPPERCASE name, ★ row, ☠ row). */
export function cardFor(
  node: MapNode,
  info: { familiarity: number; danger: number | null; lines: Record<string, string>; isHere: boolean; objective?: string },
): CardContent {
  const title = node.label.toUpperCase();
  if (node.kind === 'district') {
    const sub = info.isHere ? 'YOU ARE HERE' : node.state === 'locked' ? 'LOCKED' : null;
    return { title, stars: info.familiarity, danger: info.danger, sub: info.objective ? `★ ${info.objective}` : sub };
  }
  if (node.kind === 'station') return { title, stars: null, danger: null, sub: (node.lines ?? []).map((l) => info.lines[l] ?? l).join(' · ').toUpperCase() };
  return { title, stars: null, danger: null, sub: 'NOT OPEN TO YOU YET' };
}

export interface LegendRow {
  glyph: Bitmap;
  tint: TokenName;
  label: string;
}

/** The toggleable legend: every glyph the map uses, once. */
export const LEGEND: LegendRow[] = [
  { glyph: REGION_GLYPHS.park.glyphs[0], tint: REGION_GLYPHS.park.tint, label: 'Park' },
  { glyph: REGION_GLYPHS.lake.glyphs[0], tint: REGION_GLYPHS.lake.tint, label: 'Lake' },
  { glyph: REGION_GLYPHS.commercial.glyphs[0], tint: REGION_GLYPHS.commercial.tint, label: 'Shops' },
  { glyph: REGION_GLYPHS.it.glyphs[0], tint: REGION_GLYPHS.it.tint, label: 'Tech park' },
  { glyph: REGION_GLYPHS.residential.glyphs[0], tint: REGION_GLYPHS.residential.tint, label: 'Homes' },
  { glyph: REGION_GLYPHS.hill.glyphs[0], tint: REGION_GLYPHS.hill.tint, label: 'Hill' },
  { glyph: ['######', '######'], tint: 'map.path', label: 'Travelled' },
  { glyph: ['##....##', '##....##'], tint: 'map.path', label: 'Not yet' },
  { glyph: ['##..##..', '##..##..'], tint: 'map.metro.purple', label: 'Metro' },
  { glyph: POI_GLYPHS.star.rows, tint: POI_GLYPHS.star.tint, label: 'Objective' },
  { glyph: POI_GLYPHS.home.rows, tint: POI_GLYPHS.home.tint, label: 'Home' },
  { glyph: POI_GLYPHS.chai.rows, tint: POI_GLYPHS.chai.tint, label: 'Chai' },
  { glyph: POI_GLYPHS.bus.rows, tint: POI_GLYPHS.bus.tint, label: 'Bus' },
];
