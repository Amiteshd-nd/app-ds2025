/**
 * Pixel primitives for the UI kit (ADR-114) — atoms.
 *
 * Everything is whole-pixel rows of `fillRect`: rounded corners are computed
 * per row, never anti-aliased, and there is no compositing, so the same calls
 * paint a Phaser CanvasTexture at runtime and a recording fake in tests.
 */

/** The slice of CanvasRenderingContext2D the kit uses. */
export interface PixelCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** A glyph or icon drawn as text rows: '#' is ink, anything else is empty. */
export type Bitmap = readonly string[];

export const rect = (g: PixelCtx, x: number, y: number, w: number, h: number, c: string): void => {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

/** How far row `i` of a w×h box with corner radius r is pulled in at each end. */
export const cornerInset = (i: number, h: number, r: number): number => {
  if (r <= 0) return 0;
  const dy = i < r ? r - i - 0.5 : i >= h - r ? i - (h - r) + 0.5 : -1;
  return dy < 0 ? 0 : Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
};

/** Filled box with pixel-rounded corners. */
export function roundRect(g: PixelCtx, x: number, y: number, w: number, h: number, r: number, c: string): void {
  g.fillStyle = c;
  for (let i = 0; i < h; i++) {
    const inset = cornerInset(i, h, r);
    if (w - 2 * inset > 0) g.fillRect(x + inset, y + i, w - 2 * inset, 1);
  }
}

/** A rounded outline `s` px thick; the inside is left untouched (no compositing). */
export function ring(g: PixelCtx, x: number, y: number, w: number, h: number, r: number, s: number, c: string): void {
  g.fillStyle = c;
  const ir = Math.max(0, r - s), ih = h - 2 * s;
  for (let i = 0; i < h; i++) {
    const o = cornerInset(i, h, r);
    if (i < s || i >= h - s) { if (w - 2 * o > 0) g.fillRect(x + o, y + i, w - 2 * o, 1); continue; }
    const inner = s + cornerInset(i - s, ih, ir);
    g.fillRect(x + o, y + i, inner - o, 1);
    g.fillRect(x + w - inner, y + i, inner - o, 1);
  }
}

/** Dotted outline: every other pixel along a square box (locked items). */
export function dottedBox(g: PixelCtx, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c;
  for (let i = 0; i < w; i += 2) { g.fillRect(x + i, y, 1, 1); g.fillRect(x + i, y + h - 1, 1, 1); }
  for (let j = 2; j < h - 1; j += 2) { g.fillRect(x, y + j, 1, 1); g.fillRect(x + w - 1, y + j, 1, 1); }
}

/** Checkerboard dither over a box (50%). */
export function dither(g: PixelCtx, x: number, y: number, w: number, h: number, c: string, phase = 0): void {
  g.fillStyle = c;
  for (let j = 0; j < h; j++) for (let i = (j + phase) % 2; i < w; i += 2) g.fillRect(x + i, y + j, 1, 1);
}

/**
 * Draw a bitmap at scale k. `mask(i, j)` can drop pixels (the 50% dither on a
 * locked icon is `(i + j) % 2 === 0`).
 */
export function bitmap(g: PixelCtx, rows: Bitmap, x: number, y: number, c: string, k = 1, mask?: (i: number, j: number) => boolean): void {
  g.fillStyle = c;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '#' && (!mask || mask(i, j))) g.fillRect(x + i * k, y + j * k, k, k);
    }
  });
}

export const bitmapWidth = (rows: Bitmap): number => Math.max(0, ...rows.map((r) => r.length));
export const bitmapHeight = (rows: Bitmap): number => rows.length;
