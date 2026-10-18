/**
 * The infected recipe (ADR-147; the user's infected spec §0 and step 2;
 * ADR-28's automated recipe): a person's own 96×192 sheet → their Fresh or
 * Degraded self, so former people keep their clothes and props (chai Anna's
 * kettle) and nobody needs new art.
 *
 *   Fresh     almost human — a little colour gone, a grey-green pallor, pale eyes
 *   Degraded  half the colour gone, green skin, pale eyes, 5–10 torn pixels at
 *             the silhouette's edge, 2–3 dark stains, the upper body 1 px off balance
 *
 * Every output pixel is a palette.gpl colour; every choice is seeded by the
 * sheet's name, so a rerun is byte-identical. Torn pixels and stains sit at
 * the same place in all three frames of a direction (they don't flicker).
 *
 *   node scripts/infected-recipe.mjs            (all sources in src/data/infected/looks.json)
 *   node scripts/infected-recipe.mjs <sheet>    (one)
 */
import sharp from 'sharp';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearest, readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const PALETTE = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));
const TOKENS = JSON.parse(readFileSync(join(assets, '_meta/tokens.json'), 'utf8')).tokens;
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SKIN = new Set(Object.entries(TOKENS).filter(([k]) => /^skin\.\d(\.shade)?$/.test(k)).map(([, v]) => v.toLowerCase()));
const FW = 32, FH = 48, COLS = 3, ROWS = 4;

export const STAGES = {
  fresh: { desat: 0.15, pallor: 0.3, eyes: true, torn: [0, 0], stains: [0, 0], lean: 0 },
  degraded: { desat: 0.5, pallor: 0.65, eyes: true, torn: [5, 10], stains: [2, 3], lean: 1 },
};
/** The grey-green the skin is pulled toward. */
const PALLOR = [120, 128, 104];
const PALE_EYE = hexRgb(TOKENS['sky.moon'] ?? '#e1d4bf');
const STAIN = hexRgb(TOKENS['brick.shade'] ?? '#804e35');

