/**
 * One input map for every device (mobile foundation §5 rule 1).
 *
 * Keyboard, on-screen joystick and (later) gamepad all write the same four
 * values; Player reads only this. No scene ever asks "is this a phone?".
 *
 * Touch values are written by HudScene's on-screen joystick and action button; keyboard is
 * read by Player itself and merged here, so a phone with a Bluetooth
 * keyboard just works.
 */
export interface InputState {
  /** -1..1 horizontal axis from the joystick (keyboard is merged by Player). */
  axisX: number;
  /** -1..1 vertical axis, +1 = down (screen space). */
  axisY: number;
  /** Joystick pushed to its rim = run (rule: "push to edge"). */
  run: boolean;
  /** Set true by the A button; consumed (reset) by Player on the frame it acts. */
  interactPressed: boolean;
}

export const input: InputState = { axisX: 0, axisY: 0, run: false, interactPressed: false };

/** Joystick writes here. Magnitude ≥ RUN_THRESHOLD counts as a run. */
export const RUN_THRESHOLD = 0.85;
/** Below this the stick is centred — avoids drift from a resting thumb. */
export const DEAD_ZONE = 0.2;

export const setAxis = (x: number, y: number): void => {
  const mag = Math.hypot(x, y);
  if (mag < DEAD_ZONE) {
    input.axisX = 0; input.axisY = 0; input.run = false;
    return;
  }
  // Snap to the dominant cardinal when the stick is mostly one way, so the
  // 4-direction walk animation never faces a direction it is not moving in.
  const clamped = Math.min(1, mag);
  input.axisX = Math.abs(x) >= Math.abs(y) * 0.6 ? Math.sign(x) * clamped : 0;
  input.axisY = Math.abs(y) >= Math.abs(x) * 0.6 ? Math.sign(y) * clamped : 0;
  input.run = mag >= RUN_THRESHOLD;
};

export const pressInteract = (): void => { input.interactPressed = true; };

/** Player calls this once per frame; returns true if A was pressed since last frame. */
export const consumeInteract = (): boolean => {
  const pressed = input.interactPressed;
  input.interactPressed = false;
  return pressed;
};
