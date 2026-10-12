/**
 * Phone-in-landscape ergonomics for the Test Playground (dev only).
 *
 * Devices are simulated at their real CSS-pixel viewport, so the game's touch
 * controls appear at their true physical size. Two thumbs hold a phone in
 * landscape from the sides; each pivots just outside the screen edge, about a
 * quarter of the height up from the bottom. Reach is measured in millimetres
 * from that pivot (two-handed landscape grip, after Hoober's touch studies):
 * up to ~40 mm is comfortable, ~55 mm a stretch, beyond that hard.
 * Touch targets should be at least 9 mm (≈ Apple's 44 pt / Material's 48 dp).
 */

export interface DevicePreset {
  id: string;
  label: string;
  /** Landscape viewport in CSS px. */
  width: number;
  height: number;
  /** CSS px per millimetre on the glass. */
  pxPerMm: number;
  /** Landscape safe-area insets in CSS px (notch / camera / home indicator). */
  safe: { left: number; right: number; bottom: number };
  /** Draw a notch on the left edge. */
  notch: boolean;
}

export const DEVICES: DevicePreset[] = [
  { id: 'desktop', label: 'Desktop 16:9', width: 1280, height: 720, pxPerMm: 3.8, safe: { left: 0, right: 0, bottom: 0 }, notch: false },
  { id: 'iphone15', label: 'iPhone 15 (19.5:9)', width: 852, height: 393, pxPerMm: 6.04, safe: { left: 59, right: 59, bottom: 21 }, notch: true },
  { id: 'pixel7', label: 'Pixel 7 (20:9)', width: 915, height: 412, pxPerMm: 6.2, safe: { left: 32, right: 0, bottom: 0 }, notch: true },
  { id: 'android-small', label: 'Small Android (19.5:9, 360 dp)', width: 780, height: 360, pxPerMm: 6.3, safe: { left: 24, right: 0, bottom: 0 }, notch: true },
  { id: 'ipad', label: 'iPad (4:3)', width: 1024, height: 768, pxPerMm: 5.2, safe: { left: 0, right: 0, bottom: 20 }, notch: false },
];

export const deviceById = (id: string): DevicePreset => DEVICES.find((d) => d.id === id) ?? DEVICES[0];

export type HandSize = 'small' | 'medium' | 'large';
const HAND = { small: 0.85, medium: 1, large: 1.15 } as const;

/** Reach radii in mm from the thumb pivot. */
export const REACH_MM = { comfortable: 40, stretch: 55 } as const;
/** Minimum comfortable touch target. */
export const MIN_TARGET_MM = 9;

export interface Pivot { x: number; y: number }

/** Where each thumb pivots, in CSS px of the device viewport. */
export function thumbPivots(d: DevicePreset): { left: Pivot; right: Pivot } {
  const out = 8 * d.pxPerMm; // just outside the glass
  const y = d.height * 0.78;
  return { left: { x: -out, y }, right: { x: d.width + out, y } };
}

/** Reach radii in CSS px for a device and hand. */
export function reachPx(d: DevicePreset, hand: HandSize = 'medium') {
  return {
    comfortable: REACH_MM.comfortable * d.pxPerMm * HAND[hand],
    stretch: REACH_MM.stretch * d.pxPerMm * HAND[hand],
  };
}

export type Reach = 'comfortable' | 'stretch' | 'hard';

/** How hard a point is to reach with the nearer thumb. */
export function reachAt(d: DevicePreset, x: number, y: number, hand: HandSize = 'medium'): Reach {
  const { left, right } = thumbPivots(d);
  const r = reachPx(d, hand);
  const dist = Math.min(Math.hypot(x - left.x, y - left.y), Math.hypot(x - right.x, y - right.y));
  return dist <= r.comfortable ? 'comfortable' : dist <= r.stretch ? 'stretch' : 'hard';
}

export interface ControlReport {
  name: string;
  sizeMm: number;
  bigEnough: boolean;
  reach: Reach;
  /** True when the control sits inside a safe-area inset on this device. */
  inSafeArea: boolean;
}

/** Check one control's rectangle (CSS px in the device viewport). */
export function checkControl(
  d: DevicePreset, name: string, rect: { x: number; y: number; w: number; h: number }, hand: HandSize = 'medium',
): ControlReport {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const sizeMm = Math.min(rect.w, rect.h) / d.pxPerMm;
  return {
    name,
    sizeMm: Math.round(sizeMm * 10) / 10,
    bigEnough: sizeMm >= MIN_TARGET_MM,
    reach: reachAt(d, cx, cy, hand),
    inSafeArea: rect.x < d.safe.left || rect.x + rect.w > d.width - d.safe.right || rect.y + rect.h > d.height - d.safe.bottom,
  };
}
