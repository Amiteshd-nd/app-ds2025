/**
 * Breathing frames, derived from a character's neutral idle (AUDIT_LOG P5+:
 * "upper body only, 1px DOWN at the waistline, feet planted, baked frames").
 *
 * Per direction, from the idle frame F0 (32×48 RGBA):
 *   F1 — head dips: rows above `head_y` move down 1px (into the neck), within
 *        the head's own columns; nothing else changes.
 *   F2 — full exhale: every row above `waist_y` moves down 1px; each shifted
 *        row overwrites the one below; the top row clears. Rows at or below
 *        `waist_y` never change — the feet stay planted.
 *   F3 — recovering: same as F1.
 * Shifts are always DOWN (up would open a gap at the waist). New silhouette
 * edges along the seams are repainted in the sprite's own outline colour.
 *
 * Pure functions on raw buffers; the importer and the preview script call them.
 */

export const FRAME_W = 32;
export const FRAME_H = 48;

const idx = (x, y) => (y * FRAME_W + x) * 4;
const opaque = (f, x, y) => x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H && f[idx(x, y) + 3] > 0;
const colourAt = (f, x, y) => (f[idx(x, y)] << 16) | (f[idx(x, y) + 1] << 8) | f[idx(x, y) + 2];

/** Copy one 32×48 frame out of a sheet (RGBA, `sheetW` px wide). */
export function readFrame(sheet, sheetW, col, row) {
  const f = Buffer.alloc(FRAME_W * FRAME_H * 4);
  for (let y = 0; y < FRAME_H; y++) {
    const from = ((row * FRAME_H + y) * sheetW + col * FRAME_W) * 4;
    sheet.copy(f, y * FRAME_W * 4, from, from + FRAME_W * 4);
  }
  return f;
}

/** Paste a frame into a sheet. */
export function writeFrame(sheet, sheetW, col, row, f) {
  for (let y = 0; y < FRAME_H; y++) {
    const to = ((row * FRAME_H + y) * sheetW + col * FRAME_W) * 4;
    f.copy(sheet, to, y * FRAME_W * 4, (y + 1) * FRAME_W * 4);
  }
}

/** First and last opaque rows, and the opaque extent [left, right] of each row. */
export function figure(f) {
  let top = -1, bottom = -1;
  const extent = [];
  for (let y = 0; y < FRAME_H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < FRAME_W; x++) if (opaque(f, x, y)) { if (l < 0) l = x; r = x; }
    extent.push(l < 0 ? null : [l, r]);
    if (l >= 0) { if (top < 0) top = y; bottom = y; }
  }
  return { top, bottom, extent };
}

/**
 * Propose `head_y` (first row below the chin: rows above it are the head) and
 * `waist_y` (the first hip/belt row: it and everything below never move) from
 * the FRONT idle frame. All four directions are drawn at the same height on
 * the same baseline, so one pair of lines serves every direction (the side
 * views' arms and bags fool a per-direction search).
 * Chin = where the face's own colours (sampled at cheek height) stop, walking down the centre columns.
 * Waist = the row in the hip band (55–80% down the figure) where the torso
 * core's colours change most from the row above — belt, shirt hem, kurti line.
 */
export function detect(front, isSkinColour) {
  const { top, bottom, extent } = figure(front);
  const h = bottom - top + 1;
  const mid = extent[top + Math.round(h * 0.3)] ?? [0, FRAME_W - 1];
  const cx = Math.round((mid[0] + mid[1]) / 2);

  // The face's own colours, sampled at cheek height; walk down while they continue.
  const cheek = top + Math.round(h * 0.38);
  const face = new Set();
  for (let x = cx - 3; x <= cx + 3; x++) {
    const i = idx(x, cheek);
    if (opaque(front, x, cheek) && isSkinColour(front[i], front[i + 1], front[i + 2])) face.add(colourAt(front, x, cheek));
  }
  let chin = -1;
  for (let y = cheek; y <= top + Math.round(h * 0.65); y++) {
    let hits = 0;
    for (let x = cx - 2; x <= cx + 2; x++) if (opaque(front, x, y) && face.has(colourAt(front, x, y))) hits++;
    if (hits === 0) break;
    chin = y;
  }
  const headY = chin >= 0 ? chin + 1 : top + Math.round(h * 0.45);

  const lo = Math.max(headY + 3, top + Math.round(h * 0.55)), hi = top + Math.round(h * 0.8);
  let waistY = lo, best = -1;
  for (let y = lo; y <= hi; y++) {
    if (!extent[y] || !extent[y - 1]) continue;
    // Torso core only — the outer 3 columns are arms.
    const l = Math.max(extent[y][0], extent[y - 1][0]) + 3, r = Math.min(extent[y][1], extent[y - 1][1]) - 3;
    let changed = 0;
    for (let x = l; x <= r; x++) if (colourAt(front, x, y) !== colourAt(front, x, y - 1)) changed++;
    if (changed > best) { best = changed; waistY = y; }
  }
  return { head_y: headY, waist_y: waistY };
}

