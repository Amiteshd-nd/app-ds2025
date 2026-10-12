import { hex } from '../tokens';
import { bitmap, dither, rect, roundRect, type PixelCtx } from '../kit/pixel';
import { HOME, PHONE, SCREEN_H } from './layout';

/**
 * Phone chrome painters (ADR-114): the frame, the LCD, the wallpaper, the
 * status icons. Pure paint calls on a PixelCtx, baked once into textures by
 * PhoneScene. The frame is ours, drawn after the reference's modern notched
 * smartphone; the screen language follows the LCD reference.
 */

/** Frame (bezel, side buttons, notch) + the LCD with its 1px dot grid at ~15%. */
export function paintFrame(g: PixelCtx): void {
  const edge = hex('phone.bezel.edge'), bezel = hex('phone.bezel');
  const { x: sx, y: sy, w: sw } = PHONE.screen;
  // Side buttons: volume ×2 + action on the left, power on the right.
  rect(g, 0, 62, 4, 18, edge); rect(g, 0, 90, 4, 30, edge); rect(g, 0, 124, 4, 30, edge);
  rect(g, PHONE.w - 4, 100, 4, 40, edge);
  roundRect(g, 3, 0, 200, PHONE.h + 20, 20, edge);
  roundRect(g, 4, 1, 198, PHONE.h + 20, 19, bezel);
  roundRect(g, sx, sy, sw, PHONE.h + 20, 12, hex('phone.lcd.bg'));
  g.globalAlpha = 0.15;
  for (let y = sy + 2; y < PHONE.h; y += 3) for (let x = sx + 4; x < sx + sw - 4; x += 3) rect(g, x, y, 1, 1, hex('phone.lcd.ink'));
  g.globalAlpha = 1;
  // Notch: speaker slot + camera.
  const nx = sx + PHONE.notch.x;
  rect(g, nx, sy, PHONE.notch.w, 6, bezel);
  roundRect(g, nx, sy, PHONE.notch.w, PHONE.notch.h, 5, bezel);
  rect(g, nx + 22, sy + 4, 14, 2, edge);
  roundRect(g, nx + 40, sy + 3, 4, 4, 2, edge);
}

export const WALLPAPER = { w: PHONE.screen.w, h: 52 } as const;

/**
 * Home wallpaper, in LCD mid tone: Vidhana Soudha's dome, the metro viaduct
 * with a train, coconut palms. `cracked` (Act 4 story flag) lays a crack
 * across the glass.
 */
export function paintWallpaper(g: PixelCtx, cracked = false): void {
  const c = hex('phone.lcd.mid'), bg = hex('phone.lcd.bg');
  const top = 6, W = WALLPAPER.w, cx = 132;
  // Dome on its block, with columns.
  rect(g, cx - 34, top + 22, 68, 22, c); rect(g, cx - 14, top + 12, 28, 12, c);
  roundRect(g, cx - 10, top, 20, 16, 8, c); rect(g, cx - 1, top - 5, 2, 6, c);
  for (let i = 0; i < 7; i++) rect(g, cx - 30 + i * 10, top + 28, 3, 14, bg);
  // Palms.
  for (const [x, t] of [[18, 6], [40, 14], [W - 14, 10]] as const) {
    rect(g, x, top + t + 4, 2, 44 - t, c);
    bitmap(g, ['.##...##.', '###.#.###', '#..###..#', '..#####..', '.#..#..#.'], x - 3, top + t - 1, c);
  }
  // Viaduct, pillars, train.
  rect(g, 0, top + 36, W, 3, c);
  for (let x = 6; x < W; x += 30) rect(g, x, top + 39, 4, 7, c);
  roundRect(g, 54, top + 27, 52, 9, 3, c);
  for (let i = 0; i < 6; i++) rect(g, 58 + i * 8, top + 29, 4, 3, bg);
  rect(g, 0, top + 44, W, 2, c);
  if (cracked) {
    const ink = hex('phone.lcd.ink');
    const crack: Array<[number, number]> = [[20, 0], [24, 6], [22, 12], [30, 18], [28, 26], [36, 32], [34, 40], [42, 46]];
    for (const [x, y] of crack) rect(g, x, y, 2, 6, ink);
  }
}

/** The dock band: a 50% dither in the mid tone, like the reference's dotted dock. */
export function paintDockBand(g: PixelCtx): void {
  const h = SCREEN_H - HOME.dockY;
  dither(g, 0, 0, PHONE.screen.w, h, hex('phone.lcd.mid'));
  rect(g, 0, 0, PHONE.screen.w, 1, hex('phone.lcd.mid'));
}

export const STATUS_ICONS = { w: 34, h: 9 } as const;

/** Signal bars (filled = have, hollow = missing) + battery with its level. */
export function paintStatusIcons(g: PixelCtx, bars: number, battery: number, low: boolean): void {
  const ink = hex('phone.lcd.ink'), bg = hex('phone.lcd.bg');
  [2, 4, 6, 8].forEach((h, i) => {
    const x = i * 3, y = 8 - h;
    if (i < bars) rect(g, x, y, 2, h, ink);
    else { rect(g, x, y, 2, 1, ink); rect(g, x, y + h - 1, 2, 1, ink); }
  });
  const bx = 14;
  rect(g, bx, 0, 18, 9, ink); rect(g, bx + 1, 1, 16, 7, bg);
  rect(g, bx + 2, 2, Math.round((14 * battery) / 100), 5, low ? hex('phone.accent.alert') : ink);
  rect(g, bx + 18, 3, 2, 3, ink);
}
