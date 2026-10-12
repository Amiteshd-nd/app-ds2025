import { GAME_HEIGHT, GAME_WIDTH } from '../../utils/constants';
import { APP_TILE } from '../kit/molecules';

/**
 * Phone geometry (ADR-114), in game px at 1×. Pure numbers so tests can hold
 * the tap-target and safe-area promises.
 *
 * The phone rises from the bottom and stands full height with its chin past
 * the bottom edge: at 90% height a 4-column grid gives ~37pt targets on an
 * iPhone 15; this way every cell is 46×62 px ≈ 50×68pt.
 */
export const PHONE = {
  /** Frame incl. side buttons. */
  w: 206,
  h: 358,
  /** Frame's top-left on screen when fully open. */
  x: Math.round((GAME_WIDTH - 206) / 2),
  y: 2,
  /** Screen (LCD) inside the frame. */
  screen: { x: 11, y: 8, w: 184 },
  notch: { x: 62, w: 60, h: 13 },
  /** Bottom strip under the iPhone home indicator in landscape (~21pt): nothing tappable there. */
  gestureBar: 19,
} as const;

/** Visible LCD height: from the screen top to the bottom of the game canvas. */
export const SCREEN_H = GAME_HEIGHT - PHONE.y - PHONE.screen.y;

/** Screen-local y below which nothing interactive is placed. */
export const SAFE_BOTTOM = SCREEN_H - PHONE.gestureBar;

export const STATUS = { y: 3, carrierY: 17 } as const;

export const HOME = {
  cols: 4,
  rows: 3,
  cellW: 46,
  cellH: 62,
  top: 32,
  /** Tile offset inside its cell. */
  tileX: Math.floor((46 - APP_TILE) / 2),
  tileY: 4,
  labelY: 39,
  wallpaperY: 216,
  dotsY: 268,
  dockY: 276,
  dockTileY: 282,
} as const;

export const APP = {
  glyph: { x: 8, y: 24, size: 20 },
  title: { x: 38, y: 23, w: 122, h: 22 },
  contentTop: 54,
  /** In-app navigation bar. */
  nav: { x: 10, y: 282, w: 164, h: 30 },
} as const;

/** Home-grid cell for slot i (0-based, row-major). */
export const gridCell = (i: number) => ({
  x: (i % HOME.cols) * HOME.cellW,
  y: HOME.top + Math.floor(i / HOME.cols) * HOME.cellH,
  w: HOME.cellW,
  h: HOME.cellH,
});

export const dockCell = (i: number) => ({ x: i * HOME.cellW, y: HOME.dockY, w: HOME.cellW, h: SAFE_BOTTOM - HOME.dockY });

/** Rows of in-app list buttons: 40px faces on a 44px pitch, so every row is a full touch target. */
export const LIST = { x: 10, w: 164, rowH: 40, pitch: 44 } as const;
export const listRows = (): number => Math.floor((APP.nav.y - 8 - APP.contentTop) / LIST.pitch);

/**
 * Slide-up: 4 stepped moves over 250 ms (motion tokens), from below the screen
 * to PHONE.y. Reduced motion → one step, straight to open.
 */
export function slideSteps(steps: number, reducedMotion: boolean): number[] {
  if (reducedMotion || steps <= 1) return [PHONE.y];
  const from = GAME_HEIGHT;
  return Array.from({ length: steps }, (_, i) => Math.round(from + ((PHONE.y - from) * (i + 1)) / steps));
}

/** Stepped pop for a newly unlocked app: tile lifts 2, 4, 2, 0 px. */
export const POP_OFFSETS = [-2, -4, -2, 0] as const;
