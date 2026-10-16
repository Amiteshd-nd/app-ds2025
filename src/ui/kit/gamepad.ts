import type Phaser from 'phaser';
import type { Direction } from './focus';

/**
 * Gamepad atoms (ADR-119; mobile foundation §5 rule 1): one standard-mapping
 * button table and one `attachGamepad` that turns a pad into the same
 * confirm / back / direction intents the keyboard produces. Scenes never read
 * a pad themselves. Phaser's gamepad plugin is scene-scoped, so each scene
 * attaches once and detaches on shutdown.
 */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** Stick past this counts as a direction. */
export const STICK_DEAD = 0.5;
/** Held stick: first repeat after `first` ms, then every `next` ms. */
export const STICK_REPEAT = { first: 300, next: 120 } as const;

export interface PadHandlers {
  /** A face/shoulder/menu button went down (PAD.*; d-pad arrives as `dir`). */
  button?: (index: number) => void;
  /** D-pad press, or the left stick pushed past the dead zone (with key-like repeat). */
  dir?: (dir: Direction) => void;
}

const DPAD: Record<number, Direction> = { [PAD.UP]: 'up', [PAD.DOWN]: 'down', [PAD.LEFT]: 'left', [PAD.RIGHT]: 'right' };

/** The direction a stick points, or null inside the dead zone. */
export function stickDirection(x: number, y: number, dead = STICK_DEAD): Direction | null {
  if (Math.abs(x) < dead && Math.abs(y) < dead) return null;
  return Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

/**
 * Key-like repeat for a held stick: call with the current direction and time;
 * returns true when a `dir` event is due.
 */
export class StickRepeat {
  private held: Direction | null = null;
  private nextAt = 0;

  step(dir: Direction | null, time: number): boolean {
    if (dir !== this.held) {
      this.held = dir;
      if (!dir) return false;
      this.nextAt = time + STICK_REPEAT.first;
      return true;
    }
    if (dir && time >= this.nextAt) { this.nextAt = time + STICK_REPEAT.next; return true; }
    return false;
  }

  reset(): void { this.held = null; }
}

/** Wire a scene's gamepad to handlers while `enabled()` holds. Returns the detach. */
export function attachGamepad(scene: Phaser.Scene, h: PadHandlers, enabled: () => boolean = () => true): () => void {
  const gp = scene.input.gamepad;
  if (!gp) return () => {};
  const onDown = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
    if (!enabled()) return;
    const d = DPAD[button.index];
    if (d) h.dir?.(d);
    else h.button?.(button.index);
  };
  gp.on('down', onDown);
  const repeat = new StickRepeat();
  const update = (time: number) => {
    if (!enabled()) { repeat.reset(); return; }
    const pad = gp.getPad(0);
    if (!pad) return;
    const dir = stickDirection(pad.leftStick.x, pad.leftStick.y);
    if (repeat.step(dir, time) && dir) h.dir?.(dir);
  };
  scene.events.on('update', update);
  return () => {
    gp.off('down', onDown);
    scene.events.off('update', update);
  };
}

/** The left stick as an axis for walking (HudScene), or null when no pad is connected. */
export function walkAxis(scene: Phaser.Scene): { x: number; y: number } | null {
  const pad = scene.input.gamepad?.getPad(0);
  if (!pad) return null;
  return { x: pad.leftStick.x, y: pad.leftStick.y };
}
