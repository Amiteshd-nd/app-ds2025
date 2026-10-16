import Phaser from 'phaser';
import { pxText } from '../../ui/kit/phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../utils/constants';

export const MOVIE_OVERLAY_KEY = 'MovieOverlayScene';

/**
 * Movie Mode's director's cam (Test Playground, dev only): letterbox bars
 * with a title card at each scene start (1.5 s, then they slide away so the
 * HUD stays visible), and a corner pill naming the beat and step so a
 * misbehaving step can be pointed at. Added to the game at runtime by the
 * runner; never part of the production scene list.
 */
export class MovieOverlayScene extends Phaser.Scene {
  private bars: Phaser.GameObjects.Rectangle[] = [];
  private card: Phaser.GameObjects.GameObject[] = [];
  private pillObjects: Phaser.GameObjects.GameObject[] = [];
  private cardTimer: Phaser.Time.TimerEvent | null = null;

  constructor() { super({ key: MOVIE_OVERLAY_KEY }); }

  create(): void {
    const h = 16;
    this.bars = [
      this.add.rectangle(0, 0, GAME_WIDTH, h, 0x000000, 0.92).setOrigin(0, 0).setVisible(false),
      this.add.rectangle(0, GAME_HEIGHT - h, GAME_WIDTH, h, 0x000000, 0.92).setOrigin(0, 0).setVisible(false),
    ];
    this.scene.bringToTop();
  }

  /** "ACT 0 · ARRIVALS · KEMPEGOWDA INTERNATIONAL" over the bars for 1.5 s. */
  title(text: string): void {
    this.clearCard();
    for (const b of this.bars) b.setVisible(true).setAlpha(1);
    const plate = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, Math.min(GAME_WIDTH - 32, text.length * 7 + 40), 30, 0x000000, 0.85).setOrigin(0.5);
    const label = pxText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 6, text, { bold: true, align: 'center', tint: 'hud.text' });
    this.card = [plate, label];
    this.cardTimer = this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: [...this.card, ...this.bars], alpha: 0, duration: 300, onComplete: () => { this.clearCard(); for (const b of this.bars) b.setVisible(false).setAlpha(1); } });
    });
  }

  /** "act0_arrivals · F2 · 3/14 goto npc_chai_anna" bottom-left; null hides it. */
  pill(text: string | null): void {
    for (const o of this.pillObjects) o.destroy();
    this.pillObjects = [];
    if (!text) return;
    const w = Math.min(GAME_WIDTH - 8, text.length * 6 + 12);
    const plate = this.add.rectangle(4, GAME_HEIGHT - 4, w, 14, 0x000000, 0.8).setOrigin(0, 1);
    const label = pxText(this, 9, GAME_HEIGHT - 15, text, { tint: 'hud.text' });
    this.pillObjects = [plate, label];
  }

  clear(): void {
    this.clearCard();
    for (const b of this.bars) b.setVisible(false).setAlpha(1);
    this.pill(null);
  }

  private clearCard(): void {
    this.cardTimer?.remove();
    this.cardTimer = null;
    for (const o of this.card) o.destroy();
    this.card = [];
  }
}
