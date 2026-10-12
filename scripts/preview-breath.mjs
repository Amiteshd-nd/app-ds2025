/**
 * Breath lines review: detects head_y / waist_y for every character base and
 * direction, flags hands below the waist, and renders F0–F3 at 6× with the
 * lines overlaid for the given bases.
 *   node scripts/preview-breath.mjs <outDir> [base ...]
 */
import sharp from 'sharp';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W, deriveBreath, detect, handsBelowWaist, isSkin, readFrame } from './art/breath.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sprites = resolve(here, '../src/assets/sprites');
const DIRS = ['down', 'left', 'right', 'up'];
const [outDir, ...previewBases] = process.argv.slice(2);


const bases = [...new Set(readdirSync(sprites).filter((f) => f.endsWith('.png') && !f.includes('__'))
  .map((f) => f.replace(/\.png$/, '').replace(/_[1-5]$/, (m) => (f.startsWith('player_') ? '' : m))))].sort();

const BREATH = JSON.parse(readFileSync(resolve(here, '../src/assets/_raw/characters/breath.json'), 'utf8'));
const results = {};
for (const base of bases) {
  const file = base.startsWith('player_') ? `${base}_3.png` : `${base}.png`;
  const { data, info } = await sharp(join(sprites, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const skin = new Set();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] && isSkin(data[i], data[i + 1], data[i + 2])) skin.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  results[base] = {};
  const frames = [];
  const detected = detect(readFrame(data, info.width, 1, 0), isSkin);
  for (const [row, dir] of DIRS.entries()) {
    const f0 = readFrame(data, info.width, 1, row);
    const lines = BREATH[base]?.[dir] ?? detected;
    const { f1, f2, f3, repaired } = deriveBreath(f0, lines);
    results[base][dir] = { ...lines, hands_below_waist: handsBelowWaist(f0, lines.waist_y, skin), repaired };
    frames.push([f0, f1, f2, f3, lines]);
  }
  if (previewBases.includes(base)) {
    const Z = 6, W = 4 * FRAME_W * Z + 3 * 12, H = 4 * FRAME_H * Z + 3 * 12;
    const comps = [];
    let svg = '';
    frames.forEach(([f0, f1, f2, f3, { head_y, waist_y }], row) => {
      [f0, f1, f2, f3].forEach((f, col) => {
        const left = col * (FRAME_W * Z + 12), top = row * (FRAME_H * Z + 12);
        comps.push({ input: sharp(f, { raw: { width: FRAME_W, height: FRAME_H, channels: 4 } }).resize(FRAME_W * Z, FRAME_H * Z, { kernel: 'nearest' }).png(), left, top });
        svg += `<line x1="${left}" y1="${top + head_y * Z}" x2="${left + FRAME_W * Z}" y2="${top + head_y * Z}" stroke="#ff3b3b" stroke-width="2" stroke-dasharray="6,4"/>`;
        svg += `<line x1="${left}" y1="${top + waist_y * Z}" x2="${left + FRAME_W * Z}" y2="${top + waist_y * Z}" stroke="#3bb0ff" stroke-width="2" stroke-dasharray="6,4"/>`;
        svg += `<text x="${left + 4}" y="${top + 14}" font-size="13" fill="#fff" font-family="monospace">F${col} ${DIRS[row]}</text>`;
      });
    });
    const inputs = await Promise.all(comps.map(async (c) => ({ input: await c.input.toBuffer(), left: c.left, top: c.top })));
    inputs.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`), left: 0, top: 0 });
    await sharp({ create: { width: W, height: H, channels: 4, background: '#3a4a3a' } }).composite(inputs).png().toFile(join(outDir, `breath_${base}.png`));
  }
}
// Compact table: one line per base (front-view lines apply to all directions).
for (const [base, dirs] of Object.entries(results)) {
  const d = dirs.down;
  const hands = DIRS.filter((k) => dirs[k].hands_below_waist).join('/') || '-';
  console.log(`${base.padEnd(22)} head_y ${String(d.head_y).padStart(2)}  waist_y ${String(d.waist_y).padStart(2)}  hands-below-waist: ${hands}  seam px repaired: ${DIRS.map((k) => dirs[k].repaired).join('/')}`);
}

// Contact sheet: every base's front idle at 4× with its lines.
const Z = 4, cell = FRAME_W * Z + 8;
const fronts = await Promise.all(bases.map(async (base) => {
  const file = base.startsWith('player_') ? `${base}_3.png` : `${base}.png`;
  const { data, info } = await sharp(join(sprites, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return sharp(readFrame(data, info.width, 1, 0), { raw: { width: FRAME_W, height: FRAME_H, channels: 4 } }).resize(FRAME_W * Z, FRAME_H * Z, { kernel: 'nearest' }).png().toBuffer();
}));
const cols = 10, rowsN = Math.ceil(bases.length / cols);
const CW = cols * cell, CH = rowsN * (FRAME_H * Z + 22);
let svg = '';
const comps = fronts.map((input, i) => {
  const left = (i % cols) * cell, top = Math.floor(i / cols) * (FRAME_H * Z + 22) + 18;
  const { head_y, waist_y } = results[bases[i]].down;
  svg += `<line x1="${left}" y1="${top + head_y * Z}" x2="${left + FRAME_W * Z}" y2="${top + head_y * Z}" stroke="#ff3b3b" stroke-width="2" stroke-dasharray="5,3"/>`;
  svg += `<line x1="${left}" y1="${top + waist_y * Z}" x2="${left + FRAME_W * Z}" y2="${top + waist_y * Z}" stroke="#3bb0ff" stroke-width="2" stroke-dasharray="5,3"/>`;
  svg += `<text x="${left + 2}" y="${top - 5}" font-size="11" fill="#fff" font-family="monospace">${bases[i].replace(/^(npc_|crowd_)/, '')}</text>`;
  return { input, left, top };
});
comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">${svg}</svg>`), left: 0, top: 0 });
await sharp({ create: { width: CW, height: CH, channels: 4, background: '#3a4a3a' } }).composite(comps).png().toFile(join(outDir, 'breath_all_fronts.png'));
