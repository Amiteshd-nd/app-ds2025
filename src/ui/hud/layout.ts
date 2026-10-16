import { GAME_HEIGHT, GAME_WIDTH } from '../../utils/constants';
import { MIN_TAP } from '../kit/molecules';

/**
 * HUD geometry (P6c, ADR-118), in game px at 1×. Pure numbers so tests can
 * hold the promises: every touch zone ≥ MIN_TAP, nothing tappable in the
 * bottom home-indicator strip, plates that never overlap.
 *
 * The screen is letterboxed sideways in landscape, so only the bottom strip
 * (~20px, the iPhone home indicator) needs a margin (mock board, ADR-114).
 */
export const HUD = {
  /** Outer margin for every corner plate. */
  pad: 8,
  /** One-line plate height: 7px caps + 6px above/below the text. */
  plateH: 19,
  /** Nothing tappable below this (home indicator). */
  safeBottom: GAME_HEIGHT - 20,
  /** The closed phone's button, top-right (PhoneScene draws it; the HUD lays out around it). */
  phoneButton: { x: GAME_WIDTH - 8 - 28, y: 8, size: 28 },
  /** Right edge shared by the clock and wallet plates: 6px clear of the phone button. */
  right: GAME_WIDTH - 8 - 28 - 6,
  /** Objective plate: ★ + one line; its text is truncated to keep clear of the clock. */
  objective: { x: 8, y: 8, maxTextW: 300 },
  /** Vertical rhythm of the top-left stack: plate, then the next plate 4px under it. */
  stackGap: 4,
  /** Location card text is truncated to this many px. */
  locationMaxTextW: 240,
  /** Meter plates: 7×7 icon + five 5px blocks. */
  meter: { h: 15, gap: 2, iconX: 4, blocksX: 15, w: 53 },
  /** SAVED glyph plate, under the phone button. */
  saved: { y: 8 + 28 + 4 },
  /** Toasts: centred, above the home strip — or above the dialogue card when one is up. */
  toast: { cx: GAME_WIDTH / 2, cy: 320, maxTextW: 400, gapAboveDialogue: 6 },
  /** Prompt bubble over an NPC: plate + 3-row tail, 6px above the head, bobbing 1px. */
  prompt: { h: 17, tailH: 3, lift: 6 },
  /** Touch controls (mobile foundation §5): stick bottom-left, context action bottom-right (mirrored by the joystick-side setting). */
  stick: { cx: 47, cy: 308, knob: 11 },
  action: { x: GAME_WIDTH - 8 - 52, y: 288, size: 52 },
} as const;

/** Joystick ring radius by the Settings → Controls size. Even the small one is a full MIN_TAP target. */
export const STICK_RADIUS = { small: 22, medium: 27, large: 32 } as const;
export type StickSize = keyof typeof STICK_RADIUS;

/** Where the stick and action button sit for a joystick side. */
export function touchLayout(side: 'left' | 'right', size: StickSize = 'medium') {
  const r = STICK_RADIUS[size];
  const stick = { cx: side === 'left' ? HUD.stick.cx : GAME_WIDTH - HUD.stick.cx, cy: HUD.stick.cy, r };
  const action = { ...HUD.action, x: side === 'left' ? HUD.action.x : HUD.pad };
  return { stick, action };
}

/** The stick's touch zone: the ring, grown to at least MIN_TAP. */
export function stickZone(stick: { cx: number; cy: number; r: number }) {
  const d = Math.max(stick.r * 2, MIN_TAP);
  return { x: stick.cx - d / 2, y: stick.cy - d / 2, w: d, h: d };
}

/** Width of a one-line plate: 6px in, optional glyph + 5px, the text, 7px out. */
export const plateWidth = (textW: number, glyphW = 0): number => 6 + (glyphW ? glyphW + 5 : 0) + textW + 7;

/** Which hour the sky changes: clockGlyph picks sunrise / sun / sunset / moon. */
export const SKY = { sunrise: 5 * 60, day: 8 * 60, sunset: 17 * 60, night: 19 * 60 } as const;

/** Ms per character of the dialogue typewriter, by the Settings → Gameplay speed (normal = the motion token). */
export const TYPEWRITER_MS = { slow: 60, normal: 30, fast: 12, instant: 0 } as const;
export type DialogueSpeed = keyof typeof TYPEWRITER_MS;
