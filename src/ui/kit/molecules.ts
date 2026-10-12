import { hex, rgba, HUD_PLATE_ALPHA, type TokenName } from '../tokens';
import { ICONS, type IconName } from './icons';
import { bitmap, bitmapHeight, bitmapWidth, dither, dottedBox, rect, ring, roundRect, type PixelCtx } from './pixel';

/**
 * UI-kit molecules (ADR-114): one visual family for the phone, map, HUD and
 * menus. Each paints itself onto a PixelCtx for a given state and returns
 * what the caller needs to finish it (text colour, press offset).
 *
 *   default · focus (keyboard/gamepad cursor; inverts) · pressed (sinks 2px,
 *   loses its shadow) · disabled (mid tone, no shadow) · locked (dotted
 *   outline, dithered content, no label — ADR-39)
 *
 * Phone molecules use the three LCD tones; HUD/menu molecules use the black
 * plate with a grey border. No raw hex: every colour is a token.
 */
export type UiState = 'default' | 'focus' | 'pressed' | 'disabled' | 'locked';
export const UI_STATES: readonly UiState[] = ['default', 'focus', 'pressed', 'disabled', 'locked'];

export interface Painted {
  /** Token for text/glyphs drawn on top. */
  ink: TokenName;
  /** Vertical offset for content when pressed. */
  dy: number;
}

/** Shadow under phone molecules, in px. */
export const PHONE_SHADOW = 2;
/** Minimum touch target in game px: 44 × the iPhone 15's 1.09 FIT scale ≈ 48pt (ADR-114). */
export const MIN_TAP = 44;

// ── Phone ────────────────────────────────────────────────────────────────

/**
 * LCD pill: title pill, list buttons. w×h is the face; the shadow adds
 * PHONE_SHADOW below.
 */
export function phonePill(g: PixelCtx, x: number, y: number, w: number, h: number, state: UiState = 'default'): Painted {
  const r = Math.min(Math.floor(h / 2), 8);
  const bg = hex('phone.lcd.bg'), mid = hex('phone.lcd.mid'), ink = hex('phone.lcd.ink');
  if (state === 'locked') {
    dottedBox(g, x, y, w, h, mid);
    return { ink: 'phone.lcd.mid', dy: 0 };
  }
  if (state === 'disabled') {
    roundRect(g, x, y, w, h, r, mid);
    roundRect(g, x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 2), bg);
    return { ink: 'phone.lcd.mid', dy: 0 };
  }
  const dy = state === 'pressed' ? PHONE_SHADOW : 0;
  if (!dy) roundRect(g, x, y + PHONE_SHADOW, w, h, r, mid);
  roundRect(g, x, y + dy, w, h, r, ink);
  const inverted = state === 'focus' || state === 'pressed';
  roundRect(g, x + 2, y + dy + 2, w - 4, h - 4, Math.max(0, r - 2), inverted ? ink : bg);
  return { ink: inverted ? 'phone.lcd.bg' : 'phone.lcd.ink', dy };
}

export const APP_TILE = 32;

/** App tile: rounded square + 16px glyph. Locked = dotted box + 50% dithered glyph. */
export function appTile(g: PixelCtx, x: number, y: number, icon: IconName, state: UiState = 'default'): Painted {
  const bg = hex('phone.lcd.bg'), mid = hex('phone.lcd.mid'), ink = hex('phone.lcd.ink');
  const rows = ICONS[icon];
  const gx = Math.floor((APP_TILE - bitmapWidth(rows)) / 2), gy = Math.ceil((APP_TILE - bitmapHeight(rows)) / 2);
  if (state === 'locked') {
    dottedBox(g, x, y, APP_TILE, APP_TILE, mid);
    bitmap(g, rows, x + gx, y + gy, mid, 1, (i, j) => (i + j) % 2 === 0);
    return { ink: 'phone.lcd.mid', dy: 0 };
  }
  if (state === 'disabled') {
    ring(g, x, y, APP_TILE, APP_TILE, 6, 2, mid);
    bitmap(g, rows, x + gx, y + gy, mid);
    return { ink: 'phone.lcd.mid', dy: 0 };
  }
  const dy = state === 'pressed' ? PHONE_SHADOW : 0;
  const inverted = state === 'focus' || state === 'pressed';
  if (!dy) roundRect(g, x, y + PHONE_SHADOW, APP_TILE, APP_TILE, 6, mid);
  roundRect(g, x, y + dy, APP_TILE, APP_TILE, 6, ink);
  roundRect(g, x + 2, y + dy + 2, APP_TILE - 4, APP_TILE - 4, 4, inverted ? ink : bg);
  bitmap(g, rows, x + gx, y + gy + dy, inverted ? bg : ink);
  return { ink: 'phone.lcd.ink', dy };
}

