/**
 * Style lock, step 3 (art_pipeline_v1 §2): extract an N-colour master palette
 * from the approved style reference and write it as a GIMP palette (.gpl) —
 * the format Aseprite, Pixelorama, Retro Diffusion and PixelLab all read —
 * plus a swatch PNG and a palette-quantised copy of the image for the audit.
 *
 *   node scripts/extract-palette.mjs <image.png> <out.gpl> [colours=48]
 *
 * Median-cut over every pixel, no dithering; colours sorted dark → light.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { applyPalette, luma, medianCut, toHex } from './art/quantize.mjs';

const [, , input, output, count = '48'] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/extract-palette.mjs <image.png> <out.gpl> [colours]');
  process.exit(1);
}
const n = Number(count);

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const palette = medianCut(data, n, { stride: 2 }).sort((a, b) => luma(a) - luma(b));
const counts = applyPalette(data, palette);

const base = input.split('/').pop();
const lines = [
  'GIMP Palette',
  `Name: Bangalore Times (${palette.length} colours)`,
  'Columns: 8',
  `# Extracted from ${base} by scripts/extract-palette.mjs — the P1 style lock. Every later asset is quantised to this.`,
  ...palette.map((c, i) =>
    `${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\t${toHex(c)} (${counts[i]} px)`),
];
writeFileSync(output, `${lines.join('\n')}\n`);

const stem = output.replace(/\.gpl$/, '');
await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
  .png({ palette: true, compressionLevel: 9 })
  .toFile(`${stem}.quantised.png`);

// Swatch sheet: 8 columns of 32px squares.
const cols = 8, cell = 32;
const rows = Math.ceil(palette.length / cols);
const swatch = Buffer.alloc(cols * cell * rows * cell * 3);
palette.forEach(([r, g, b], i) => {
  const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    const o = ((cy + y) * cols * cell + cx + x) * 3;
    swatch[o] = r; swatch[o + 1] = g; swatch[o + 2] = b;
  }
});
await sharp(swatch, { raw: { width: cols * cell, height: rows * cell, channels: 3 } })
  .png().toFile(`${stem}.swatch.png`);

console.log(`✓ ${output} — ${palette.length} colours from ${base}; ${stem}.quantised.png, ${stem}.swatch.png`);
