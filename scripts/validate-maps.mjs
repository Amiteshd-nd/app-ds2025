/**
 * Validates Tiled exports against src/assets/maps.manifest.json.
 *
 * Tiled failures are quiet: a renamed layer renders an empty floor, a tileset
 * whose `name` no longer matches its PNG basename renders nothing at all, and
 * a missing spawn drops the player at a hard-coded fallback. None of these
 * throw. This turns every one of them into a build error with a fix in it.
 *
 * Exit code 0 = all maps valid. 1 = at least one problem.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, '../src/assets');
const mapsDir = join(assetsDir, 'tilemaps');
const tilesetsDir = join(assetsDir, 'tilesets');
const spritesDir = join(assetsDir, 'sprites');
const palettePath = join(assetsDir, '_meta', 'palette.gpl');

/** Character sheet contract: 3 columns × 4 rows of 32×48 frames (stride, idle, opposite stride). */
export const SHEET_WIDTH = 96;
export const SHEET_HEIGHT = 192;

/**
 * Palette conformance (design system §10, ADR-61): every opaque pixel of a
 * sprite sheet must be one of the locked colours. Tilesets get the same check
 * as a warning until the pre-lock street set is regenerated (T-021) and the
 * reference airport art is replaced (P3 batch).
 *
 * Pure over a raw RGBA buffer so tests can feed synthetic images.
 */
export function offPaletteColours(rgba, palette) {
  const allowed = new Set(palette.map(([r, g, b]) => (r << 16) | (g << 8) | b));
  const off = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue; // transparent pixels carry no colour
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    if (!allowed.has(key)) off.add(key);
  }
  return [...off].map((k) => `#${k.toString(16).padStart(6, '0')}`);
}

/**
 * Check every PNG in a directory: size (sprites only) and palette. Returns
 * { problems, warnings }; `strict` decides which list a palette miss lands in.
 */
export async function validateImages({ dir, palette, label, expectSize, strict }) {
  const problems = [];
  const warnings = [];
  if (!existsSync(dir)) return { problems, warnings };
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) {
    const image = sharp(join(dir, file)).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    if (expectSize && (info.width !== expectSize[0] || info.height !== expectSize[1])) {
      problems.push(`${label}/${file}: is ${info.width}x${info.height}, expected ${expectSize[0]}x${expectSize[1]} (3 columns x 4 rows of 32x48 frames)`);
    }
    const off = offPaletteColours(data, palette);
    if (off.length) {
      const msg = `${label}/${file}: ${off.length} colour${off.length > 1 ? 's' : ''} outside palette.gpl (e.g. ${off.slice(0, 3).join(', ')}) — quantise it`;
      (strict ? problems : warnings).push(msg);
    }
  }
  return { problems, warnings };
}

/** Kinds of City Pulse slot an event can switch on (city_pulse_v1 §3). */
export const PULSE_SLOT_TYPES = ['wall', 'corner', 'shopfront', 'crowd'];

/** Door = 1 tile wide × 1.5 tall, so the player (32×48) fits the frame (design system §2). */
export const DOOR_WIDTH = 32;
export const DOOR_HEIGHT = 48;

/**
 * Non-fatal findings for one map. Pure, like validateMap. Warnings print but
 * do not fail the build: a mis-sized door is a visual nit to fix in Tiled,
 * not a map the engine cannot load.
 */
export function mapWarnings(mapKey, def, tmj) {
  const warnings = [];
  const spawns = (tmj.layers ?? []).find((l) => l.name === def.spawnLayer);
  for (const obj of spawns?.objects ?? []) {
    const isDoor = obj.type === 'door' || (obj.name ?? '').startsWith('door_');
    if (!isDoor) continue;
    if (obj.width !== DOOR_WIDTH || obj.height !== DOOR_HEIGHT) {
      warnings.push(
        `door "${obj.name || obj.id}" is ${obj.width ?? 0}x${obj.height ?? 0}, expected ${DOOR_WIDTH}x${DOOR_HEIGHT} ` +
          '— player height is door height',
      );
    }
  }
  return warnings.map((w) => `${mapKey}: ${w}`);
}

