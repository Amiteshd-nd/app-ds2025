import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs build script, no types
import { CHARSET, OVERRIDES, embolden, loadFont, sampleGlyph } from '../../scripts/import-font.mjs';
import metrics from '../assets/fonts/metrics.json';
import { nextFocus } from '../ui/kit/focus';
import { ICONS, ICON_NAMES } from '../ui/kit/icons';
import { appTile, blockRow, hudPlate, labelCard, MIN_TAP, phonePill, tapZone, UI_STATES, type UiState } from '../ui/kit/molecules';
import { cornerInset, ring, roundRect, type PixelCtx } from '../ui/kit/pixel';
import { clockText, measure, missingGlyphs, rupees, truncate, wrap } from '../ui/kit/text';
import { hex } from '../ui/tokens';

/** A PixelCtx that records the final colour of every pixel. */
function canvas() {
  const px = new Map<string, string>();
  const g: PixelCtx = {
    fillStyle: '',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.set(`${x + i},${y + j}`, String(this.fillStyle));
    },
  };
  return { g, px, at: (x: number, y: number) => px.get(`${x},${y}`) };
}

describe('bitmap font (ADR-114)', () => {
  const font = loadFont();
  const ascii = (ch: string) => {
    const { px } = sampleGlyph(font.charToGlyph(ch));
    const rows = Array.from({ length: 7 }, () => Array(5).fill('.'));
    for (const [x, y] of px) if (y >= -7 && y < 0 && x >= 0 && x < 5) rows[y + 7][x] = '#';
    return rows.map((r) => r.join(''));
  };

  it('samples Pixelify Sans on its own grid: H is 5×7, crossbar plus the font\'s own tooth above it', () => {
    // The outline really has a 1px step above the crossbar's centre (241–343 × 359–450 units).
    expect(ascii('H')).toEqual(['#...#', '#...#', '#.#.#', '#####', '#...#', '#...#', '#...#']);
  });

  it('gives every glyph a whole-pixel advance (586 units → 6px, never 6.3)', () => {
    expect(sampleGlyph(font.charToGlyph('H')).adv).toBe(6);
    for (const adv of Object.values(metrics.advance)) expect(Number.isInteger(adv)).toBe(true);
  });

  it('covers the charset, with ₹ and the legibility fixes hand-drawn', () => {
    for (const ch of CHARSET) expect(metrics.advance, ch).toHaveProperty(ch);
    for (const ch of ['₹', '5', 'Z', 'B', ',', '(', ')']) expect(metrics.overrides).toContain(ch);
    expect(OVERRIDES['5'].rows[0]).toBe('#####'); // a flat-topped 5, not Pixelify's S-like one
  });

  it('pixel bold doubles each pixel one to the right and is one wider', () => {
    const b = embolden({ px: [[0, -1]], adv: 3 });
    expect(b.adv).toBe(4);
    expect(b.px).toEqual([[0, -1], [1, -1]]);
  });

  it('keeps the line box: 7px caps, 2 rows above for accents', () => {
    expect(metrics).toMatchObject({ capHeight: 7, capTop: 2, base: 9, lineHeight: 12 });
  });
});

describe('text atoms', () => {
  it('measures exactly what BitmapText draws; bold adds 1 per glyph', () => {
    expect(measure('HH')).toBe(12);
    expect(measure('HH', true)).toBe(14);
    expect(measure('HH', false, 2)).toBe(24);
  });

  it('formats rupees the Indian way, signed when asked', () => {
    expect(rupees(30690)).toBe('₹30,690');
    expect(rupees(120000)).toBe('₹1,20,000');
    expect(rupees(-40, true)).toBe('-₹40');
    expect(rupees(500, true)).toBe('+₹500');
  });

  it('wraps to a width and truncates with an ellipsis', () => {
    const lines = wrap('Shanthamma here. Gate closes 10 PM sharp. No outside non-veg in the room.', 120);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(120);
    expect(lines.join(' ')).toBe('Shanthamma here. Gate closes 10 PM sharp. No outside non-veg in the room.');
    const cut = truncate('Kempegowda International Airport', 80);
    expect(cut.endsWith('…')).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(80);
  });

  it('reads the clock as HH:MM and finds glyphs the font cannot draw', () => {
    expect(clockText(521)).toBe('08:41');
    expect(missingGlyphs('Hello 📱')).toEqual(['📱']);
    expect(missingGlyphs('₹20 — chai…')).toEqual([]);
  });
});

