/**
 * Import a generated character sheet into the game's 4×4 32×48 contract
 * (art_pipeline_v1 §5 steps 1–3, 6).
 *
 *   node scripts/import-sheet.mjs <raw.png> <name> [--skins]
 *
 * Input: a 3-column × 4-row grid on a flat chroma background (magenta by
 * default — sampled from the corners), rows down / left / right / up, columns
 * [step, idle, step]. Output: src/assets/sprites/<name>.png, 128×192, rows
 * down/left/right/up, columns [stride, idle, opposite stride, idle], every
 * frame bottom-aligned so the shoes end at y=42 (the Player collision box),
 * every pixel one of the locked palette colours.
 *
 * --skins also writes <name>_1..5 with the character's skin remapped onto the
 * five `c.skin.N` ramps, so one generation yields all five tones (P1_P2 §2.2
 * "keep everything else identical so only skin changes").
 *
 * Steps per cell: chroma-key → bounding box → scale so the figure is
 * FIGURE_H tall (area filter: averaging a 250px figure down to 42px is what
 * turns a smooth AI render into pixel art) → quantise to palette.gpl, no
 * dither → paste centred, feet on the baseline.
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearest, readGpl } from './art/quantize.mjs';
import { TOKEN_INDEX } from './art/tokens.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const PALETTE = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));

export const FRAME_W = 32;
export const FRAME_H = 48;
/** Shoes end here (exclusive) — matches the Player body box (offset 6,35 / 20×12). */
export const BASELINE = 42;
/** Figure height in the frame; leaves 2px of headroom above a 40px-tall chibi. */
export const FIGURE_H = 40;
const COLS = 3, ROWS = 4;
const OUT_COLS = [0, 1, 2, 1]; // stride, idle, opposite stride, idle

/** Skin ramps (lit, base, shade) as palette indices, per design-system tone. */
export const SKIN_RAMPS = {
  1: ['skin.1', 'skin.1', 'skin.1.shade'],
  2: ['skin.2', 'skin.2', 'skin.2.shade'],
  3: ['skin.3', 'skin.3', 'skin.3.shade'],
  4: ['skin.4', 'skin.4', 'skin.4.shade'],
  5: ['skin.5', 'skin.5', 'skin.5.shade'],
};
const LIT = { 1: 'plaster.cream', 2: 'skin.1', 3: 'skin.2', 4: 'skin.3', 5: 'skin.4' };

const isChroma = (r, g, b, key) => Math.abs(r - key[0]) < 60 && Math.abs(g - key[1]) < 60 && Math.abs(b - key[2]) < 60;

/** Warm, mid-luminance, R > G > B: the AI's skin colours, before quantisation. */
const isSkin = (r, g, b) => r > 150 && r > g + 15 && g > b + 10 && b > 40 && r - b < 150;

