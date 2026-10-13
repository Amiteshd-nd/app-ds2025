/**
 * Real streets around a pocket, from OpenStreetMap (ADR-117).
 *
 *   node scripts/fetch-osm-area.mjs <districtId>
 *
 * Reads the district's `realworld.area` (centre + radius) from districts.json,
 * asks the public Overpass API for the legible streets (no footpaths, no
 * buildings), parks and water inside that radius, simplifies every line to
 * ~4 m and writes src/data/map/areas/<districtId>.json. Run by hand when a
 * pocket is added or moved — it needs the network, so it is NOT part of
 * `pnpm art` — and commit the result.
 *
 * Licence: the output is OpenStreetMap data, © OpenStreetMap contributors,
 * ODbL 1.0 (https://www.openstreetmap.org/copyright). It stays open data; the
 * game credits it (CREDITS.md, Settings → About). OSM's Overpass usage policy
 * asks for a descriptive User-Agent and light use: one query per pocket.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const USER_AGENT = 'BangaloreTimes-dev/0.1 (map build script; https://github.com/Amiteshd-nd/app-ds2025)';

/** Street classes worth drawing, widest first. Footways, tracks and private service roads are left out. */
export const ROAD_CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street'];
const SIMPLIFY_M = 4;

const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Douglas–Peucker in metres. Points are [lat, lng]. */
export function simplify(points, toleranceM = SIMPLIFY_M) {
  if (points.length < 3) return points;
  const lat0 = points[0][0];
  const xy = points.map(([lat, lng]) => [lng * mPerDegLng(lat0), lat * M_PER_DEG_LAT]);
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bestD = 0;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (bestD > toleranceM) { keep[best] = true; stack.push([a, best], [best, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];

async function overpass(query) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
      lastError = new Error(`${url}: ${res.status} ${text.slice(0, 160)}`);
    } catch (e) { lastError = e; }
  }
  throw lastError;
}

export async function fetchArea(districtId) {
  const districts = JSON.parse(readFileSync(join(root, 'src/data/districts.json'), 'utf8'));
  const d = districts.find((x) => x.id === districtId);
  const area = d?.realworld?.area;
  if (!area) throw new Error(`district "${districtId}" has no realworld.area`);
  const { lat, lng } = d.realworld;
  const dLat = area.radiusM / M_PER_DEG_LAT, dLng = area.radiusM / mPerDegLng(lat);
  const bbox = `${lat - dLat},${lng - dLng},${lat + dLat},${lng + dLng}`;
  const query = `[out:json][timeout:60];(
    way["highway"~"^(${ROAD_CLASSES.join('|')})$"](${bbox});
    way["leisure"="park"](${bbox});
    way["natural"="water"](${bbox});
  );out geom tags;`;
  const data = await overpass(query);

  const roads = [], parks = [], water = [];
  for (const el of data.elements ?? []) {
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = simplify(el.geometry.map((g) => [g.lat, g.lon])).map(round);
    const t = el.tags ?? {};
    if (t.highway) roads.push({ name: t.name ?? null, class: t.highway, points: pts });
    else if (t.leisure === 'park') parks.push({ name: t.name ?? null, outline: pts });
    else if (t.natural === 'water') water.push({ name: t.name ?? null, outline: pts });
  }
  roads.sort((a, b) => ROAD_CLASSES.indexOf(a.class) - ROAD_CLASSES.indexOf(b.class));

  const out = {
    $comment: `OpenStreetMap data, © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Fetched ${new Date().toISOString().slice(0, 10)} by scripts/fetch-osm-area.mjs — legible streets, parks and water within ${area.radiusM} m, simplified to ${SIMPLIFY_M} m. Regenerate, don't hand-edit.`,
    district: districtId,
    centre: [lat, lng],
    radiusM: area.radiusM,
    roads,
    parks,
    water,
  };
  mkdirSync(join(root, 'src/data/map/areas'), { recursive: true });
  writeFileSync(join(root, `src/data/map/areas/${districtId}.json`), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`✓ ${districtId}: ${roads.length} streets (${roads.filter((r) => r.name).length} named), ${parks.length} parks, ${water.length} water — © OpenStreetMap contributors`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const id = process.argv[2];
  if (!id) { console.error('usage: node scripts/fetch-osm-area.mjs <districtId>'); process.exit(1); }
  await fetchArea(id);
}