const seeded = (text) => { let h = 0x811c9dc5; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); } let s = h >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const q = (r, g, b) => PALETTE[nearest(PALETTE, r, g, b)];
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export async function infectSheet(sheet, stageName) {
  const stage = STAGES[stageName];
  const src = join(assets, 'sprites', `${sheet}.png`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = new Uint8ClampedArray(data);
  const at = (x, y) => (y * W + x) * 4;
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && px[at(x, y) + 3] > 0;
  const isSkin = (x, y) => { const i = at(x, y); return px[i + 3] > 0 && SKIN.has(hex(px[i], px[i + 1], px[i + 2])); };
  const rng = seeded(`${sheet}:${stageName}`);

  // 1. Colour: desaturate everything a little or a lot; pull skin toward a grey-green pallor.
  const skinMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y);
    if (!px[i + 3]) continue;
    let r = px[i], g = px[i + 1], b = px[i + 2];
    const skin = isSkin(x, y);
    skinMask[y * W + x] = skin ? 1 : 0;
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r += (l - r) * stage.desat; g += (l - g) * stage.desat; b += (l - b) * stage.desat;
    if (skin) { const k = stage.pallor; const lum = l / 160; r += (PALLOR[0] * lum - r) * k; g += (PALLOR[1] * lum - g) * k; b += (PALLOR[2] * lum - b) * k; }
    const [qr, qg, qb] = q(Math.round(r), Math.round(g), Math.round(b));
    px[i] = qr; px[i + 1] = qg; px[i + 2] = qb;
  }

  for (let row = 0; row < ROWS; row++) {
    // Per direction: where the figure is in its idle frame (column 1).
    const ox = FW, oy = row * FH;
    let top = FH, left = FW, right = 0, bottom = 0;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (solid(ox + x, oy + y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
    if (top >= bottom) continue;
    const figH = bottom - top;
    // Choices made once per direction, applied to all three frames.
    const torn = [], stains = [];
    const nTorn = stage.torn[0] + Math.floor(rng() * (stage.torn[1] - stage.torn[0] + 1));
    for (let k = 0; k < nTorn; k++) torn.push([left + Math.floor(rng() * (right - left + 1)), top + Math.floor(figH * (0.45 + rng() * 0.5))]);
    const nStain = stage.stains[0] + Math.floor(rng() * (stage.stains[1] - stage.stains[0] + 1));
    for (let k = 0; k < nStain; k++) stains.push([left + 2 + Math.floor(rng() * Math.max(1, right - left - 4)), top + Math.floor(figH * (0.45 + rng() * 0.3))]);
    const leanDir = rng() < 0.5 ? -1 : 1;

    for (let col = 0; col < COLS; col++) {
      const fx = col * FW, fy = row * FH;
      // 2. Eyes (not from behind): small dark blobs (≤ 6 px, so not hair, brows or a moustache) in the upper half of
      //    the face (the box of skin pixels in the head band), every pixel of them touching skin → pale.
      if (stage.eyes && row !== 3) {
        const band = top + Math.round(figH * 0.45);
        let sl = FW, sr = -1, st = FH, sb = -1;
        for (let y = top; y < band; y++) for (let x = 0; x < FW; x++) if (skinMask[(fy + y) * W + fx + x]) { sl = Math.min(sl, x); sr = Math.max(sr, x); st = Math.min(st, y); sb = Math.max(sb, y); }
        if (sr >= 0) {
          const faceMid = st + Math.round((sb - st) * 0.6);
          const dark = (x, y) => { const i = at(fx + x, fy + y); return px[i + 3] > 0 && 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2] < 70; };
          const seen = new Uint8Array(FW * FH);
          for (let y = st; y <= faceMid; y++) for (let x = sl; x <= sr; x++) {
            if (seen[y * FW + x] || !dark(x, y)) continue;
            const blob = [], stack = [[x, y]]; seen[y * FW + x] = 1;
            while (stack.length) { const [cx, cy] = stack.pop(); blob.push([cx, cy]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= FW || ny >= FH || seen[ny * FW + nx] || !dark(nx, ny)) continue; seen[ny * FW + nx] = 1; stack.push([nx, ny]); } }
            if (blob.length > 6) continue;
            const inFace = blob.every(([bx, by]) => bx > sl && bx < sr && by > st && by <= faceMid);
            const light = (x, y) => { const i = at(fx + x, fy + y); return px[i + 3] > 0 && 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2] > 170; };
            // Every pixel touches skin or the white of the eye (a chibi eye is a pupil beside a highlight).
            const ringedBySkin = blob.every(([bx, by]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => skinMask[(fy + by + dy) * W + fx + bx + dx] || light(bx + dx, by + dy)));
            if (!inFace || !ringedBySkin) continue;
            for (const [bx, by] of blob) { const i = at(fx + bx, fy + by); px[i] = PALE_EYE[0]; px[i + 1] = PALE_EYE[1]; px[i + 2] = PALE_EYE[2]; }
          }
        }
      }
      // 3. Stains: a 2×2 of dark red on cloth (never on skin).
      for (const [sx, sy] of stains) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const X = fx + sx + dx, Y = fy + sy + dy;
        if (!solid(X, Y) || skinMask[Y * W + X]) continue;
        if (!solid(X - 1, Y) || !solid(X + 1, Y)) continue;
        const i = at(X, Y); px[i] = STAIN[0]; px[i + 1] = STAIN[1]; px[i + 2] = STAIN[2];
      }
      // 4. Torn: bite pixels out of the silhouette's edge on that row (the nearest edge to the chosen column).
      for (const [tx, ty] of torn) {
        const Y = fy + ty;
        let X = -1;
        for (let d = 0; d < FW && X < 0; d++) for (const cx of [tx - d, tx + d]) { const XX = fx + cx; if (cx >= 0 && cx < FW && solid(XX, Y) && (!solid(XX - 1, Y) || !solid(XX + 1, Y))) { X = XX; break; } }
        if (X >= 0 && !skinMask[Y * W + X]) px[at(X, Y) + 3] = 0;
      }
      // 5. Off balance: the upper body (above the hips) shifted sideways by `lean` px.
      if (stage.lean) {
        const hips = top + Math.round(figH * 0.55);
        for (let y = 0; y < hips; y++) {
          const rowCopy = px.slice(at(fx, fy + y), at(fx + FW, fy + y));
          for (let x = 0; x < FW; x++) {
            const sx = x - leanDir * stage.lean;
            const i = at(fx + x, fy + y);
            if (sx < 0 || sx >= FW) { px[i + 3] = 0; continue; }
            const j = sx * 4;
            px[i] = rowCopy[j]; px[i + 1] = rowCopy[j + 1]; px[i + 2] = rowCopy[j + 2]; px[i + 3] = rowCopy[j + 3];
          }
        }
      }
    }
  }
  const out = join(assets, 'sprites', `inf_${stageName}_${sheet}.png`);
  await sharp(Buffer.from(px.buffer), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out);
  return `inf_${stageName}_${sheet}`;
}

/**
 * Twitch frames (the user's infected spec step 3, ADR-159): three frames per direction baked from the idle
 * frame, written as <sheet>__twitch (same 3×4 layout as the sheet, like __breath):
 *   T0 snap   the head (rows above the breath line's head_y) jerks 1 px sideways (toward the facing in profile)
 *   T1 tilt   the head 1 px the other way and 1 px down into the neck
 *   T2 hitch  everything above the waist drops 1 px (a slump), the head 1 px sideways
 * Pixels only move, never change colour, so the frames stay on the palette. The engine plays them as a quick
 * one-shot while an infected stands still (seeded per body, `systems/infected.twitchGap`).
 */
const TWITCHERS = /^(inf_(fresh|degraded)_.+|inf_evolved_(male|female|elder)|inf_base_(male|female|elder)_\d|inf_host)$/;
const LINES = JSON.parse(readFileSync(join(assets, '_raw/characters/breath.json'), 'utf8'));
const linesOf = (sheet) => LINES[sheet] ?? LINES[sheet.replace(/^inf_(fresh|degraded)_/, '')] ?? LINES[sheet.replace(/_\d$/, '')] ?? null;

