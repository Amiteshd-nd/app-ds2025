/**
 * Median-cut colour quantisation — the step every generated asset goes
 * through so the whole game sits on one palette (art_pipeline_v1 §5.3).
 *
 * Written here rather than leaning on sharp's PNG palette option because
 * that option quietly caps at 16 colours on this build; a style lock needs
 * exactly the N colours we ask for, and needs to be able to quantise *to a
 * given palette* later (asset_pipe step 3), which sharp cannot do at all.
 *
 * No dithering, ever: dither reads as noise at 32px and breaks tile seams.
 */

/** @param {Uint8Array|Buffer} rgb  interleaved RGB; @param {number} n  colour count */
export function medianCut(rgb, n, { stride = 1 } = {}) {
  const px = [];
  for (let i = 0; i < rgb.length; i += 3 * stride) px.push([rgb[i], rgb[i + 1], rgb[i + 2]]);

  const range = (box) => {
    const min = [255, 255, 255], max = [0, 0, 0];
    for (const p of box) for (let c = 0; c < 3; c++) {
      if (p[c] < min[c]) min[c] = p[c];
      if (p[c] > max[c]) max[c] = p[c];
    }
    return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  };

  let boxes = [px];
  while (boxes.length < n) {
    // Split the box with the widest channel range; stop if nothing can split.
    let best = -1, bestRange = -1, bestChannel = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const r = range(box);
      const c = r.indexOf(Math.max(...r));
      if (r[c] > bestRange) { bestRange = r[c]; best = i; bestChannel = c; }
    });
    if (best < 0 || bestRange === 0) break;
    const box = boxes[best].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }

  return boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const p of box) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
    return [Math.round(sum[0] / box.length), Math.round(sum[1] / box.length), Math.round(sum[2] / box.length)];
  });
}

/** Nearest palette entry by Euclidean RGB distance. */
export function nearest(palette, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Map every pixel of an RGB buffer onto the palette, in place. Returns per-colour pixel counts. */
export function applyPalette(rgb, palette) {
  const counts = new Array(palette.length).fill(0);
  // Cache: the same 24-bit colour always maps to the same entry.
  const cache = new Map();
  for (let i = 0; i < rgb.length; i += 3) {
    const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) { idx = nearest(palette, rgb[i], rgb[i + 1], rgb[i + 2]); cache.set(key, idx); }
    const [r, g, b] = palette[idx];
    rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b;
    counts[idx]++;
  }
  return counts;
}

/** Parse a GIMP .gpl into [[r,g,b], …]. */
export function readGpl(text) {
  return text.split('\n')
    .filter((l) => /^\s*\d+\s+\d+\s+\d+/.test(l))
    .map((l) => l.trim().split(/\s+/).slice(0, 3).map(Number));
}

export const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Median-cut palette of `n` colours from an RGB or RGBA buffer (alpha-0 pixels
 * ignored). Deterministic. Used where a picture keeps its own palette (the
 * title screen, ADR-101) — sharp's PNG palette mode rounds 64 colours down to 16.
 */
export function paletteFor(buf, channels, n) {
  const px = [];
  for (let i = 0; i < buf.length; i += channels) {
    if (channels === 4 && buf[i + 3] === 0) continue;
    px.push([buf[i], buf[i + 1], buf[i + 2]]);
  }
  if (px.length === 0) return [[0, 0, 0]];
  let boxes = [px];
  while (boxes.length < n) {
    let best = -1, bestRange = 0, bestCh = 0;
    boxes.forEach((box, b) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        // Weight by population so big flat areas (the sky) get their share of colours.
        const range = (hi - lo) * Math.sqrt(box.length);
        if (range > bestRange) { bestRange = range; best = b; bestCh = c; }
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    const s = [0, 0, 0];
    for (const p of box) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map((v) => Math.round(v / box.length));
  });
}

/** applyPalette for RGBA buffers: snaps opaque pixels, leaves transparent ones. */
export function applyPaletteRGBA(rgba, palette) {
  const cache = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) { idx = nearest(palette, rgba[i], rgba[i + 1], rgba[i + 2]); cache.set(key, idx); }
    const [r, g, b] = palette[idx];
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b;
  }
}