/** Warm, R > G > B, not dark: skin on the quantised sheets. */
export const isSkin = (r, g, b) => r > 120 && r > g && g > b && r - b > 40 && r - b < 140;

/** Colours that make up a frame's outline: the commonest colours on its silhouette edge. */
function outlineColours(f) {
  const counts = new Map();
  let edges = 0;
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
    if (!opaque(f, x, y)) continue;
    if (opaque(f, x - 1, y) && opaque(f, x + 1, y) && opaque(f, x, y - 1) && opaque(f, x, y + 1)) continue;
    const c = colourAt(f, x, y);
    counts.set(c, (counts.get(c) ?? 0) + 1);
    edges++;
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  return { set: new Set(sorted.filter(([, n]) => n / Math.max(1, edges) >= 0.05).map(([c]) => c)), main: sorted[0]?.[0] ?? 0 };
}

const isEdge = (f, x, y) => opaque(f, x, y)
  && !(opaque(f, x - 1, y) && opaque(f, x + 1, y) && opaque(f, x, y - 1) && opaque(f, x, y + 1));

/** Shift rows [0, untilRow) down by 1 inside columns [l, r]; row 0 clears. */
function shiftDown(f, untilRow, l = 0, r = FRAME_W - 1) {
  const out = Buffer.from(f);
  for (let y = untilRow; y >= 1; y--) {
    for (let x = l; x <= r; x++) f.copy(out, idx(x, y), idx(x, y - 1), idx(x, y - 1) + 4);
  }
  for (let x = l; x <= r; x++) out.fill(0, idx(x, 0), idx(x, 0) + 4);
  return out;
}

/** Repaint silhouette edges that the shift newly exposed near `seamRows`, in the outline colour. */
function repairSeam(f0, f, seamRows) {
  const { set, main } = outlineColours(f0);
  let repaired = 0;
  for (const y of seamRows) for (let x = 0; x < FRAME_W; x++) {
    if (y < 0 || y >= FRAME_H) continue;
    if (isEdge(f, x, y) && !isEdge(f0, x, y) && !set.has(colourAt(f, x, y))) {
      f[idx(x, y)] = (main >> 16) & 255; f[idx(x, y) + 1] = (main >> 8) & 255; f[idx(x, y) + 2] = main & 255; f[idx(x, y) + 3] = 255;
      repaired++;
    }
  }
  return repaired;
}

/** F1, F2, F3 from F0 and the direction's breath lines. */
export function deriveBreath(f0, { head_y, waist_y }, { repair = true } = {}) {
  const { extent } = figure(f0);
  let l = FRAME_W, r = -1;
  for (let y = 0; y < head_y; y++) if (extent[y]) { l = Math.min(l, extent[y][0]); r = Math.max(r, extent[y][1]); }
  const f1 = l <= r ? shiftDown(f0, head_y, l, r) : Buffer.from(f0);
  const f2 = shiftDown(f0, waist_y - 1);
  // Seams are repaired only ABOVE the lines: rows at or below waist_y (and
  // below head_y in F1) are never touched.
  const repaired = repair ? repairSeam(f0, f1, [head_y - 1, head_y]) + repairSeam(f0, f2, [waist_y - 2, waist_y - 1]) : 0;
  return { f1, f2, f3: Buffer.from(f1), repaired };
}

/**
 * Hands hanging below the waist stay put while the arm above them dips — the
 * case the user asked to be flagged, not fixed. True when skin-coloured
 * pixels sit at or below `waist_y` near the silhouette's sides.
 */
export function handsBelowWaist(f0, waist_y, skinColours) {
  const { extent, bottom } = figure(f0);
  // The hand zone: just below the waist, above the shins and feet.
  for (let y = waist_y; y <= Math.min(waist_y + 4, bottom - 7); y++) {
    if (!extent[y]) continue;
    const [l, r] = extent[y];
    for (let x = l; x <= r; x++) {
      if (x > l + 4 && x < r - 4) continue;
      if (opaque(f0, x, y) && skinColours.has(colourAt(f0, x, y))) return true;
    }
  }
  return false;
}
