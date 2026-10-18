/**
 * Import a generated character sheet into the game's 4×4 32×48 contract
 * (art_pipeline_v1 §5 steps 1–3, 6).
 *
 *   node scripts/import-sheet.mjs <raw.png> <name> [--skins]
 *
 * Input: a 3-column × 4-row grid on a flat chroma background (magenta by
 * default — sampled from the corners), rows down / left / right / up, columns
 * [step, idle, step]. Output: src/assets/sprites/<name>.png, 96×192, rows
 * down/left/right/up, columns [stride, idle, opposite stride] (one idle per
 * row — AUDIT_LOG P2 round 2), every frame bottom-aligned so the shoes end
 * at y=42 (the Player collision box), every pixel a locked palette colour.
 *
 * A walk must alternate. If a row's two strides come out near-identical (the
 * generator tends to draw the same leg forward twice), the opposite stride is
 * synthesised from the first: the leg band (below the hips) is mirrored about
 * the figure's centre, so the near leg goes back and the far leg comes
 * forward, while head and torso stay as drawn.
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
/**
 * The one exception to 32×48 (ADR-159, NEED_TO_AUDIT #20 call 4): the Host is a large character — 48×64 frames,
 * a 144×256 sheet, shoes at y=58, a 56 px figure. Only sheets named `inf_host*` are large (the validator holds it).
 */
export const LARGE = Object.freeze({ w: 48, h: 64, baseline: 58, figure: 56 });
export const isLarge = (name) => /^inf_host/.test(name);
const COLS = 3, ROWS = 4;
const OUT_COLS = [0, 1, 2]; // stride, idle, opposite stride
/** Two strides closer than this (fraction of differing pixels) do not alternate. */
const STRIDE_MIN_DIFF = 0.12;
/** The leg band starts this far down the figure (hips), as a fraction of its height. */
const HIP_FRACTION = 0.68;

/** Skin ramps (lit, base, shade) as palette indices, per design-system tone. */
export const SKIN_RAMPS = {
  1: ['skin.1', 'skin.1', 'skin.1.shade'],
  2: ['skin.2', 'skin.2', 'skin.2.shade'],
  3: ['skin.3', 'skin.3', 'skin.3.shade'],
  4: ['skin.4', 'skin.4', 'skin.4.shade'],
  5: ['skin.5', 'skin.5', 'skin.5.shade'],
};
const LIT = { 1: 'plaster.cream', 2: 'skin.1', 3: 'skin.2', 4: 'skin.3', 5: 'skin.4' };

/**
 * Background pixel: near the sampled key colour, OR any magenta-hued pixel —
 * the anti-aliased fringe between figure and background is darker magenta
 * ([143,6,143]…) that a plain distance test keeps, and it then reads as a
 * purple outline and, worse, as "not grey" around a shadow blob.
 */
const isChroma = (r, g, b, key) =>
  (Math.abs(r - key[0]) < 60 && Math.abs(g - key[1]) < 60 && Math.abs(b - key[2]) < 60) ||
  (r > 40 && b > 40 && g < Math.min(r, b) * 0.45 && Math.abs(r - b) < 70);

/** Warm, R > G > B, not near-black: the AI's skin colours, before quantisation. */
const isSkin = (r, g, b) => r > 110 && r > g + 12 && g > b + 8 && b > 25 && r - b < 160;

/**
 * A grey, low-saturation, mid-value pixel: the drop shadow generators add
 * under the feet even when told not to. Shoes are darker (value < 0.28) and
 * clothes are saturated, so neither trips this.
 */
const isShadow = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const val = max / 255;
  return sat < 0.18 && val > 0.28 && val < 0.85;
};

