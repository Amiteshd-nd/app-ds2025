import { GAME_HEIGHT, GAME_WIDTH } from '../../utils/constants';
import { MIN_TAP } from '../kit/molecules';

/**
 * HUD geometry (P6c, ADR-118; scaled by Larger text, ADR-119), in game px.
 * `hudLayout(k)` lays the plates out on a virtual canvas of 640/k × 360/k
 * that HudScene draws at scale k, so every plate, glyph and glyph of text
 * doubles together. Pure numbers so tests can hold the promises: every touch
 * zone ≥ MIN_TAP, nothing tappable in the bottom home-indicator strip,
 * plates that never overlap.
 *
 * The screen is letterboxed sideways in landscape, so only the bottom strip
 * (~20px, the iPhone home indicator) needs a margin (mock board, ADR-114).
 * Touch controls are physical and never scale (`TOUCH`).
 */
export type HudScale = 1 | 2;

export interface HudLayout {
  k: HudScale;
  /** Virtual canvas. */
  W: number;
  H: number;
  /** Outer margin for every corner plate. */
  pad: number;
  /** One-line plate height: 7px caps + 6px above/below the text. */
  plateH: number;
  /** Nothing tappable below this (home indicator), in virtual px. */
  safeBottom: number;
  /** The closed phone's button, top-right (PhoneScene draws it at scale k; the HUD lays out around it). */
  phoneButton: { x: number; y: number; size: number };
  /** Right edge shared by the clock and wallet plates: 6px clear of the phone button. */
  right: number;
  /** Objective plate: ★ + one line; its text is truncated to keep clear of the clock. */
  objective: { x: number; y: number; maxTextW: number };
  /** Vertical rhythm of the top-left stack: plate, then the next plate 4px under it. */
  stackGap: number;
  /** Location card text is truncated to this many px. */
  locationMaxTextW: number;
  /** Meter plates: 7×7 icon + five 5px blocks. */
  meter: { h: number; gap: number; iconX: number; blocksX: number; w: number };
  /** SAVED glyph plate, under the phone button. */
  saved: { y: number };
  /** Toasts: centred, above the home strip — or above the dialogue card when one is up. */
  toast: { cx: number; cy: number; maxTextW: number; gapAboveDialogue: number };
  /** Prompt bubble over an NPC: plate + 3-row tail, 6px above the head, bobbing 1px. */
  prompt: { h: number; tailH: number; lift: number };
}

/** Widest clock plate: "DAY 99 · 23:59" bold with a 9px glyph. */
const CLOCK_W_MAX = 130;

export function hudLayout(k: HudScale = 1): HudLayout {
  const W = GAME_WIDTH / k, H = GAME_HEIGHT / k;
  const pad = 8, btn = 28, plateH = 19;
  const right = W - pad - btn - 6;
  return {
    k, W, H, pad, plateH,
    safeBottom: H - 20 / k,
    phoneButton: { x: W - pad - btn, y: pad, size: btn },
    right,
    objective: { x: pad, y: pad, maxTextW: Math.min(300, right - CLOCK_W_MAX - pad - 25 - 8) },
    stackGap: 4,
    locationMaxTextW: Math.min(240, W - 140),
    meter: { h: 15, gap: 2, iconX: 4, blocksX: 15, w: 53 },
    saved: { y: pad + btn + 4 },
    toast: { cx: W / 2, cy: H - 40 / k, maxTextW: Math.min(400, W - 80), gapAboveDialogue: 6 },
    prompt: { h: 17, tailH: 3, lift: 6 },
  };
}

/** The 1× layout — what the dialogue card and most tests build on. */
export const HUD = hudLayout(1);

/** Touch controls (mobile foundation §5): physical, never scaled. Stick bottom-left, context action bottom-right (mirrored by the joystick-side setting). */
export const TOUCH = {
  stick: { cx: 47, cy: 308, knob: 11 },
  action: { x: GAME_WIDTH - 8 - 52, y: 288, size: 52 },
} as const;

/** Joystick ring radius by the Settings → Controls size. Even the small one is a full MIN_TAP target. */
export const STICK_RADIUS = { small: 22, medium: 27, large: 32 } as const;
export type StickSize = keyof typeof STICK_RADIUS;

/** Where the stick and action button sit for a joystick side. */
export function touchLayout(side: 'left' | 'right', size: StickSize = 'medium') {
  const r = STICK_RADIUS[size];
  const stick = { cx: side === 'left' ? TOUCH.stick.cx : GAME_WIDTH - TOUCH.stick.cx, cy: TOUCH.stick.cy, r };
  const action = { ...TOUCH.action, x: side === 'left' ? TOUCH.action.x : HUD.pad };
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

/** HUD scale from Settings → Accessibility → Larger text. */
export const hudScale = (largerText: boolean): HudScale => (largerText ? 2 : 1);