describe('pixel atoms', () => {
  it('rounds corners per row and leaves a ring hollow', () => {
    expect(cornerInset(0, 10, 3)).toBeGreaterThan(0);
    expect(cornerInset(5, 10, 3)).toBe(0);
    const { g, at } = canvas();
    roundRect(g, 0, 0, 10, 10, 3, 'a');
    expect(at(0, 0)).toBeUndefined(); // corner cut
    expect(at(5, 5)).toBe('a');
    const r = canvas();
    ring(r.g, 0, 0, 12, 12, 3, 2, 'b');
    expect(r.at(0, 6)).toBe('b');
    expect(r.at(6, 6)).toBeUndefined(); // inside untouched
  });
});

describe('UI-kit molecules: every state paints differently (ADR-114)', () => {
  const paintAll = (paint: (g: PixelCtx, s: UiState) => unknown) =>
    UI_STATES.map((s) => { const c = canvas(); paint(c.g, s); return [...c.px.entries()].sort().join('|'); });

  it.each([
    ['phone pill', (g: PixelCtx, s: UiState) => phonePill(g, 0, 0, 60, 20, s)],
    ['app tile', (g: PixelCtx, s: UiState) => appTile(g, 0, 0, 'chats', s)],
    ['HUD plate', (g: PixelCtx, s: UiState) => hudPlate(g, 0, 0, 40, 19, s)],
  ])('%s has five distinct looks', (_, paint) => {
    expect(new Set(paintAll(paint)).size).toBe(5);
  });

  it('a locked app tile is a dotted outline + dithered glyph, no solid ring', () => {
    const { g, at } = canvas();
    const painted = appTile(g, 0, 0, 'maps', 'locked');
    expect(at(0, 0)).toBe(hex('phone.lcd.mid'));
    expect(at(1, 0)).toBeUndefined(); // dotted
    expect(painted.ink).toBe('phone.lcd.mid');
  });

  it('focus inverts, pressed sinks by the shadow', () => {
    expect(phonePill(canvas().g, 0, 0, 60, 20, 'focus')).toEqual({ ink: 'phone.lcd.bg', dy: 0 });
    expect(phonePill(canvas().g, 0, 0, 60, 20, 'pressed').dy).toBe(2);
    expect(hudPlate(canvas().g, 0, 0, 40, 19, 'focus').ink).toBe('hud.plate');
  });

  it('the label card leaves its right edge open with a dotted trail', () => {
    const { g, at } = canvas();
    labelCard(g, 0, 0, 40, 19, 'default', 3);
    expect(at(0, 9)).toBe(hex('hud.border')); // left edge
    expect(at(39, 9)).not.toBe(hex('hud.border')); // no right edge
    expect(at(42, 0)).toBe(hex('hud.border')); // trail
    expect(at(44, 0)).toBeUndefined();
  });

  it('a block row fills `value` of `max` blocks', () => {
    const { g, at } = canvas();
    const w = blockRow(g, 0, 0, 2, 5);
    expect(w).toBe(5 * 5 + 4 * 2);
    expect(at(2, 2)).toBe(hex('hud.text'));
    expect(at(14 + 2, 2)).toBeUndefined(); // third block hollow
  });

  it('every touch zone is at least MIN_TAP square, centred on the drawing', () => {
    const z = tapZone(100, 100, 28, 28);
    expect(z.w).toBeGreaterThanOrEqual(MIN_TAP);
    expect(z.x + z.w / 2).toBe(114);
    expect(tapZone(0, 0, 60, 50)).toMatchObject({ w: 60, h: 50 });
  });

  it('icons are our own 2px-stroke set, each fits a 16px box', () => {
    for (const name of ICON_NAMES) {
      const rows = ICONS[name];
      expect(rows.length, name).toBeLessThanOrEqual(16);
      expect(Math.max(...rows.map((r) => r.length)), name).toBeLessThanOrEqual(16);
    }
  });
});

describe('focus navigation', () => {
  // 2×2 grid + one wide bar underneath.
  const boxes = [
    { x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 },
    { x: 0, y: 20, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 },
    { x: 0, y: 40, w: 30, h: 10 },
  ];
  it('moves along rows and columns, and stays put at an edge', () => {
    expect(nextFocus(boxes, 0, 'right')).toBe(1);
    expect(nextFocus(boxes, 1, 'down')).toBe(3);
    expect(nextFocus(boxes, 3, 'down')).toBe(4);
    expect(nextFocus(boxes, 0, 'left')).toBe(0);
    expect(nextFocus([], 0, 'down')).toBe(-1);
  });
});
