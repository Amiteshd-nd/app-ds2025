import metrics from '../../assets/fonts/metrics.json';

/**
 * Text atoms for the bitmap font (ADR-114): measuring, wrapping, rupees.
 *
 * Pure — layout code and tests measure exactly what BitmapText will draw,
 * because both read the advances scripts/import-font.mjs wrote.
 * `FONT.capTop`: a line box has 2 empty rows above the capitals (accents), so
 * to put caps at y, place the text at y − capTop.
 */
export const FONT = {
  regular: 'px',
  bold: 'pxb',
  size: metrics.size,
  capHeight: metrics.capHeight,
  capTop: metrics.capTop,
  lineHeight: metrics.lineHeight,
} as const;

const ADVANCE = metrics.advance as Record<string, number>;

/** Characters the font can draw. Anything else renders as '?'. */
export const hasGlyph = (ch: string): boolean => ch in ADVANCE;

/** Width in px at scale k, exactly as BitmapText lays it out. */
export function measure(text: string, bold = false, k = 1): number {
  let w = 0;
  for (const ch of text) w += (ADVANCE[ch] ?? ADVANCE['?']) + (bold ? 1 : 0);
  return w * k;
}

/** Characters in `text` the font cannot draw (content validation uses this). */
export const missingGlyphs = (text: string): string[] => [...new Set([...text].filter((ch) => !hasGlyph(ch) && ch !== '\n'))];

/** Word-wrap to `width` px. A word longer than the line is broken by characters. */
export function wrap(text: string, width: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, bold) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      line = '';
      let rest = word;
      while (measure(rest, bold) > width) {
        let n = rest.length;
        while (n > 1 && measure(rest.slice(0, n), bold) > width) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** Cut to `width` px with a trailing '…'. */
export function truncate(text: string, width: number, bold = false): string {
  if (measure(text, bold) <= width) return text;
  let n = text.length;
  while (n > 0 && measure(`${text.slice(0, n).trimEnd()}…`, bold) > width) n--;
  return `${text.slice(0, n).trimEnd()}…`;
}

/** Indian grouping: 1,20,000 — never 120,000. */
export const groupIndian = (n: number): string => Math.abs(Math.round(n)).toLocaleString('en-IN');

/** '₹30,690'; with `sign`, '+₹500' / '-₹40'. */
export const rupees = (n: number, sign = false): string =>
  `${sign ? (n < 0 ? '-' : '+') : n < 0 ? '-' : ''}₹${groupIndian(n)}`;

/** '08:41' from minutes since midnight. */
export const clockText = (minute: number): string =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
