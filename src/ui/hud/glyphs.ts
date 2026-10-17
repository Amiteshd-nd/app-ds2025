import type { Bitmap } from '../kit/pixel';
import { POI_GLYPHS } from '../map/glyphs';

/**
 * HUD glyph atoms (P6c, ADR-118): tiny 1px-stroke drawings that sit inside
 * plates next to bold text. Our own, in the style of the map's 7×7 set — the
 * ★ is the same star the map pins the objective with.
 */
export const HUD_GLYPHS = {
  /** The objective marker, shared with the map. */
  star: POI_GLYPHS.star.rows,
  /** Time of day beside the clock (clockGlyph picks one). */
  sunrise: ['....#....', '.#..#..#.', '..#####..', '.#######.', '#########', '.........', '#########'] as Bitmap,
  sun: ['..#.#..', '.#####.', '#######', '#######', '#######', '.#####.', '..#.#..'] as Bitmap,
  sunset: ['.........', '.........', '.#..#..#.', '..#####..', '#########', '.........', '#########'] as Bitmap,
  moon: ['..####.', '.##....', '###....', '###....', '###....', '.##....', '..####.'] as Bitmap,
  /** A fingertip, for touch prompts ("tap"). */
  tap: ['..##...', '..##...', '..##...', '..####.', '#######', '#######', '.#####.', '.#####.', '..###..'] as Bitmap,
  /** The dialogue's "more" chevron, blinking at the card's corner. */
  chevron: ['#####', '.###.', '..#..'] as Bitmap,
  /** The autosave glyph: a floppy, because everyone still knows it. */
  saved: ['######.', '#.##..#', '#.##..#', '#.....#', '#.###.#', '#.###.#', '#######'] as Bitmap,
  /** Meter icons (7 wide): health, food, stress. */
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'] as Bitmap,
  bowl: ['.#.#.#.', '#.#.#.#', '#######', '.#####.', '..###..', '..###..'] as Bitmap,
  fuel: ['.####..', '.#..#..', '.#..#.#', '.####.#', '.####.#', '.####.#', '.######'] as Bitmap,
  /** Energy pips while running in Act 4 (ADR-145): a runner mid-stride. */
  run: ['...##..', '...##..', '.####..', '#.##.#.', '..##...', '.#..#..', '#....#.'] as Bitmap,
  bolt: ['...###.', '..###..', '.###...', '.######', '...###.', '..###..', '.###...'] as Bitmap,
  /** The dialogue cursor on the chosen pill. */
  cursor: ['#..', '##.', '###', '##.', '#..'] as Bitmap,
} as const;

export type HudGlyphName = keyof typeof HUD_GLYPHS;
