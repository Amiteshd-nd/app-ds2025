import Phaser from 'phaser';
import { platform } from '../platform';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import { hudPlate } from '../ui/kit/molecules';
import { bake, pxText, pxTextShadow } from '../ui/kit/phaser';
import type { PixelCtx } from '../ui/kit/pixel';
import { FONT, wrap } from '../ui/kit/text';
import { color, motion } from '../ui/tokens';
import { CUT_BLACK_MS, DEFAULT_PANEL_MS, panelsFor, type CardPanel, type CardSequence } from '../systems/cards';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';

export interface CardSceneData {
  seq: CardSequence;
  /** The flags when the sequence starts — they pick the panels (Sameer's bike when there is no scooter). */
  flags: Record<string, boolean | undefined>;
}

const PLATE_W = GAME_WIDTH - 48;
const PAD_X = 10;
const LINE = FONT.lineHeight + 2;
/** Input is ignored this long after a panel appears, so one press never skips two panels. */
const SETTLE_MS = 250;

/**
 * CardScene — a card sequence (story 3.1, ADR-136): text panels over black or
 * over an illustrated still, each holding for its time or until E / Enter /
 * Space / A / tap. A `cut` panel ends in one white frame and black (reduced
 * motion: just black). Launched over the world by WorldScene.playCard, which
 * applies the outcome (systems/cards) on `card:done`. With `end: "hold"` the
 * last panel stays and `card:done` fires as it appears.
 */
export class CardScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.CARD;

  private seq!: CardSequence;
  private panels: CardPanel[] = [];
  private index = -1;
  private shownAt = 0;
  private done = false;
  private holding = false;
  private reduced = false;
  private timer: Phaser.Time.TimerEvent | null = null;
  private still!: Phaser.GameObjects.Image;
  private layer!: Phaser.GameObjects.Container;
  private flash!: Phaser.GameObjects.Rectangle;
  private offPad: (() => void) | null = null;

  constructor() {
    super(CardScene.KEY);
  }

  create(data: CardSceneData): void {
    this.seq = data.seq;
    this.panels = panelsFor(data.seq, data.flags);
    this.index = -1;
    this.done = false;
    this.holding = false;
    this.timer = null;
    this.reduced = platform.display.prefersReducedMotion();
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#000000');

    this.still = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false);
    this.layer = this.add.container(0, 0);
    this.flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, color('hud.text')).setOrigin(0).setVisible(false);

    const next = () => this.advance();
    this.input.keyboard?.on('keydown-E', next);
    this.input.keyboard?.on('keydown-ENTER', next);
    this.input.keyboard?.on('keydown-SPACE', next);
    this.input.on('pointerdown', next);
    this.offPad = attachGamepad(this, { button: (b) => { if (b === PAD.A || b === PAD.START) next(); } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.offPad?.(); this.offPad = null; this.timer?.remove(); this.timer = null; });

    if (!this.panels.length) { this.finish(); return; }
    this.show(0);
  }

  /** Which panel is up and whether the sequence is holding on it — for tests and the Playground. */
  inspect(): { id: string; index: number; count: number; holding: boolean; done: boolean } {
    return { id: this.seq.id, index: this.index, count: this.panels.length, holding: this.holding, done: this.done };
  }

  /** E / tap: end this panel now (a `cut` still cuts). Ignored while the last panel holds. */
  private advance(): void {
    if (this.done || this.holding || this.index < 0) return;
    if (this.time.now - this.shownAt < SETTLE_MS) return;
    this.endPanel();
  }

  private show(i: number): void {
    this.index = i;
    this.shownAt = this.time.now;
    const panel = this.panels[i];
    const last = i === this.panels.length - 1;
    this.holding = last && this.seq.end === 'hold' && !this.seq.then;

    if (panel.still && this.textures.exists(panel.still)) this.still.setTexture(panel.still).setVisible(true);
    else this.still.setVisible(false);
    this.flash.setVisible(false);
    this.layer.removeAll(true);
    this.layer.setAlpha(this.reduced ? 1 : 0);
    this.layout(panel, !this.holding);
    if (!this.reduced) this.tweens.add({ targets: this.layer, alpha: 1, duration: motion('m.card.fade') });

    this.timer?.remove();
    this.timer = null;
    if (this.holding) { this.finish(); return; }
    this.timer = this.time.delayedCall(panel.ms ?? DEFAULT_PANEL_MS, () => this.endPanel());
  }

  private layout(panel: CardPanel, hint: boolean): void {
    const style = panel.style ?? 'text';
    if (style === 'title') {
      if (panel.title) this.layer.add(pxTextShadow(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, panel.title, { bold: true, k: 2, align: 'center' }));
      this.layer.add(pxText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, panel.text, { bold: true, align: 'center', tint: 'hud.border' }));
    } else if (style === 'fragment') {
      const lines = wrap(panel.text, PLATE_W - 80);
      const top = Math.round(GAME_HEIGHT / 2 - (lines.length * LINE) / 2);
      lines.forEach((l, n) => this.layer.add(pxText(this, GAME_WIDTH / 2, top + n * LINE, l, { align: 'center', tint: 'hud.border' })));
    } else {
      // A plate along the bottom: the small title line, then the body.
      const lines = wrap(panel.text, PLATE_W - PAD_X * 2);
      const h = 10 + (panel.title ? LINE + 2 : 0) + lines.length * LINE + 6;
      const x = Math.round((GAME_WIDTH - PLATE_W) / 2);
      // Over a still the plate sits low, out of the picture's way; on black it sits in the middle.
      const y = panel.still ? GAME_HEIGHT - h - 22 : Math.round((GAME_HEIGHT - h) / 2);
      const plate = bake(this, `card:plate:${PLATE_W}x${h}`, PLATE_W, h + 1, (g: PixelCtx) => hudPlate(g, 0, 0, PLATE_W, h));
      this.layer.add(this.add.image(x, y, plate).setOrigin(0));
      let ty = y + 8;
      if (panel.title) { this.layer.add(pxText(this, x + PAD_X, ty, panel.title, { bold: true, tint: 'hud.border' })); ty += LINE + 2; }
      for (const l of lines) { this.layer.add(pxText(this, x + PAD_X, ty, l)); ty += LINE; }
    }
    if (hint) this.layer.add(pxText(this, GAME_WIDTH - 12, GAME_HEIGHT - 14, 'E · TAP · A', { align: 'right', tint: 'hud.border' }));
  }

  private endPanel(): void {
    if (this.done || this.holding) return;
    this.timer?.remove();
    this.timer = null;
    const panel = this.panels[this.index];
    const go = () => (this.index + 1 < this.panels.length ? this.show(this.index + 1) : this.finish());
    if (panel.style !== 'cut') { go(); return; }
    // The cut: one white frame (never under reduced motion), then black, then on.
    this.layer.removeAll(true);
    this.still.setVisible(false);
    if (!this.reduced) {
      this.flash.setVisible(true);
      this.time.delayedCall(motion('m.card.flash'), () => this.flash.setVisible(false));
    }
    this.index = -1; // input is dead in the black
    const resume = this.panels.indexOf(panel) + 1;
    this.time.delayedCall(CUT_BLACK_MS, () => (resume < this.panels.length ? this.show(resume) : this.finish()));
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.events.emit('card:done');
  }
}

export default CardScene;
