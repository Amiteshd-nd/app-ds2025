/**
 * Import flat silhouette backdrops (the workday skyline, ADR-121) from
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
import { readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const RAW = join(assets, '_raw/backdrops');
const OUT = join(assets, 'backdrops');

/** Output width (game px) and the palette token index drawn for the shape, per backdrop. */
export const BACKDROPS = {
  skyline_whitefield: { width: 640, colour: 0 }, // palette entry 0 = the darkest ink
};

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