/** Unread badge: an amber pill with an LCD rim. Text (count) is drawn by the caller in phone.lcd.bg. */
export function badge(g: PixelCtx, x: number, y: number, w: number, h = 11): Painted {
  roundRect(g, x - 1, y - 1, w + 2, h + 2, 4, hex('phone.lcd.bg'));
  roundRect(g, x, y, w, h, 3, hex('phone.accent.chat'));
  return { ink: 'phone.lcd.bg', dy: 0 };
}

/** Bottom navigation bar inside an app (reference: the phone mock's dock bar). */
export function dockBar(g: PixelCtx, x: number, y: number, w: number, h: number): Painted {
  roundRect(g, x, y + PHONE_SHADOW, w, h, 9, hex('phone.lcd.mid'));
  roundRect(g, x, y, w, h, 9, hex('phone.lcd.ink'));
  return { ink: 'phone.lcd.bg', dy: 0 };
}

// ── HUD + menus ──────────────────────────────────────────────────────────

/** HUD plate: black at 85%, grey 2px border, rounded pixel corners, 1px drop shadow (image-4 construction). */
export function hudPlate(g: PixelCtx, x: number, y: number, w: number, h: number, state: UiState = 'default', r = 3): Painted {
  const dy = state === 'pressed' ? 1 : 0;
  if (!dy) roundRect(g, x, y + 1, w, h, r, rgba('hud.shadow', 0.45));
  if (state === 'focus' || state === 'pressed') {
    roundRect(g, x, y + dy, w, h, r, hex('hud.text'));
    return { ink: 'hud.plate', dy };
  }
  roundRect(g, x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 2), rgba('hud.plate', HUD_PLATE_ALPHA));
  if (state === 'locked') { dottedBox(g, x, y, w, h, hex('hud.border')); return { ink: 'hud.border', dy }; }
  ring(g, x, y, w, h, r, 2, state === 'disabled' ? hex('phone.bezel.edge') : hex('hud.border'));
  return { ink: state === 'disabled' ? 'hud.border' : 'hud.text', dy };
}

/**
 * Map-style label card: grey border top/left/bottom, open right edge, the
 * border continuing as a dotted trail (`trail` dots). Selected = inverted.
 */
export function labelCard(g: PixelCtx, x: number, y: number, w: number, h: number, state: UiState = 'default', trail = 9): Painted {
  const border = state === 'disabled' || state === 'locked' ? hex('phone.bezel.edge') : hex('hud.border');
  const inverted = state === 'focus' || state === 'pressed';
  rect(g, x + 2, y + 2, w - 2, h - 4, inverted ? hex('hud.text') : rgba('hud.plate', HUD_PLATE_ALPHA));
  rect(g, x + 3, y, w - 3, 2, border);
  rect(g, x + 3, y + h - 2, w - 3, 2, border);
  rect(g, x, y + 3, 2, h - 6, border);
  rect(g, x + 1, y + 1, 2, 2, border);
  rect(g, x + 1, y + h - 3, 2, 2, border);
  for (let i = 0; i < trail; i++) {
    rect(g, x + w + 2 + i * 4, y, 2, 2, border);
    rect(g, x + w + 2 + i * 4, y + h - 2, 2, 2, border);
  }
  return { ink: inverted ? 'hud.plate' : state === 'default' ? 'hud.text' : 'hud.border', dy: 0 };
}

/**
 * Block row: meters, sliders, ★ rows — N blocks, `value` of them filled, in
 * the rhythm of the map's ★ rows. Returns its width.
 */
export function blockRow(
  g: PixelCtx, x: number, y: number, value: number, max = 5,
  opts: { on?: TokenName; off?: TokenName; size?: number; gap?: number; state?: UiState } = {},
): number {
  const size = opts.size ?? 5, gap = opts.gap ?? 2;
  const state = opts.state ?? 'default';
  const on = hex(state === 'disabled' || state === 'locked' ? 'hud.border' : (opts.on ?? 'hud.text'));
  const off = hex(opts.off ?? 'phone.bezel.edge');
  for (let i = 0; i < max; i++) {
    const bx = x + i * (size + gap);
    if (i < value) rect(g, bx, y, size, size, on);
    else if (state === 'locked') dither(g, bx, y, size, size, off);
    else { rect(g, bx, y, size, 1, off); rect(g, bx, y + size - 1, size, 1, off); rect(g, bx, y, 1, size, off); rect(g, bx + size - 1, y, 1, size, off); }
  }
  return max * size + (max - 1) * gap;
}

/**
 * A touch zone at least MIN_TAP square, centred on a drawn element (the
 * drawing may be smaller than the finger — ADR-114 "drawings small, touch
 * zones big").
 */
export function tapZone(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const tw = Math.max(w, MIN_TAP), th = Math.max(h, MIN_TAP);
  return { x: Math.round(x - (tw - w) / 2), y: Math.round(y - (th - h) / 2), w: tw, h: th };
}
