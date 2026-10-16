/**
 * Import small prop sheets (objects that move or are placed by behaviours —
 * luggage on the carousel) from src/assets/_raw/props/<name>.png: a strict
 * grid on magenta, one item per cell. Each cell is keyed, trimmed, scaled to
 * the target height and snapped to palette.gpl, then written to
 * src/assets/props/<name>_<nn>.png (loaded by BootScene, keyed by basename).
 *
 *   node scripts/import-props.mjs      (also runs inside `pnpm art`)
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPaletteRGBA, readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const RAW = join(assets, '_raw/props');
const OUT = join(assets, 'props');

/** Grid and target height (game px) per prop sheet; `heights` gives one height per cell when the items differ in size. */
export const SHEETS = {
  luggage: { cols: 4, rows: 3, height: 18 },
  // Hill-flat furniture (ADR-122): cot · table + chair · fridge / induction stove · water drum · cardboard box.
  furniture: { cols: 3, rows: 2, height: 40, heights: [56, 40, 40, 20, 28, 22] },
  // Street props (ADR-123/T-043): the 500-D bus · metro barricade sheets · a pillar under construction · auto · van · rental cycles.
  street_props: { cols: 3, rows: 2, height: 40, heights: [44, 30, 60, 34, 42, 26] },
  // Cubbon Park animals (ADR-123): sleeping dog · sitting dog · standing dog · pigeon · crow · squirrel.
  animals: { cols: 3, rows: 2, height: 20, heights: [16, 24, 20, 10, 12, 12] },
  // The player's scooter (P10, ADR-126): grey facing down · side · back; red and white side views; a petrol pump.
  scooters: { cols: 3, rows: 2, height: 30, heights: [34, 28, 34, 28, 28, 30] },
};

const keyMagenta = (d) => {
  for (let i = 0; i < d.length; i += 4) {
    const dr = 255 - d[i], dg = d[i + 1], db = 255 - d[i + 2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < 110) d[i + 3] = 0;
  }
};

export async function importProps() {
  const palette = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));
  mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const [name, { cols, rows, height, heights }] of Object.entries(SHEETS)) {
    for (const f of readdirSync(OUT)) if (f.startsWith(`${name}_`)) rmSync(join(OUT, f));
    const meta = await sharp(join(RAW, `${name}.png`)).metadata();
    const cw = Math.floor(meta.width / cols), ch = Math.floor(meta.height / rows);
    for (let i = 0; i < cols * rows; i++) {
      const { data, info } = await sharp(join(RAW, `${name}.png`))
        .extract({ left: (i % cols) * cw, top: Math.floor(i / cols) * ch, width: cw, height: ch })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      keyMagenta(data);
      const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
        .then((b) => sharp(b).trim({ threshold: 0 }).toBuffer({ resolveWithObject: true }));
      const h = heights?.[i] ?? height;
      const w = Math.max(1, Math.round(trimmed.info.width * (h / trimmed.info.height)));
      const small = await sharp(trimmed.data).resize(w, h, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
      for (let p = 3; p < small.length; p += 4) small[p] = small[p] >= 128 ? 255 : 0;
      applyPaletteRGBA(small, palette);
      await sharp(small, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 })
        .toFile(join(OUT, `${name}_${String(i + 1).padStart(2, '0')}.png`));
      made++;
    }
  }
  console.log(`✓ props: ${made} images (${Object.keys(SHEETS).join(', ')})`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await importProps();
}
