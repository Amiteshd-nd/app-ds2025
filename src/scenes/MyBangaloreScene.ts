import Phaser from 'phaser';
import { platform } from '../platform';
import { useGameStore } from '../store';
import { myBangalore, myBangaloreLines } from '../systems/myBangalore';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import { hudPlate, tapZone } from '../ui/kit/molecules';
import { bake, pxText, pxTextShadow } from '../ui/kit/phaser';
import type { PixelCtx } from '../ui/kit/pixel';
import { FONT } from '../ui/kit/text';
import { motion } from '../ui/tokens';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';

const LINE = FONT.lineHeight + 4;
const BUTTON = { w: 96, h: 24, gap: 16 } as const;

/**
 * MyBangaloreScene — the end card (landmarks doc §3.4, story 4.6, ADR-158):
 * the run in numbers on black (systems/myBangalore), then SHARE — a picture of
 * this card through the OS share sheet (platform.share, the City Moments
 * path) — or TITLE. Keys S / E, pad X / A, or tap a plate. Built from the HUD
 * kit (the card plate, the bold font); no new art.
 */
export class MyBangaloreScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.MY_BANGALORE;

  private sharing = false;
  private offPad: (() => void) | null = null;

  constructor() {
    super(MyBangaloreScene.KEY);
  }

  create(): void {
    this.sharing = false;
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.setRoundPixels(true);
    const s = useGameStore.getState();
    s.setActiveScene(MyBangaloreScene.KEY);
    const lines = myBangaloreLines(myBangalore(s));

    const root = this.add.container(0, 0);
    root.add(pxTextShadow(this, GAME_WIDTH / 2, 40, 'MY BANGALORE', { bold: true, k: 2, align: 'center' }));
    const top = 86;
    lines.forEach((l, i) => root.add(pxText(this, GAME_WIDTH / 2, top + i * LINE, l, { align: 'center', bold: i === lines.length - 1, tint: i === lines.length - 1 ? 'hud.text' : 'hud.border' })));

    const y = GAME_HEIGHT - 56;
    const share = { x: GAME_WIDTH / 2 - BUTTON.w - BUTTON.gap / 2, y, w: BUTTON.w, h: BUTTON.h };
    const title = { x: GAME_WIDTH / 2 + BUTTON.gap / 2, y, w: BUTTON.w, h: BUTTON.h };
    const plate = bake(this, `mb:plate:${BUTTON.w}x${BUTTON.h}`, BUTTON.w, BUTTON.h + 1, (g: PixelCtx) => hudPlate(g, 0, 0, BUTTON.w, BUTTON.h));
    for (const [b, label] of [[share, 'SHARE · S'], [title, 'TITLE · E']] as const) {
      root.add(this.add.image(b.x, b.y, plate).setOrigin(0));
      root.add(pxText(this, b.x + b.w / 2, b.y + 8, label, { bold: true, align: 'center' }));
    }
    if (!platform.display.prefersReducedMotion()) {
      root.setAlpha(0);
      this.tweens.add({ targets: root, alpha: 1, duration: motion('m.card.fade') * 2 });
    }

    this.input.keyboard?.on('keydown-S', () => void this.share(lines));
    this.input.keyboard?.on('keydown-E', () => this.toTitle());
    this.input.keyboard?.on('keydown-ENTER', () => this.toTitle());
    const inside = (p: Phaser.Input.Pointer, r: { x: number; y: number; w: number; h: number }) => { const z = tapZone(r.x, r.y, r.w, r.h); return p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h; };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (inside(p, share)) void this.share(lines); else if (inside(p, title)) this.toTitle(); });
    this.offPad = attachGamepad(this, { button: (b) => { if (b === PAD.X) void this.share(lines); else if (b === PAD.A || b === PAD.START) this.toTitle(); } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.offPad?.(); this.offPad = null; });
  }

  /** A picture of this card, through the share sheet (or a download where there is none). */
  private async share(lines: string[]): Promise<void> {
    if (this.sharing) return;
    this.sharing = true;
    const url = await new Promise<string>((resolve) => this.game.renderer.snapshot((img) => resolve((img as HTMLImageElement).src)));
    try { await platform.share.image(url, `My Bangalore — ${lines.join(' ')}`); } catch { /* the player closed the sheet */ }
    this.sharing = false;
  }

  private toTitle(): void {
    this.scene.start(SCENE_KEYS.TITLE);
  }
}

export default MyBangaloreScene;