export async function importSheet(rawPath, name, { skins = false } = {}) {
  const { data, info } = await sharp(rawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const key = px(0, 0);

  // Cut each cell out, key the background, and find the figure's box.
  const cellW = W / COLS, cellH = H / ROWS;
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = Math.floor(c * cellW), y0 = Math.floor(r * cellH);
      const x1 = Math.floor((c + 1) * cellW), y1 = Math.floor((r + 1) * cellH);
      let minX = x1, minY = y1, maxX = x0 - 1, maxY = y0 - 1;
      const buf = Buffer.alloc((x1 - x0) * (y1 - y0) * 4);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const [R, G, B, A] = px(x, y);
        const o = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
        if (A === 0 || isChroma(R, G, B, key)) continue; // stays transparent
        buf[o] = R; buf[o + 1] = G; buf[o + 2] = B; buf[o + 3] = 255;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (maxX < minX) throw new Error(`cell r${r} c${c} is empty — is the grid 3×4 on a flat background?`);
      cells.push({ r, c, buf, w: x1 - x0, h: y1 - y0, box: { x: minX - x0, y: minY - y0, w: maxX - minX + 1, h: maxY - minY + 1 } });
    }
  }

  // All frames of a row share one scale (the tallest figure sets it) so the
  // walk does not pulse in size; all rows share it too, so turning does not.
  const tallest = Math.max(...cells.map((c) => c.box.h));
  const scale = FIGURE_H / tallest;

  const frames = [];
  for (const cell of cells) {
    const w = Math.max(1, Math.round(cell.box.w * scale));
    const h = Math.max(1, Math.round(cell.box.h * scale));
    const small = await sharp(cell.buf, { raw: { width: cell.w, height: cell.h, channels: 4 } })
      .extract({ left: cell.box.x, top: cell.box.y, width: cell.box.w, height: cell.box.h })
      .resize(Math.min(w, FRAME_W), Math.min(h, FRAME_H - 2), { kernel: 'lanczos3', fit: 'inside' })
      .raw().toBuffer({ resolveWithObject: true });
    frames.push({ ...cell, small: small.data, sw: small.info.width, sh: small.info.height });
  }

  // Quantise + place. Skin pixels are tagged by band (lit/base/shade) BEFORE
  // quantisation so the tone variants can remap them cleanly afterwards.
  const sheetW = FRAME_W * 4, sheetH = FRAME_H * 4;
  const base = Buffer.alloc(sheetW * sheetH * 4);
  const skinTag = new Uint8Array(sheetW * sheetH); // 0 none, 1 lit, 2 base, 3 shade
  for (const f of frames) {
    const ox = Math.round((FRAME_W - f.sw) / 2);
    const oy = BASELINE - f.sh;
    OUT_COLS.forEach((srcCol, outCol) => {
      if (srcCol !== f.c) return;
      for (let y = 0; y < f.sh; y++) for (let x = 0; x < f.sw; x++) {
        const i = (y * f.sw + x) * 4;
        const a = f.small[i + 3];
        if (a < 128) continue;
        const r = f.small[i], g = f.small[i + 1], b = f.small[i + 2];
        const sx = outCol * FRAME_W + ox + x, sy = f.r * FRAME_H + oy + y;
        if (sx < 0 || sy < 0 || sx >= sheetW || sy >= sheetH) continue;
        const idx = nearest(PALETTE, r, g, b);
        const o = (sy * sheetW + sx) * 4;
        [base[o], base[o + 1], base[o + 2]] = PALETTE[idx];
        base[o + 3] = 255;
        if (isSkin(r, g, b)) {
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          skinTag[sy * sheetW + sx] = l > 200 ? 1 : l > 150 ? 2 : 3;
        }
      }
    });
  }

  mkdirSync(join(assets, 'sprites'), { recursive: true });
  const write = (buf, file) =>
    sharp(buf, { raw: { width: sheetW, height: sheetH, channels: 4 } })
      .png({ palette: true, compressionLevel: 9, dither: 0 })
      .toFile(join(assets, 'sprites', `${file}.png`));

  const written = [];
  if (!skins) {
    await write(base, name);
    written.push(name);
  } else {
    for (const [tone, ramp] of Object.entries(SKIN_RAMPS)) {
      const out = Buffer.from(base);
      const colours = [LIT[tone], ramp[1], ramp[2]].map((t) => PALETTE[TOKEN_INDEX[t]]);
      for (let p = 0; p < skinTag.length; p++) {
        if (!skinTag[p]) continue;
        const o = p * 4;
        [out[o], out[o + 1], out[o + 2]] = colours[skinTag[p] - 1];
      }
      await write(out, `${name}_${tone}`);
      written.push(`${name}_${tone}`);
    }
  }
  const skinPx = skinTag.reduce((n, t) => n + (t ? 1 : 0), 0);
  console.log(`✓ ${written.join(', ')} — scale ${scale.toFixed(3)}, figure ${FIGURE_H}px, ${skinPx} skin px tagged`);
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [, , raw, name, flag] = process.argv;
  if (!raw || !name) {
    console.error('usage: node scripts/import-sheet.mjs <raw.png> <name> [--skins]');
    process.exit(1);
  }
  await importSheet(raw, name, { skins: flag === '--skins' });
}
