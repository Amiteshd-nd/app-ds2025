/**
 * Pixelify Sans (SIL OFL 1.1) → the game's bitmap font (ADR-114).
 *
 *   node scripts/import-font.mjs        (also runs inside `pnpm art`)
 *
 * Pixelify Sans is drawn on its own pixel grid: one font pixel ≈ 93 units,
 * glyphs start at x = 60 and sit on y = -12. Browsers rasterise it at
 * fractional advances (586 units = 6.3px), so letters land on different
 * sub-pixel phases and smear. This script ignores the browser entirely: it
 * samples each outline at the centre of every font pixel (nonzero winding),
 * which gives the exact grid the designer drew, then gives every glyph a
 * whole-pixel advance.
 *
 * A few glyphs are hand-drawn instead (OVERRIDES): ₹ (the font has none),
 * 5, Z and B (designed to read as S, 2 and G at game size — bad for prices
 * and clocks), ( and ) (they read as braces), the comma (thinner than one pixel) and UI marks the font lacks.
 * Pixelify Sans reserves no font name; ours is labelled "based on Pixelify
 * Sans" and ships with OFL.txt (CREDITS.md, Settings → About).
 *
 * Outputs (src/assets/fonts/):
 *   px.png / px.xml        regular, AngelCode BMFont for Phaser BitmapText
 *   pxb.png / pxb.xml      pixel bold: the regular glyph doubled 1px right
 *   metrics.json           advances + vertical metrics, for pure layout code
 * Bold is never the font's own 700 weight: at 1× it falls off the grid.
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const RAW = join(root, 'src/assets/_raw/fonts');
const OUT = join(root, 'src/assets/fonts');

/** The font's pixel grid, measured from 'H' (5 px wide, 60 → 525) and caps (7 px, -12 → 631). */
export const GRID = { unitX: 93, unitY: 643 / 7, originX: 60, originY: -12 };
/** Line box: 2 rows above caps for accents, 7 cap rows, 3 descender rows. */
export const METRICS = { size: 11, capHeight: 7, capTop: 2, base: 9, lineHeight: 12 };

/** Printable ASCII + what content uses (scanned from src/data) + UI marks. */
export const CHARSET = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  '₹', '—', '–', '…', '·', '→', '←', '≥', '−', '≈', '×', 'é', '‘', '’', '“', '”', '▶', '▼', '▲', '★', '✓', '○', '•', '°',
];

