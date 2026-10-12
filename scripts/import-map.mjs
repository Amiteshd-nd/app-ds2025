/**
 * Import a generated top-down map image into a Tiled map + tileset
 * (art_pipeline_v1 §5 steps 2–3, 7): the "whole scene then grid-snap" path
 * for small interiors, where every tile is unique and reuse does not matter.
 *
 *   node scripts/import-map.mjs <spec.json>
 *
 * The spec (next to the raw, src/assets/_raw/maps/<name>.spec.json) says how
 * many tiles the picture is, which tile rectangles block movement, and where
 * the spawns and zones are — authored by looking at the picture on a grid:
 *
 *   { "name": "whitefield_hotel", "cols": 24, "rows": 16,
 *     "solid": [[x, y, w, h], ...],                    // tile rects that block
 *     "spawns": [{ "name": "door", "x": 11, "y": 14 }],  // tile coords (point)
 *     "zones": [{ "name": "bed", "x": 17, "y": 3, "w": 2, "h": 3 }] }
 *
 * Output: src/assets/tilesets/<name>.png (unique tiles, 8 per row, quantised
 * to palette.gpl, no dither) and src/assets/tilemaps/<name>.tmj (Ground =
 * tiles in reading order; Collision = hidden stencil from `solid`; Spawns =
 * points at tile centres, zones as rectangles). The manifest entry and the
 * district are still authored by hand — they are content, not derivation.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPalette, readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const PALETTE = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));
export const TILE = 32;
const SHEET_COLS = 8;

export async function importMap(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { name, cols, rows } = spec;
  const rawPath = join(dirname(specPath), `${name}.png`);
  const W = cols * TILE, H = rows * TILE;

  // Downscale with an area filter (a 2× render averages to clean 1× pixels),
  // then snap every pixel onto the locked palette.
  const { data } = await sharp(rawPath)
    .resize(W, H, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  applyPalette(data, PALETTE);

  // Cut into tiles, pack 8 per row.
  const count = cols * rows;
  const sheetRows = Math.ceil(count / SHEET_COLS);
  const sheet = Buffer.alloc(SHEET_COLS * TILE * sheetRows * TILE * 3);
  for (let i = 0; i < count; i++) {
    const sx = (i % cols) * TILE, sy = Math.floor(i / cols) * TILE;
    const dx = (i % SHEET_COLS) * TILE, dy = Math.floor(i / SHEET_COLS) * TILE;
    for (let y = 0; y < TILE; y++) {
      const from = ((sy + y) * W + sx) * 3, to = ((dy + y) * SHEET_COLS * TILE + dx) * 3;
      data.copy(sheet, to, from, from + TILE * 3);
    }
  }
  await sharp(sheet, { raw: { width: SHEET_COLS * TILE, height: sheetRows * TILE, channels: 3 } })
    .png({ palette: true, compressionLevel: 9, dither: 0 })
    .toFile(join(assets, 'tilesets', `${name}.png`));

  // Tiled map. Ground is the picture, tile by tile; Collision marks `solid`.
  const ground = Array.from({ length: count }, (_, i) => i + 1);
  const collision = new Array(count).fill(0);
  for (const [x, y, w, h] of spec.solid ?? []) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) collision[yy * cols + xx] = 1;
    }
  }
  const tileLayer = (layerName, layerData, visible, id) => ({
    data: layerData, height: rows, id, name: layerName, opacity: 1, type: 'tilelayer', visible, width: cols, x: 0, y: 0,
  });
  let objectId = 1;
  const objects = [
    ...(spec.spawns ?? []).map((s) => ({
      id: objectId++, name: s.name, point: true, rotation: 0, type: s.type ?? '', visible: true,
      x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE / 2, width: 0, height: 0,
    })),
    ...(spec.zones ?? []).map((z) => ({
      id: objectId++, name: z.name, rotation: 0, type: z.type ?? '', visible: true,
      x: z.x * TILE, y: z.y * TILE, width: z.w * TILE, height: z.h * TILE,
    })),
  ];
  const map = {
    compressionlevel: -1, height: rows, infinite: false,
    layers: [
      tileLayer('Ground', ground, true, 1),
      tileLayer('Walls', new Array(count).fill(0), true, 2),
      tileLayer('Objects', new Array(count).fill(0), true, 3),
      tileLayer('Collision', collision, false, 4),
      tileLayer('Above Player', new Array(count).fill(0), true, 5),
      { draworder: 'topdown', id: 6, name: 'Spawns', objects, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    ],
    nextlayerid: 7, nextobjectid: objectId, orientation: 'orthogonal', renderorder: 'right-down',
    tiledversion: '1.11.0', tileheight: TILE, tilewidth: TILE, type: 'map', version: '1.10', width: cols,
    tilesets: [{
      columns: SHEET_COLS, firstgid: 1, image: `../tilesets/${name}.png`,
      imageheight: sheetRows * TILE, imagewidth: SHEET_COLS * TILE, margin: 0, name, spacing: 0,
      tilecount: count, tileheight: TILE, tilewidth: TILE,
    }],
  };
  writeFileSync(join(assets, 'tilemaps', `${name}.tmj`), `${JSON.stringify(map, null, 1)}\n`);
  const solid = collision.filter(Boolean).length;
  console.log(`✓ ${name}: ${cols}x${rows} tiles → tilesets/${name}.png (${count} tiles), tilemaps/${name}.tmj (${solid} solid, ${objects.length} spawn objects)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const spec = process.argv[2];
  if (!spec) { console.error('usage: node scripts/import-map.mjs <spec.json>'); process.exit(1); }
  await importMap(resolve(spec));
}
