import Phaser from 'phaser';
import { platform } from '../platform';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import { hudPlate } from '../ui/kit/molecules';
import { bake, pxText, pxTextShadow } from '../ui/kit/phaser';
import { roundRect, type PixelCtx } from '../ui/kit/pixel';
import { clockText, measure } from '../ui/kit/text';
import { hex, motion, type TokenName } from '../ui/tokens';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import { gameEvents } from '../core/events';

export interface WorkdaySceneData {
  day: number;
  /** Minutes since midnight when the player walked in and when they walk out. */
  from: number;
  to: number;
}

/** Sky colour by the hour, in the world's own palette (ADR-121). */
export const SKY_RAMP: Array<{ until: number; sky: TokenName }> = [
  { until: 11 * 60, sky: 'sky.morning' },
  { until: 14 * 60, sky: 'sky.noon' },
  { until: 16 * 60 + 30, sky: 'sky.afternoon' },
  { until: 17 * 60 + 40, sky: 'sky.evening' },
  { until: 18 * 60 + 30, sky: 'sky.dusk' },
  { until: 24 * 60, sky: 'sky.night' },
];

export const skyAt = (minute: number): TokenName => (SKY_RAMP.find((r) => minute < r.until) ?? SKY_RAMP[SKY_RAMP.length - 1]).sky;

/** The sun's place across the frame for a minute of the day: left horizon at 06:00, right horizon at 18:30. */
export function sunAt(minute: number, w = GAME_WIDTH, horizon = 230): { x: number; y: number; up: boolean } {
  const t = (minute - 6 * 60) / (18.5 * 60 - 6 * 60);
  return { x: Math.round(40 + t * (w - 80)), y: Math.round(horizon - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 170), up: t >= 0 && t <= 1 };
}

const FRAME = 10;
const SKYLINE_KEY = 'skyline_whitefield';

/**
 * WorkdayScene — the reusable "workday" transition (story 1.1 F4, ADR-121):
 * from a window seat, the Whitefield skyline in silhouette while the sky
 * steps from morning to dusk and the clock runs 09:30 → 18:00 in twelve
 * steps over six seconds. E / Enter / A / tap skips. Reduced motion shows the
 * last frame for a moment. Launched by WorldScene inside the office door's
 * fade; it emits `workday:done` and WorldScene fades the evening in.
 */
export class WorkdayScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.WORKDAY;

  private data_!: WorkdaySceneData;
  private step = 0;
  private steps = 12;
  private done = false;
  private sky!: Phaser.GameObjects.Rectangle;
  private sun!: Phaser.GameObjects.Image;
  private moon!: Phaser.GameObjects.Image;
  private texts!: Phaser.GameObjects.Container;
  private offPad: (() => void) | null = null;

  constructor() {
    super(WorkdayScene.KEY);
  }

  create(data: WorkdaySceneData): void {
    this.data_ = data;
    this.done = false;
    gameEvents.emit('audio:mode', { workday: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameEvents.emit('audio:mode', { workday: false }));
    this.step = 0;
    this.cameras.main.setRoundPixels(true);
    const reduced = platform.display.prefersReducedMotion();
    this.steps = reduced ? 1 : motion('m.workday.steps');

    this.sky = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, Phaser.Display.Color.HexStringToColor(hex(skyAt(data.from))).color).setOrigin(0);
    this.sun = this.add.image(0, 0, bake(this, 'wd:sun', 10, 10, (g: PixelCtx) => roundRect(g, 0, 0, 10, 10, 5, hex('sky.sun')))).setOrigin(0.5);
    this.moon = this.add.image(0, 0, bake(this, 'wd:moon', 8, 8, (g: PixelCtx) => roundRect(g, 0, 0, 8, 8, 4, hex('sky.moon')))).setOrigin(0.5).setVisible(false);
    if (this.textures.exists(SKYLINE_KEY)) {
      const img = this.textures.get(SKYLINE_KEY).getSourceImage() as { width: number; height: number };
      this.add.image(0, GAME_HEIGHT - img.height, SKYLINE_KEY).setOrigin(0);
    }
    // The window: a dark frame around the view, a sill at the bottom.
    const frame = bake(this, 'wd:frame', GAME_WIDTH, GAME_HEIGHT, (g: PixelCtx) => {
      g.fillStyle = hex('sky.silhouette');
      g.fillRect(0, 0, GAME_WIDTH, FRAME); g.fillRect(0, GAME_HEIGHT - FRAME - 6, GAME_WIDTH, FRAME + 6);
      g.fillRect(0, 0, FRAME, GAME_HEIGHT); g.fillRect(GAME_WIDTH - FRAME, 0, FRAME, GAME_HEIGHT);
      g.fillRect(GAME_WIDTH / 2 - 3, 0, 6, GAME_HEIGHT); // the mullion
    });
    this.add.image(0, 0, frame).setOrigin(0);
    this.texts = this.add.container(0, 0);

    const skip = () => this.finish();
    this.input.keyboard?.on('keydown-E', skip);
    this.input.keyboard?.on('keydown-ENTER', skip);
    this.input.keyboard?.on('keydown-SPACE', skip);
    this.input.once('pointerdown', skip);
    this.offPad = attachGamepad(this, { button: (b) => { if (b === PAD.A || b === PAD.START) skip(); } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.offPad?.(); this.offPad = null; });

    this.render();
    const stepMs = reduced ? 1200 : motion('m.workday') / this.steps;
    this.time.addEvent({ delay: stepMs, repeat: this.steps - 1, callback: () => { this.step++; this.render(); if (this.step >= this.steps) this.time.delayedCall(stepMs, () => this.finish()); } });
  }

  private minuteAt(step: number): number {
    const { from, to } = this.data_;
    return Math.round(from + ((to - from) * step) / this.steps);
  }

  private render(): void {
    const minute = this.minuteAt(Math.min(this.step, this.steps));
    this.sky.setFillStyle(Phaser.Display.Color.HexStringToColor(hex(skyAt(minute))).color);
    const sun = sunAt(minute);
    this.sun.setPosition(sun.x, sun.y).setVisible(sun.up);
    const moonRise = minute >= 17 * 60 + 30;
    this.moon.setVisible(moonRise).setPosition(GAME_WIDTH - 90, Math.max(60, 230 - (minute - (17 * 60 + 30)) * 2));

    this.texts.removeAll(true);
    const label = `DAY ${this.data_.day} · ${clockText(minute)}`;
    const w = 6 + measure(label, true) + 7;
    const x = Math.round((GAME_WIDTH - w) / 2);
    const plate = bake(this, `wd:plate:${w}`, w, 20, (g: PixelCtx) => hudPlate(g, 0, 0, w, 19));
    this.texts.add(this.add.image(x, 16, plate).setOrigin(0));
    this.texts.add(pxTextShadow(this, x + 6, 22, label, { bold: true }));
    const sub = this.step >= this.steps ? 'Closing time.' : 'A workday. Not shown — lived.';
    this.texts.add(pxTextShadow(this, GAME_WIDTH / 2, GAME_HEIGHT - 30, sub, { align: 'center', tint: 'hud.text' }));
    this.texts.add(pxText(this, GAME_WIDTH / 2, GAME_HEIGHT - 18, 'E · TAP · A SKIP', { align: 'center', tint: 'hud.border' }));
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.events.emit('workday:done');
  }
}

export default WorkdayScene;
