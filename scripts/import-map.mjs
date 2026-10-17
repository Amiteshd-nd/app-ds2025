/**
 * Import a generated top-down map image into a Tiled map + tileset
 * (art_pipeline_v1 §5 steps 2–3, 7): the "whole scene then grid-snap" path
 * for small places, where every tile is unique and reuse does not matter.
 *
 *   node scripts/import-map.mjs <spec.json>
 *
 * The spec sits next to the raw (src/assets/_raw/maps/<name>.spec.json).
 * `cols`/`rows` choose the output size — and so the SCALE: pick them so the
 * render's furniture matches the 32×48 characters (AUDIT_LOG P5: a cot is
 * ~2 tiles, a chair ~1). With `"units": "px"` every coordinate below is in
 * SOURCE-image pixels, so changing the scale is changing one number:
 *
 *   { "name": "shanthamma_pg", "cols": 10, "rows": 7, "units": "px",
 *     "buildings": [[x, y, w, h], ...],        // wall footprints (collision rects, kind building)
 *     "blocks":    [[x, y, w, h], ...],        // other things feet cannot cross (kind prop)
 *     "spawns":    [{ "name": "door", "x": 1000, "y": 900 }],   // where the FEET stand
 *     "zones":     [{ "name": "bed", "x": 540, "y": 400, "w": 300, "h": 60 }],
 *     "surfaces":  [{ "surface": "gravel", "rect": [x, y, w, h] }],   // footsteps (ADR-140); first match wins, else the place's default
 *     "sorted":    [{ "name": "pole", "rect": [x, y, w, h], "base": y, "footprint": [x, y, w, h],
 *                     "mode": "key" | "rect", "bg": [[x, y, w, h]], "seeds": [[x, y]] }],
 *     "above":     [{ "name": "wires", "rect": [x, y, w, h], "mode": ..., "bg": ..., "seeds": ... }] }
 *
 * The render model (ADR-125): `sorted` cut-outs stand on the ground and
 * Y-sort with characters by `base` (their feet line) and collide through
 * their `footprint`; `above` cut-outs hang over the street and are drawn
 * above everyone, never colliding; `buildings` + `blocks` are the collision
 * rects. Legacy `occluders` import as sorted cut-outs without a footprint.
 *
 * Blocks follow the art: a gate, a pot, a pole BASE, a trunk — never a canopy
 * or the air above a pole. Occluders are the parts that stand up in front of
 * a character who is behind them (pole, canopy, lamp, roof edge): cut out of
 * the render with transparency and depth-sorted by `base` (the line where the
 * thing meets the ground), so the player walks behind them. `mode: "key"`
 * keeps only pixels whose colour is not common in the `bg` sample (the ground
 * behind), optionally only those connected to `seeds`; `mode: "rect"` keeps
 * the whole rectangle (a roof block). Legacy specs (no `units`) use tile
 * coordinates and `solid` tile rects.
 *
 * Output: src/assets/tilesets/<name>.png (unique tiles, 8 per row, on
 * palette.gpl), src/assets/tilemaps/<name>.tmj (Ground, Collision stencil,
 * Spawns, and a `Shapes` object layer of solid rects + occluders) and
 * src/assets/overlays/<name>__<occluder>.png.
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPalette, readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const PALETTE = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));
export const TILE = 32;
const SHEET_COLS = 8;
/** The player's feet box sits 17px below the sprite centre (body 12px tall at offset 35 of 48). */
const FEET_TO_CENTRE = 17;
/** A colour is "ground" if at least this share of the bg sample has it. */
const BG_SHARE = 0.01;

