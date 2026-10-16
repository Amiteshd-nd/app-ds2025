import { GAME_HEIGHT, GAME_WIDTH } from '../../utils/constants';
import { MIN_TAP } from '../kit/molecules';

/**
 * Menu geometry (P6d, ADR-119) at HUD scale k (1, or 2 for Larger text): a
 * virtual canvas of W×H = 640/k × 360/k that the scene draws at scale k.
 * Title card top-left, rows as label cards down the left, a BACK plate
 * top-right, a hint line above the home strip. Pure numbers so tests hold
 * the promises: every row band is a full tap target at 1×, nothing tappable
 * in the bottom strip.
 */
export interface MenuLayout {
  k: 1 | 2;
  W: number;
  H: number;
  pad: number;
  /** Title card. */
  title: { x: number; y: number; h: number };
  /** Rows: first y, pitch, left x, width (leaves room for the card's dotted trail). */
  rows: { x: number; y: number; w: number; h: number; pitch: number };
  /** Two-line rows (save slots). */
  slot: { h: number; pitch: number };
  /** BACK plate, top-right. */
  back: { x: number; y: number; w: number; h: number };
  /** Hint line baseline (caps top). */
  hintY: number;
  /** Nothing tappable below this. */
  safeBottom: number;
  /** Confirm dialog plate. */
  confirm: { w: number; h: number };
  /** Width reserved on a row's right for its value. */
  valueW: number;
}

export function menuLayout(k: 1 | 2 = 1): MenuLayout {
  const W = GAME_WIDTH / k, H = GAME_HEIGHT / k;
  const pad = 8;
  const safeBottom = H - 20 / k;
  const backW = 50;
  return {
    k, W, H, pad,
    title: { x: pad, y: pad, h: 19 },
    rows: { x: pad, y: pad + 19 + 12, w: Math.min(440, W - 2 * pad - 36), h: 19, pitch: 24 },
    slot: { h: 31, pitch: 36 },
    back: { x: W - pad - backW, y: pad, w: backW, h: 19 },
    hintY: safeBottom - 14,
    safeBottom,
    confirm: { w: Math.min(300, W - 2 * pad - 20), h: 64 },
    valueW: Math.min(150, Math.floor(W / 4)),
  };
}

/** How many rows of a pitch fit between the first row and the hint line. */
export const visibleRows = (L: MenuLayout, pitch: number): number => Math.max(1, Math.floor((L.hintY - 6 - L.rows.y) / pitch));

/** Row i's band (its full pitch, so a tap between rows still lands) with a scroll offset in rows. */
export function rowBand(L: MenuLayout, i: number, scroll: number, pitch: number, h: number) {
  return { x: L.rows.x, y: L.rows.y + (i - scroll) * pitch, w: L.rows.w + 36, h, band: pitch };
}

/** Keep the selected row in view; returns the new scroll offset. */
export function scrollFor(selected: number, scroll: number, visible: number): number {
  if (selected < scroll) return selected;
  if (selected >= scroll + visible) return selected - visible + 1;
  return scroll;
}

/** The row under a point (virtual px), by band — null outside the list. */
export function rowAt(L: MenuLayout, count: number, scroll: number, pitch: number, px: number, py: number): number | null {
  if (px < L.rows.x || px >= L.rows.x + L.rows.w + 36) return null;
  const i = Math.floor((py - L.rows.y + (pitch - 19) / 2) / pitch) + scroll;
  if (py < L.rows.y - (pitch - 19) / 2) return null;
  return i >= 0 && i < count ? i : null;
}

/** A tap zone for a plate, grown to MIN_TAP (in virtual px at this k). */
export function zone(L: MenuLayout, r: { x: number; y: number; w: number; h: number }) {
  const min = MIN_TAP / L.k;
  const w = Math.max(r.w, min), h = Math.max(r.h, min);
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}

export const inRect = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