/** Hand-drawn glyphs: rows top→bottom, top row's y relative to the baseline, advance. */
export const OVERRIDES = {
  ' ': { rows: [], top: 0, adv: 3 }, // the font's 2px space runs words together at 1×
  '₹': { rows: ['#####', '...#.', '#####', '...#.', '###..', '..#..', '...##'], top: -7, adv: 6 },
  '5': { rows: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'], top: -7, adv: 6 },
  Z: { rows: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'], top: -7, adv: 6 },
  B: { rows: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'], top: -7, adv: 6 }, // the font's round-topped B reads as G
  '(': { rows: ['.#', '#.', '#.', '#.', '#.', '#.', '.#'], top: -7, adv: 3 }, // the font's stepped parens read as braces
  ')': { rows: ['#.', '.#', '.#', '.#', '.#', '.#', '#.'], top: -7, adv: 3 },
  ',': { rows: ['.#', '.#', '#.'], top: -2, adv: 3 },
  '▶': { rows: ['#..', '##.', '###', '##.', '#..'], top: -6, adv: 4 },
  '▼': { rows: ['#####', '.###.', '..#..'], top: -5, adv: 6 },
  '▲': { rows: ['..#..', '.###.', '#####'], top: -5, adv: 6 },
  '★': { rows: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'], top: -7, adv: 8 },
  '✓': { rows: ['.....#', '....##', '#..##.', '####..', '.##...'], top: -6, adv: 7 },
  '○': { rows: ['.###.', '#...#', '#...#', '#...#', '.###.'], top: -6, adv: 6 },
  '•': { rows: ['##', '##'], top: -5, adv: 3 },
  '→': { rows: ['...#.', '....#', '#####', '....#', '...#.'], top: -6, adv: 6 },
  '←': { rows: ['.#...', '#....', '#####', '#....', '.#...'], top: -6, adv: 6 },
};

// ── Outline sampling ──────────────────────────────────────────────────────

/** Flatten an opentype path (font units, y up) into closed polygons. */
export function polygons(commands) {
  const polys = [];
  let cur = [], x = 0, y = 0;
  const STEPS = 8;
  for (const c of commands) {
    if (c.type === 'M') { if (cur.length) polys.push(cur); cur = [[c.x, c.y]]; x = c.x; y = c.y; }
    else if (c.type === 'L') { cur.push([c.x, c.y]); x = c.x; y = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= STEPS; i++) { const t = i / STEPS, u = 1 - t; cur.push([u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y]); }
      x = c.x; y = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS, u = 1 - t;
        cur.push([u ** 3 * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x, u ** 3 * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'Z') { if (cur.length) polys.push(cur); cur = []; }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

/** Nonzero winding: is (px, py) inside any of the polygons? */
export function inside(polys, px, py) {
  let wn = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const side = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
      if (y1 <= py) { if (y2 > py && side > 0) wn++; }
      else if (y2 <= py && side < 0) wn--;
    }
  }
  return wn !== 0;
}

/**
 * One glyph → pixels [x, y] with y relative to the baseline (negative = up).
 * Samples every font-pixel centre from 3 rows below the baseline to 2 above caps.
 */
export function sampleGlyph(glyph) {
  const path = glyph.getPath(0, 0, 1000); // 1000px at upm 1000 = font units, y flipped
  const polys = polygons(path.commands.map((c) => ({ ...c, y: c.y === undefined ? c.y : -c.y, y1: c.y1 === undefined ? c.y1 : -c.y1, y2: c.y2 === undefined ? c.y2 : -c.y2 })));
  const px = [];
  const { unitX, unitY, originX, originY } = GRID;
  for (let row = -3; row < METRICS.capHeight + 2; row++) {
    const cy = originY + unitY * (row + 0.5);
    for (let col = -1; col < 12; col++) {
      const cx = originX + unitX * (col + 0.5);
      if (inside(polys, cx, cy)) px.push([col, -(row + 1)]);
    }
  }
  return { px, adv: Math.max(1, Math.round(glyph.advanceWidth / unitX)) };
}

const fromRows = ({ rows, top, adv }) => ({
  px: rows.flatMap((r, j) => [...r].map((v, i) => (v === '#' ? [i, top + j] : null)).filter(Boolean)),
  adv,
});

export function buildGlyphs(font) {
  const glyphs = {};
  const missing = [];
  for (const ch of CHARSET) {
    if (OVERRIDES[ch]) { glyphs[ch] = fromRows(OVERRIDES[ch]); continue; }
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) { missing.push(ch); continue; }
    glyphs[ch] = sampleGlyph(g);
  }
  return { glyphs, missing };
}

/** Pixel bold: every pixel doubled one to the right; one wider. */
export const embolden = ({ px, adv }) => ({
  px: [...new Map([...px, ...px.map(([x, y]) => [x + 1, y])].map((p) => [p.join(','), p])).values()],
  adv: adv + 1,
});

// ── Atlas + BMFont ───────────────────────────────────────────────────────

async function writeFont(name, glyphs) {
  const CELL_W = 12, CELL_H = METRICS.lineHeight, COLS = 16;
  const chars = Object.keys(glyphs);
  const W = CELL_W * COLS, H = CELL_H * Math.ceil(chars.length / COLS);
  const rgba = Buffer.alloc(W * H * 4);
  const lines = [];
  chars.forEach((ch, i) => {
    const { px, adv } = glyphs[ch];
    const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * CELL_H;
    const minX = px.length ? Math.min(0, ...px.map((p) => p[0])) : 0;
    const maxX = px.length ? Math.max(...px.map((p) => p[0])) : 0;
    for (const [x, y] of px) {
      const ax = cx + x - minX, ay = cy + METRICS.base + y;
      if (ay < cy || ay >= cy + CELL_H || ax >= cx + CELL_W) throw new Error(`glyph "${ch}" leaves its cell`);
      rgba.fill(255, (ay * W + ax) * 4, (ay * W + ax) * 4 + 4);
    }
    const w = px.length ? maxX - minX + 1 : 0;
    lines.push(`  <char id="${ch.codePointAt(0)}" x="${cx}" y="${cy}" width="${w}" height="${CELL_H}" xoffset="${minX}" yoffset="0" xadvance="${adv}" page="0" chnl="15" />`);
  });
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(join(OUT, `${name}.png`));
  writeFileSync(join(OUT, `${name}.xml`), [
    '<?xml version="1.0"?>',
    '<!-- Generated by scripts/import-font.mjs from Pixelify Sans (SIL OFL 1.1). Do not edit. -->',
    '<font>',
    `  <info face="${name}" size="${METRICS.size}" bold="0" italic="0" smooth="0" aa="1" padding="0,0,0,0" spacing="0,0" />`,
    `  <common lineHeight="${METRICS.lineHeight}" base="${METRICS.base}" scaleW="${W}" scaleH="${H}" pages="1" packed="0" />`,
    `  <pages><page id="0" file="${name}.png" /></pages>`,
    `  <chars count="${chars.length}">`,
    ...lines,
    '  </chars>',
    '</font>',
    '',
  ].join('\n'));
}

/** The source font, parsed. */
export function loadFont() {
  const buf = readFileSync(join(RAW, 'PixelifySans-wght.ttf'));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export async function importFont() {
  const font = loadFont();
  const { glyphs, missing } = buildGlyphs(font);
  if (missing.length) throw new Error(`Pixelify Sans lacks ${missing.join(' ')} — add them to OVERRIDES`);
  const bold = Object.fromEntries(Object.entries(glyphs).map(([ch, g]) => [ch, embolden(g)]));
  mkdirSync(OUT, { recursive: true });
  await writeFont('px', glyphs);
  await writeFont('pxb', bold);
  writeFileSync(join(OUT, 'metrics.json'), `${JSON.stringify({
    $comment: 'Generated by scripts/import-font.mjs. Advances in px at 1×; bold adds 1. Do not edit.',
    ...METRICS,
    overrides: Object.keys(OVERRIDES),
    advance: Object.fromEntries(Object.entries(glyphs).map(([ch, g]) => [ch, g.adv])),
  }, null, 2)}\n`);
  // The licence ships with every build (public/ is copied verbatim).
  mkdirSync(join(root, 'public/licenses'), { recursive: true });
  copyFileSync(join(RAW, 'OFL.txt'), join(root, 'public/licenses/OFL-PixelifySans.txt'));
  console.log(`✓ bitmap font — ${Object.keys(glyphs).length} glyphs (${Object.keys(OVERRIDES).length} hand-drawn), regular + pixel bold`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await importFont();
}