export async function importMap(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { name, cols, rows } = spec;
  const rawPath = join(dirname(specPath), `${name}.png`);
  const W = cols * TILE, H = rows * TILE;
  const meta = await sharp(rawPath).metadata();
  const px = spec.units === 'px';
  // Source → output scale. Legacy specs are already in tiles.
  const sx = px ? W / meta.width : TILE;
  const sy = px ? H / meta.height : TILE;
  const X = (v) => Math.round(v * sx);
  const Y = (v) => Math.round(v * sy);

  // Patches (source px): copy one part of the render over another before the
  // downscale — e.g. carry the entrance mat through a glass wall the model drew
  // closed. Reproducible, so the raw stays the untouched generator output.
  let source = sharp(rawPath);
  if (spec.patches?.length) {
    const { data: rawData, info } = await sharp(rawPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const { from: [fx, fy, fw, fh], to: [tx, ty] } of spec.patches) {
      for (let y = 0; y < fh; y++) {
        const src = ((fy + y) * info.width + fx) * 3, dst = ((ty + y) * info.width + tx) * 3;
        rawData.copy(rawData, dst, src, src + fw * 3);
      }
    }
    source = sharp(rawData, { raw: { width: info.width, height: info.height, channels: 3 } });
  }

  // Downscale with an area filter, then snap every pixel onto the locked palette.
  const { data } = await source
    .resize(W, H, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  applyPalette(data, PALETTE);

  // Cut into tiles, pack 8 per row.
  const count = cols * rows;
  const sheetRows = Math.ceil(count / SHEET_COLS);
  const sheet = Buffer.alloc(SHEET_COLS * TILE * sheetRows * TILE * 3);
  for (let i = 0; i < count; i++) {
    const tx = (i % cols) * TILE, ty = Math.floor(i / cols) * TILE;
    const dx = (i % SHEET_COLS) * TILE, dy = Math.floor(i / SHEET_COLS) * TILE;
    for (let y = 0; y < TILE; y++) {
      const from = ((ty + y) * W + tx) * 3, to = ((dy + y) * SHEET_COLS * TILE + dx) * 3;
      data.copy(sheet, to, from, from + TILE * 3);
    }
  }
  await sharp(sheet, { raw: { width: SHEET_COLS * TILE, height: sheetRows * TILE, channels: 3 } })
    .png({ palette: true, compressionLevel: 9, dither: 0 })
    .toFile(join(assets, 'tilesets', `${name}.png`));

  if (!px) throw new Error(`${name}: legacy tile-unit spec — convert to "units": "px" (ADR-125)`);

  let objectId = 1;
  const spawnObjects = [
    ...(spec.spawns ?? []).map((s) => ({
      id: objectId++, name: s.name, point: true, rotation: 0, type: s.type ?? '', visible: true,
      ...(px
        ? { x: X(s.x), y: Y(s.y) - FEET_TO_CENTRE }
        : { x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE / 2 }),
      width: 0, height: 0,
    })),
    ...(spec.zones ?? []).map((z) => ({
      id: objectId++, name: z.name, rotation: 0, type: z.type ?? '', visible: true,
      x: X(z.x), y: Y(z.y), width: Math.max(1, X(z.x + z.w) - X(z.x)), height: Math.max(1, Y(z.y + z.h) - Y(z.y)),
    })),
    // Footstep surfaces (ADR-139/140): rects named surface_<kind>_<n>, type "surface"; the first that holds the feet wins.
    ...(spec.surfaces ?? []).map((s, i) => ({
      id: objectId++, name: `surface_${s.surface}_${i + 1}`, rotation: 0, type: 'surface', visible: true,
      x: X(s.rect[0]), y: Y(s.rect[1]), width: Math.max(1, X(s.rect[0] + s.rect[2]) - X(s.rect[0])), height: Math.max(1, Y(s.rect[1] + s.rect[3]) - Y(s.rect[1])),
    })),
  ];

  // Collision rects: buildings (whole wall footprints) and prop blocks.
  const rectObject = (kind) => ([x, y, w, h]) => ({
    id: objectId++, name: '', type: kind, rotation: 0, visible: true,
    x: X(x), y: Y(y), width: Math.max(1, X(x + w) - X(x)), height: Math.max(1, Y(y + h) - Y(y)),
    properties: [{ name: 'kind', type: 'string', value: kind }],
  });
  const collisionObjects = [...(spec.buildings ?? []).map(rectObject('building')), ...(spec.blocks ?? []).map(rectObject('prop'))];

  // Cut-outs: `sorted` (feet line + footprint) and `above` (overhead); legacy `occluders` = sorted without a footprint.
  const overlayDir = join(assets, 'overlays');
  mkdirSync(overlayDir, { recursive: true });
  for (const f of readdirSync(overlayDir)) if (f.startsWith(`${name}__`)) rmSync(join(overlayDir, f));
  const sortedObjects = [];
  const cut = async (occ, type) => {
    const [ox, oy, ow, oh] = occ.rect;
    const x0 = X(ox), y0 = Y(oy), w = Math.max(1, X(ox + ow) - x0), h = Math.max(1, Y(oy + oh) - y0);
    const keep = occluderMask(data, W, H, { x0, y0, w, h }, occ, X, Y);
    const rgba = Buffer.alloc(w * h * 4);
    let kept = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!keep[k]) continue;
      const i = ((y0 + y) * W + (x0 + x)) * 3;
      rgba[k * 4] = data[i]; rgba[k * 4 + 1] = data[i + 1]; rgba[k * 4 + 2] = data[i + 2]; rgba[k * 4 + 3] = 255;
      kept++;
    }
    const key = `${name}__${occ.name}`;
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(overlayDir, `${key}.png`));
    const properties = [{ name: 'image', type: 'string', value: key }];
    if (type === 'cutout') {
      properties.push({ name: 'baseY', type: 'int', value: Y(occ.base ?? oy + oh) });
      if (occ.footprint) {
        const [fx, fy, fw, fh] = occ.footprint;
        properties.push(
          { name: 'footX', type: 'int', value: X(fx) }, { name: 'footY', type: 'int', value: Y(fy) },
          { name: 'footW', type: 'int', value: Math.max(1, X(fx + fw) - X(fx)) }, { name: 'footH', type: 'int', value: Math.max(1, Y(fy + fh) - Y(fy)) },
        );
      }
    }
    sortedObjects.push({ id: objectId++, name: occ.name, type, rotation: 0, visible: true, x: x0, y: y0, width: w, height: h, properties });
    if (kept === 0) console.warn(`  ⚠ ${name}: ${type} "${occ.name}" kept no pixels — check its bg/seeds`);
  };
  for (const occ of spec.sorted ?? []) await cut(occ, 'cutout');
  for (const occ of spec.occluders ?? []) await cut(occ, 'cutout');
  for (const occ of spec.above ?? []) await cut(occ, 'above');

  const tileLayer = (layerName, layerData, visible, id) => ({
    data: layerData, height: rows, id, name: layerName, opacity: 1, type: 'tilelayer', visible, width: cols, x: 0, y: 0,
  });
  const objectLayer = (layerName, objects, id, visible = true) => ({
    draworder: 'topdown', id, name: layerName, objects, opacity: 1, type: 'objectgroup', visible, x: 0, y: 0,
  });
  const empty = () => new Array(count).fill(0);
  // The seven layers of the render model, in draw order (ADR-125), plus spawns.
  const map = {
    compressionlevel: -1, height: rows, infinite: false,
    layers: [
      tileLayer('ground', Array.from({ length: count }, (_, i) => i + 1), true, 1),
      tileLayer('ground_detail', empty(), true, 2),
      tileLayer('buildings', empty(), true, 3),
      objectLayer('sorted', sortedObjects, 4),
      tileLayer('props_above', empty(), true, 5),
      objectLayer('collision', collisionObjects, 6, false),
      tileLayer('fx', empty(), true, 7),
      objectLayer('spawns', spawnObjects, 8),
    ],
    nextlayerid: 9, nextobjectid: objectId, orientation: 'orthogonal', renderorder: 'right-down',
    tiledversion: '1.11.0', tileheight: TILE, tilewidth: TILE, type: 'map', version: '1.10', width: cols,
    tilesets: [{
      columns: SHEET_COLS, firstgid: 1, image: `../tilesets/${name}.png`,
      imageheight: sheetRows * TILE, imagewidth: SHEET_COLS * TILE, margin: 0, name, spacing: 0,
      tilecount: count, tileheight: TILE, tilewidth: TILE,
    }],
  };
  writeFileSync(join(assets, 'tilemaps', `${name}.tmj`), `${JSON.stringify(map, null, 1)}\n`);
  const buildings = collisionObjects.filter((o) => o.type === 'building').length;
  const cutouts = sortedObjects.filter((o) => o.type === 'cutout').length;
  const above = sortedObjects.length - cutouts;
  console.log(`✓ ${name}: ${cols}x${rows} tiles (${W}x${H}px) → ${count} tiles, ${buildings} buildings + ${collisionObjects.length - buildings} blocks, ${cutouts} sorted cut-outs, ${above} above, ${spawnObjects.length} spawns/zones`);
}

