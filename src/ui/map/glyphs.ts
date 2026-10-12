import type { TokenName } from '../tokens';
import type { Bitmap } from '../kit/pixel';
import type { MapPoiKind, MapRegionKind } from '../../utils/types';

/**
 * Map glyph atoms (`tile_mapglyph_*`, P6b): each region kind is a field of
 * one small glyph on the 8px grid, two variants alternating so the field
 * reads as texture, not wallpaper. Our own drawings in the style of the
 * user's symbolic-map reference.
 */
export const REGION_GLYPHS: Record<MapRegionKind, { tint: TokenName; glyphs: [Bitmap, Bitmap] }> = {
  park: { tint: 'map.park', glyphs: [['..##..', '.####.', '######', '.####.', '..##..', '..##..'], ['......', '..##..', '.####.', '.####.', '..##..', '......']] },
  lake: { tint: 'map.water', glyphs: [['......', '.##..#', '#..##.', '......', '.##..#', '#..##.'], ['......', '.##...', '#..#..', '#..#..', '.##...', '......']] },
  commercial: { tint: 'map.commercial', glyphs: [['######', '#.##.#', '######', '#.#..#', '#.#..#'], ['######', '##..##', '######', '#..#.#', '#..#.#']] },
  it: { tint: 'map.it', glyphs: [['##..##', '##..##', '..##..', '..##..', '##..##', '##..##'], ['..##..', '..##..', '##..##', '##..##', '..##..', '..##..']] },
  residential: { tint: 'map.residential', glyphs: [['..##..', '.####.', '######', '#.##.#', '#.##.#'], ['......', '.####.', '######', '#....#', '#.##.#']] },
  hill: { tint: 'map.hill', glyphs: [['...#...', '..#.#..', '.#...#.', '#.....#'], ['.......', '...#...', '..#.#..', '.#...#.']] },
};

/** Icons beside nodes (7×7). ★ is the objective; the rest are POIs from city.json. */
export const POI_GLYPHS: Record<MapPoiKind | 'star', { tint: TokenName; rows: Bitmap }> = {
  star: { tint: 'map.star', rows: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'] },
  chai: { tint: 'map.path', rows: ['.#.#...', '#.#....', '.......', '#####..', '#####.#', '#####.#', '.###...'] },
  bus: { tint: 'map.path', rows: ['#######', '#.#.#.#', '#######', '#######', '#.###.#', '.#...#.'] },
  home: { tint: 'map.path', rows: ['...#...', '..###..', '.#####.', '#######', '.#...#.', '.#.#.#.', '.#.#.#.'] },
  uv: { tint: 'map.metro.purple', rows: ['.#####.', '#.....#', '.#####.', '..#.#..', '...#...', '...#...', '..###..'] },
  skull: { tint: 'map.danger', rows: ['.#####.', '#######', '#..#..#', '#######', '.#####.', '.#.#.#.'] },
  rumour: { tint: 'map.path', rows: ['.###.', '#...#', '...#.', '..#..', '..#..', '.....', '..#..'] },
};

/** Player heading arrows (7×7), by direction. */
export const ARROWS: Record<'n' | 'e' | 's' | 'w', Bitmap> = {
  n: ['...#...', '..###..', '.#####.', '#######', '...#...', '...#...', '...#...'],
  s: ['...#...', '...#...', '...#...', '#######', '.#####.', '..###..', '...#...'],
  e: ['...#...', '...##..', '...###.', '#######', '...###.', '...##..', '...#...'],
  w: ['...#...', '..##...', '.###...', '#######', '.###...', '..##...', '...#...'],
};

export const PADLOCK: Bitmap = ['.###.', '#...#', '#####', '##.##', '#####'];