export async function twitchSheet(sheet) {
  const { data, info } = await sharp(join(assets, 'sprites', `${sheet}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, fw = W / COLS, fh = H / ROWS;
  const out = Buffer.alloc(W * H * 4);
  const DIRS = ['down', 'left', 'right', 'up'];
  for (let row = 0; row < ROWS; row++) {
    const line = linesOf(sheet)?.[DIRS[row]] ?? { head_y: Math.round(fh / 2), waist_y: Math.round(fh * 0.67) };
    const side = row === 1 ? -1 : 1;
    // [dx of the head, dy of the head, dy of the upper body] per twitch frame.
    const moves = [[side, 0, 0], [-side, 1, 0], [side, 0, 1]];
    moves.forEach(([hx, hy, by], col) => {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        // Where this pixel comes from in the idle frame (column 1).
        let sx = x, sy = y;
        if (y < line.waist_y) sy = y - by;
        if (sy < line.head_y + hy && y < line.head_y + hy) { sx = x - hx; sy = sy - hy; }
        const o = ((row * fh + y) * W + col * fw + x) * 4;
        if (sx < 0 || sy < 0 || sx >= fw || sy >= fh) continue;
        const i = ((row * fh + sy) * W + fw + sx) * 4;
        data.copy(out, o, i, i + 4);
      }
    });
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(assets, 'sprites', `${sheet}__twitch.png`));
  return `${sheet}__twitch`;
}

/**
 * Fall frames (ADR-161): what a Pulse hit does before the body lies still — per direction, from the idle frame:
 *   F0 buckle  the legs give: everything above the waist drops a quarter of the leg's height, the legs squash under it
 *   F1 kneel   down on the knees: half the leg's height gone
 *   F2 slump   kneeling, the head drops forward (toward the facing in profile, into the chest from the front)
 * Written as <sheet>__fall (same 3×4 layout). Pixels only move (palette-safe). The engine plays the three, then
 * tips the slumped body onto its side.
 */
export async function fallSheet(sheet) {
  const { data, info } = await sharp(join(assets, 'sprites', `${sheet}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, fw = W / COLS, fh = H / ROWS;
  const out = Buffer.alloc(W * H * 4);
  const DIRS = ['down', 'left', 'right', 'up'];
  for (let row = 0; row < ROWS; row++) {
    const line = linesOf(sheet)?.[DIRS[row]] ?? { head_y: Math.round(fh / 2), waist_y: Math.round(fh * 0.67) };
    // The feet: the last opaque row of the idle frame.
    let feet = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (data[((row * fh + y) * W + fw + x) * 4 + 3]) feet = y;
    const waist = Math.min(line.waist_y, feet - 2), legs = feet - waist;
    const head = [[0, 1], [-2, 0], [2, 0], [0, 1]][row];
    [0.25, 0.5, 0.5].forEach((k, col) => {
      const drop = Math.round(legs * k);
      for (let y = 0; y <= feet; y++) for (let x = 0; x < fw; x++) {
        let sx = x, sy;
        if (y < waist + drop) sy = y - drop; // above the (lowered) waist: the upper body, dropped
        else sy = waist + Math.round(((y - waist - drop) * legs) / Math.max(1, legs - drop)); // the legs, squashed
        // The slump: the head (rows above the chin, now lowered) leans forward.
        if (col === 2 && sy < line.head_y && y < line.head_y + drop + head[1]) { sx = x - head[0]; sy = sy - head[1]; }
        if (sx < 0 || sy < 0 || sx >= fw || sy >= fh) continue;
        data.copy(out, ((row * fh + y) * W + col * fw + x) * 4, ((row * fh + sy) * W + fw + sx) * 4, ((row * fh + sy) * W + fw + sx) * 4 + 4);
      }
    });
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(assets, 'sprites', `${sheet}__fall.png`));
  return `${sheet}__fall`;
}

export async function runTwitch() {
  const dir = join(assets, 'sprites');
  for (const f of readdirSync(dir)) if (f.endsWith('__twitch.png') || f.endsWith('__fall.png')) rmSync(join(dir, f));
  const sheets = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.includes('__')).map((f) => f.replace(/\.png$/, '')).filter((s) => TWITCHERS.test(s)).sort();
  for (const s of sheets) { await twitchSheet(s); await fallSheet(s); }
  console.log(`✓ twitch + fall frames — ${sheets.length} __twitch and __fall sheets`);
  return sheets;
}

export async function runInfectedRecipe(only) {
  const cfg = JSON.parse(readFileSync(join(assets, '../data/infected/looks.json'), 'utf8'));
  const made = [];
  for (const s of cfg.sources) {
    if (only && s.sheet !== only) continue;
    for (const stage of cfg.stages) made.push(await infectSheet(s.sheet, stage));
  }
  if (!only) await runTwitch();
  console.log(`✓ infected recipe — ${made.length} sheets (${cfg.stages.join(' + ')})`);
  return made;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runInfectedRecipe(process.argv[2]);