export async function importSheet(rawPath, name, { skins = false, still = false, large = isLarge(name) } = {}) {
  // The large class (the Host, ADR-159): 48×64 frames, the same 3×4 layout, shoes 6 px above the frame's foot.
  const { w: FW, h: FH, baseline: BL, figure: FIG } = large ? LARGE : { w: FRAME_W, h: FRAME_H, baseline: BASELINE, figure: FIGURE_H };
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

      // Trim a drop shadow, two ways. (1) Detached: a low-saturation blob
      // sitting below a fully transparent row inside the box — remove it
      // whole. (2) Attached: trailing rows that are all shadow-grey. Either
      // way the figure's shoes — not its shadow — land on the baseline.
      const cw = x1 - x0;
      const rowStats = (y) => {
        let opaque = 0, grey = 0;
        for (let x = minX; x <= maxX; x++) {
          const o = ((y - y0) * cw + (x - x0)) * 4;
          if (buf[o + 3] === 0) continue;
          opaque++;
          const R = buf[o], G = buf[o + 1], B = buf[o + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          // Achromatic: low saturation, or so dark that hue is noise — the
          // generator's shadows are near-black with a magenta tinge.
          if (max < 64 || (max - min) / max < 0.25) grey++;
        }
        return { opaque, grey };
      };
      let bottom = maxY;
      // A shadow may itself contain a transparent row (soft edges), so keep
      // removing detached achromatic blobs from the bottom until the lowest
      // thing left is part of the figure.
      for (let pass = 0; pass < 8; pass++) {
        let gap = -1;
        for (let y = bottom; y > minY; y--) if (rowStats(y).opaque === 0) { gap = y; break; }
        if (gap < 0) break;
        let opaque = 0, grey = 0;
        for (let yy = gap + 1; yy <= bottom; yy++) { const st = rowStats(yy); opaque += st.opaque; grey += st.grey; }
        if (opaque === 0 || grey / opaque <= 0.85) break;
        for (let yy = gap + 1; yy <= bottom; yy++) for (let x = minX; x <= maxX; x++) buf[((yy - y0) * cw + (x - x0)) * 4 + 3] = 0;
        bottom = gap - 1;
        while (bottom > minY && rowStats(bottom).opaque === 0) bottom--;
      }
      while (bottom > minY) {
        let opaque = 0, shadow = 0; // attached shadow: mid-grey trailing rows
        for (let x = minX; x <= maxX; x++) {
          const o = ((bottom - y0) * cw + (x - x0)) * 4;
          if (buf[o + 3] === 0) continue;
          opaque++;
          if (isShadow(buf[o], buf[o + 1], buf[o + 2])) shadow++;
        }
        if (opaque === 0 || shadow / opaque < 0.9) break;
        for (let x = minX; x <= maxX; x++) buf[((bottom - y0) * cw + (x - x0)) * 4 + 3] = 0;
        bottom--;
      }
      maxY = bottom;
      cells.push({ r, c, buf, w: cw, h: y1 - y0, box: { x: minX - x0, y: minY - y0, w: maxX - minX + 1, h: maxY - minY + 1 } });
    }
  }

  // All frames of a row share one scale (the tallest figure sets it) so the
  // walk does not pulse in size; all rows share it too, so turning does not.
  const tallest = Math.max(...cells.map((c) => c.box.h));
  const scale = FIG / tallest;
  const heights = cells.map((c) => c.box.h);

  const frames = [];
  for (const cell of cells) {
    const w = Math.max(1, Math.round(cell.box.w * scale));
    const h = Math.max(1, Math.round(cell.box.h * scale));
    const small = await sharp(cell.buf, { raw: { width: cell.w, height: cell.h, channels: 4 } })
      .extract({ left: cell.box.x, top: cell.box.y, width: cell.box.w, height: cell.box.h })
      .resize(Math.min(w, FW), Math.min(h, FH - 2), { kernel: 'lanczos3', fit: 'inside' })
      .raw().toBuffer({ resolveWithObject: true });
    frames.push({ ...cell, small: small.data, sw: small.info.width, sh: small.info.height });
  }

  // Quantise + place. Skin pixels are tagged by band (lit/base/shade) BEFORE
  // quantisation so the tone variants can remap them cleanly afterwards.
  const sheetW = FW * OUT_COLS.length, sheetH = FH * 4;
  const base = Buffer.alloc(sheetW * sheetH * 4);
  const skinTag = new Uint8Array(sheetW * sheetH); // 0 none, 1 lit, 2 base, 3 shade
  for (const f of frames) {
    const ox = Math.round((FW - f.sw) / 2);
    const oy = BL - f.sh;
    OUT_COLS.forEach((srcCol, outCol) => {
      if (srcCol !== f.c) return;
      for (let y = 0; y < f.sh; y++) for (let x = 0; x < f.sw; x++) {
        const i = (y * f.sw + x) * 4;
        const a = f.small[i + 3];
        if (a < 128) continue;
        const r = f.small[i], g = f.small[i + 1], b = f.small[i + 2];
        const sx = outCol * FW + ox + x, sy = f.r * FH + oy + y;
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

  // Stride alternation check per row; synthesise when the generator repeated itself.
  const synthesised = [];
  const frameAt = (col, row) => ({ x0: col * FW, y0: row * FH });
  for (let row = 0; row < ROWS; row++) {
    const a = frameAt(0, row), b = frameAt(2, row);
    let differ = 0, opaque = 0;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const ia = ((a.y0 + y) * sheetW + a.x0 + x) * 4, ib = ((b.y0 + y) * sheetW + b.x0 + x) * 4;
      const oa = base[ia + 3] > 0, ob = base[ib + 3] > 0;
      if (oa || ob) opaque++;
      if (oa !== ob || base[ia] !== base[ib] || base[ia + 1] !== base[ib + 1] || base[ia + 2] !== base[ib + 2]) differ++;
    }
    // A figure that never walks (`*_bed`: lying in a ward bed, ADR-137) keeps its identical cells.
    if (still || opaque === 0 || differ / opaque >= STRIDE_MIN_DIFF) continue;

    // Copy stride A into C, then mirror its leg band about the figure centre.
    let minX = FW, maxX = -1;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (base[((a.y0 + y) * sheetW + a.x0 + x) * 4 + 3] > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    const hipY = BL - Math.round(FIG * (1 - HIP_FRACTION));
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const srcX = y >= hipY ? minX + maxX - x : x;
      const ib = ((b.y0 + y) * sheetW + b.x0 + x) * 4;
      if (srcX < 0 || srcX >= FW) { base[ib + 3] = 0; skinTag[(b.y0 + y) * sheetW + b.x0 + x] = 0; continue; }
      const ia = ((a.y0 + y) * sheetW + a.x0 + srcX) * 4;
      base.copy(base, ib, ia, ia + 4);
      skinTag[(b.y0 + y) * sheetW + b.x0 + x] = skinTag[(a.y0 + y) * sheetW + a.x0 + srcX];
    }
    synthesised.push(['down', 'left', 'right', 'up'][row]);
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
  console.log(
    `✓ ${written.join(', ')} — scale ${scale.toFixed(3)} (cell heights ${Math.min(...heights)}–${Math.max(...heights)}px), figure ${FIG}px, ${skinPx} skin px tagged` +
      (synthesised.length ? `; opposite stride synthesised for: ${synthesised.join(', ')}` : '; both strides drawn'),
  );
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [, , raw, name, flag] = process.argv;
  if (!raw || !name) {
    console.error('usage: node scripts/import-sheet.mjs <raw.png> <name> [--skins]');
    process.exit(1);
  }
  await importSheet(raw, name, { skins: flag === '--skins', still: name.endsWith('_bed') });
}