/** Collect problems for one map. Pure, so tests can drive it directly. */
export function validateMap(mapKey, def, tmj, availableTilesets, tileSize, layerOrder = [], overlays = null) {
  const problems = [];
  const layerNames = (tmj.layers ?? []).map((l) => l.name);

  if (tmj.tilewidth !== tileSize || tmj.tileheight !== tileSize) {
    problems.push(
      `tile size is ${tmj.tilewidth}x${tmj.tileheight}, expected ${tileSize}x${tileSize} ` +
        `— re-export from Tiled with a ${tileSize}px grid`,
    );
  }

  if (tmj.orientation && tmj.orientation !== 'orthogonal') {
    problems.push(`orientation is "${tmj.orientation}", expected "orthogonal"`);
  }

  if (tmj.infinite) {
    problems.push('map is infinite — Phaser needs a fixed-size map (Map > Properties > uncheck Infinite)');
  }

  for (const required of def.requiredLayers ?? []) {
    if (!layerNames.includes(required)) {
      const near = layerNames.find(
        (n) => n.toLowerCase().replace(/\s+/g, '') === required.toLowerCase().replace(/\s+/g, ''),
      );
      problems.push(
        `missing layer "${required}"` +
          (near ? ` — found "${near}", which differs in case or spacing` : ` (has: ${layerNames.join(', ')})`),
      );
    }
  }

  // A layer named outside the taxonomy is a typo or a drift — either way the
  // game will never draw it, and silently ignoring it is how maps rot.
  if (layerOrder.length) {
    const known = new Set([...layerOrder, def.spawnLayer, def.objectLayer, def.pulseLayer, def.shapeLayer].filter(Boolean));
    for (const layer of tmj.layers ?? []) {
      if (!known.has(layer.name)) {
        problems.push(
          `layer "${layer.name}" is not in the layer taxonomy ` +
            `(${layerOrder.join(' → ')}) — rename it in Tiled or add it to maps.manifest.json`,
        );
      }
    }

    // Out-of-order layers render behind or in front of the wrong things.
    const present = (tmj.layers ?? [])
      .filter((l) => layerOrder.includes(l.name))
      .map((l) => l.name);
    const expected = layerOrder.filter((n) => present.includes(n));
    if (present.join(',') !== expected.join(',')) {
      problems.push(
        `layer order is ${present.join(' → ')}, expected ${expected.join(' → ')} ` +
          '— reorder them in Tiled so draw order matches the taxonomy',
      );
    }
  }

  if (def.collisionLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.collisionLayer);
    if (layer && layer.visible) {
      problems.push(
        `collision layer "${def.collisionLayer}" is visible — hide it in Tiled so the stencil does not render`,
      );
    }
  }

  if (def.spawnLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.spawnLayer);
    if (!layer) {
      problems.push(`missing object layer "${def.spawnLayer}"`);
    } else if (layer.type !== 'objectgroup') {
      problems.push(`"${def.spawnLayer}" is a ${layer.type}, expected an object layer`);
    } else {
      const names = (layer.objects ?? []).map((o) => o.name);
      for (const spawn of def.requiredSpawns ?? []) {
        if (!names.includes(spawn)) {
          problems.push(
            `missing spawn object "${spawn}" in "${def.spawnLayer}" (has: ${names.join(', ') || 'none'})`,
          );
        }
      }
    }
  }

  // Generated maps: `solid` blocks and `occluder` cut-outs (scripts/import-map.mjs).
  if (def.shapeLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.shapeLayer);
    if (!layer) {
      problems.push(`missing object layer "${def.shapeLayer}"`);
    } else {
      for (const obj of layer.objects ?? []) {
        if (obj.type !== 'solid' && obj.type !== 'occluder') {
          problems.push(`shape ${obj.id} in "${def.shapeLayer}" has type "${obj.type}", expected solid or occluder`);
        }
        if (obj.type === 'occluder') {
          const image = obj.properties?.find((p) => p.name === 'image')?.value;
          const baseY = obj.properties?.find((p) => p.name === 'baseY')?.value;
          if (!image || (overlays && !overlays.includes(image))) problems.push(`occluder "${obj.name}" image "${image}" is not in src/assets/overlays/`);
          if (typeof baseY !== 'number') problems.push(`occluder "${obj.name}" has no numeric baseY`);
        }
      }
    }
  }

  if (def.objectLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.objectLayer);
    if (!layer) {
      problems.push(`missing object layer "${def.objectLayer}"`);
    } else if (layer.type !== 'objectgroup') {
      problems.push(`"${def.objectLayer}" is a ${layer.type}, expected an object layer`);
    } else {
      for (const obj of layer.objects ?? []) {
        if (!obj.type) {
          problems.push(`placed object ${obj.id} in "${def.objectLayer}" has no type`);
        }
      }
    }
  }

  if (def.pulseLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.pulseLayer);
    if (!layer) {
      problems.push(`missing City Pulse object layer "${def.pulseLayer}"`);
    } else if (layer.type !== 'objectgroup') {
      problems.push(`"${def.pulseLayer}" is a ${layer.type}, expected an object layer`);
    } else {
      const seen = new Set();
      for (const slot of layer.objects ?? []) {
        if (!slot.name) {
          problems.push(`City Pulse slot ${slot.id} in "${def.pulseLayer}" has no name`);
          continue;
        }
        if (seen.has(slot.name)) problems.push(`City Pulse slot "${slot.name}" is declared twice`);
        seen.add(slot.name);
        if (!PULSE_SLOT_TYPES.includes(slot.type)) {
          problems.push(
            `City Pulse slot "${slot.name}" has type "${slot.type ?? ''}", expected one of ${PULSE_SLOT_TYPES.join(', ')}`,
          );
        }
      }
    }
  }

  for (const ts of tmj.tilesets ?? []) {
    if (ts.source) {
      problems.push(
        `tileset "${ts.source}" is an external .tsx — re-export with "Embed tilesets" enabled`,
      );
      continue;
    }
    if (!ts.name) {
      problems.push('a tileset has no name field');
      continue;
    }
    if (!availableTilesets.includes(ts.name)) {
      problems.push(
        `tileset "${ts.name}" has no matching image — expected src/assets/tilesets/${ts.name}.png ` +
          `(available: ${availableTilesets.join(', ')})`,
      );
    }
  }

  return problems.map((p) => `${mapKey}: ${p}`);
}