/**
 * Which pixels of an occluder rectangle stand in front: everything (`rect`),
 * or (`key`) the pixels whose palette colour is rare in the ground sample,
 * kept only where 8-connected to a seed when seeds are given.
 */
export function occluderMask(data, W, H, { x0, y0, w, h }, occ, X, Y) {
  const keep = new Uint8Array(w * h);
  if ((occ.mode ?? 'key') === 'rect') return keep.fill(1);

  const colour = (x, y) => { const i = (y * W + x) * 3; return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; };
  const counts = new Map();
  let total = 0;
  for (const [bx, by, bw, bh] of occ.bg ?? []) {
    for (let y = Y(by); y < Y(by + bh); y++) for (let x = X(bx); x < X(bx + bw); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = colour(x, y);
      counts.set(c, (counts.get(c) ?? 0) + 1);
      total++;
    }
  }
  const ground = new Set([...counts].filter(([, n]) => n / Math.max(1, total) >= (occ.bgShare ?? BG_SHARE)).map(([c]) => c));
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fg[y * w + x] = ground.has(colour(x0 + x, y0 + y)) ? 0 : 1;

  if (!occ.seeds?.length) return fg;
  const queue = [];
  // A seed is "near" its object: start from every foreground pixel within 3px of it.
  for (const [sx, sy] of occ.seeds) {
    const cx = X(sx) - x0, cy = Y(sy) - y0;
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h && fg[y * w + x] && !keep[y * w + x]) { keep[y * w + x] = 1; queue.push(y * w + x); }
    }
  }
  while (queue.length) {
    const k = queue.pop();
    const x = k % w, y = (k - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (fg[n] && !keep[n]) { keep[n] = 1; queue.push(n); }
    }
  }
  return keep;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const spec = process.argv[2];
  if (!spec) { console.error('usage: node scripts/import-map.mjs <spec.json>'); process.exit(1); }
  await importMap(resolve(spec));
}
