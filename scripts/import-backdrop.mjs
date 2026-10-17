/**
 * Import backdrops from src/assets/_raw/backdrops/<name>.png. Two kinds:
 *  - silhouettes (the workday skyline, ADR-121), described below;
 *  - stills (`still: true`, the card scenes' illustrations, ADR-136): a full
 *    picture scaled to the game's frame and snapped to its own 32-colour
 *    palette, the way the title art keeps its own (ADR-101).
 *
 * Silhouettes (the workday skyline, ADR-121) come from
 * src/assets/_raw/backdrops/<name>.png: a solid shape on magenta. The magenta
 * is keyed out, the shape becomes one palette colour, and the strip is scaled
 * to the game's width so the sky behind it is drawn by code (tokens), never
 * by the image. Written to src/assets/backdrops/<name>.png (BootScene loads
 * them by basename).
 *
 *   node scripts/import-backdrop.mjs      (also runs inside `pnpm art`)
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPalette, paletteFor, readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const RAW = join(assets, '_raw/backdrops');
const OUT = join(assets, 'backdrops');

/** Output width (game px) and the palette token index drawn for the shape, per backdrop. */
export const BACKDROPS = {
  skyline_whitefield: { width: 640, colour: 0 }, // palette entry 0 = the darkest ink
  still_hebbal_night: { width: 640, height: 360, still: true, colours: 32 }, // 3.1's ride card (ADR-136)
  still_ant_1: { width: 640, height: 360, still: true, colours: 32 }, // 3.3's ant (ADR-138): the spore
  still_ant_2: { width: 640, height: 360, still: true, colours: 32 }, // the climb
  still_ant_3: { width: 640, height: 360, still: true, colours: 32 }, // the clamp
  still_ant_4: { width: 640, height: 360, still: true, colours: 32 }, // the stalk
  still_vikram_locker: { width: 640, height: 360, still: true, colours: 32 }, // the next morning
};

/** A still: cover-crop to width×height, then its own median-cut palette — no magenta, no alpha. */
async function importStill(file, name, def) {
  const { data, info } = await sharp(join(RAW, file)).resize(def.width, def.height, { fit: 'cover', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  applyPalette(data, paletteFor(data, 3, def.colours));
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(OUT, `${name}.png`));
}

const isMagenta = (r, g, b) => Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2) < 120;

export async function importBackdrops() {
  if (!existsSync(RAW)) return 0;
  const palette = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));
  mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const file of readdirSync(RAW).filter((f) => f.endsWith('.png'))) {
    const name = file.replace(/\.png$/, '');
    const def = BACKDROPS[name];
    if (!def) { console.warn(`  ⚠ backdrops/${file} has no entry in import-backdrop.mjs BACKDROPS — skipped`); continue; }
    if (def.still) { await importStill(file, name, def); made++; continue; }
    const meta = await sharp(join(RAW, file)).metadata();
    const w = def.width, h = Math.round((meta.height / meta.width) * w);
    const { data, info } = await sharp(join(RAW, file)).resize(w, h, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const [cr, cg, cb] = palette[def.colour];
    for (let i = 0; i < data.length; i += 4) {
      // Shape = anything that is not the magenta key; drawn as one flat colour.
      const solid = !isMagenta(data[i], data[i + 1], data[i + 2]) && data[i + 3] > 127;
      data[i] = cr; data[i + 1] = cg; data[i + 2] = cb; data[i + 3] = solid ? 255 : 0;
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(OUT, `${name}.png`));
    made++;
  }
  console.log(`✓ ${made} backdrop${made === 1 ? '' : 's'} imported`);
  return made;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await importBackdrops();
}