export function runValidation({ manifest, mapsDir: md, tilesetsDir: td }) {
  const availableTilesets = existsSync(td)
    ? readdirSync(td).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''))
    : [];
  const od = join(td, '..', 'overlays');
  const overlays = existsSync(od) ? readdirSync(od).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')) : [];

  const problems = [];
  for (const [mapKey, def] of Object.entries(manifest.maps ?? {})) {
    const path = join(md, def.file);
    if (!existsSync(path)) {
      problems.push(`${mapKey}: ${def.file} not found in src/assets/tilemaps/`);
      continue;
    }

    let tmj;
    try {
      tmj = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      problems.push(`${mapKey}: ${def.file} is not valid JSON — ${err.message}`);
      continue;
    }

    problems.push(
      ...validateMap(mapKey, def, tmj, availableTilesets, manifest.tileSize, manifest.layerOrder ?? [], overlays),
    );
  }
  return problems;
}

export function runWarnings({ manifest, mapsDir: md }) {
  const warnings = [];
  for (const [mapKey, def] of Object.entries(manifest.maps ?? {})) {
    const path = join(md, def.file);
    if (!existsSync(path)) continue; // runValidation already reports it
    try {
      warnings.push(...mapWarnings(mapKey, def, JSON.parse(readFileSync(path, 'utf8'))));
    } catch {
      // invalid JSON is a problem, reported by runValidation
    }
  }
  return warnings;
}

/**
 * Breath lines (ADR-107): every character base must have head_y/waist_y for
 * all four directions; an enabled direction needs integers with
 * 1 ≤ head_y < waist_y ≤ 46. Every <sheet>__breath must belong to a sheet.
 * `sheets` = sprite basenames on disk.
 */
export function validateBreath(lines, sheets) {
  const problems = [];
  const characters = sheets.filter((s) => !s.includes('__'));
  const bases = [...new Set(characters.map((s) => (s.startsWith('player_') ? s.replace(/_[1-5]$/, '') : s)))];
  for (const base of bases) {
    const entry = lines[base];
    if (base === 'approved') continue;
    if (!entry) { problems.push(`breath.json: no lines for character "${base}" — add head_y/waist_y per direction (or enabled:false)`); continue; }
    for (const dir of ['down', 'left', 'right', 'up']) {
      const d = entry[dir];
      if (!d) { problems.push(`breath.json: "${base}" has no "${dir}" entry`); continue; }
      if (d.enabled === false) continue;
      const ok = Number.isInteger(d.head_y) && Number.isInteger(d.waist_y) && d.head_y >= 1 && d.head_y < d.waist_y && d.waist_y <= 46;
      if (!ok) problems.push(`breath.json: "${base}" ${dir} needs integers 1 ≤ head_y < waist_y ≤ 46 (got ${d.head_y}/${d.waist_y})`);
    }
  }
  for (const s of sheets.filter((x) => x.endsWith('__breath'))) {
    if (!characters.includes(s.replace(/__breath$/, ''))) problems.push(`sprites/${s}.png has no character sheet — stale breath frames`);
  }
  return problems;
}

// Only run when invoked directly, so tests can import the functions above.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifest = JSON.parse(readFileSync(join(assetsDir, 'maps.manifest.json'), 'utf8'));
  const problems = runValidation({ manifest, mapsDir, tilesetsDir });
  const warnings = runWarnings({ manifest, mapsDir });

  const palette = readGpl(readFileSync(palettePath, 'utf8'));
  const sprites = await validateImages({ dir: spritesDir, palette, label: 'sprites', expectSize: [SHEET_WIDTH, SHEET_HEIGHT], strict: true });
  const tilesets = await validateImages({ dir: tilesetsDir, palette, label: 'tilesets', strict: false });
  problems.push(...sprites.problems, ...tilesets.problems);
  const breathPath = join(assetsDir, '_raw/characters/breath.json');
  const spriteNames = existsSync(spritesDir) ? readdirSync(spritesDir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')) : [];
  problems.push(...validateBreath(existsSync(breathPath) ? JSON.parse(readFileSync(breathPath, 'utf8')) : {}, spriteNames));
  warnings.push(...sprites.warnings, ...tilesets.warnings);
  for (const w of warnings) console.warn(`  ⚠ ${w}`);

  if (problems.length) {
    console.error(`\n✗ Tilemap validation failed (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
  }

  const count = Object.keys(manifest.maps ?? {}).length;
  const sheets = existsSync(spritesDir) ? readdirSync(spritesDir).filter((f) => f.endsWith('.png')).length : 0;
  console.log(`✓ ${count} tilemap${count === 1 ? '' : 's'} valid, ${sheets} sprite sheets on palette`);
}
