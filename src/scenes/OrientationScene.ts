import Phaser from 'phaser';
import { platform } from '../platform';
import { bake, pxText } from '../ui/kit/phaser';
import { bitmap, rect, ring } from '../ui/kit/pixel';
import { hex } from '../ui/tokens';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';

/** A phone lying sideways, with an arrow turning it (our own 2px-stroke drawing). */
const TURN = [
  '......................####......',
  '.....................##..##.....',
  '....................##....##....',
  '....................##....##....',
  '.....................##..##.....',
  '......................####......',
  '..........#.....................',
  '.........###....................',
  '........#####...................',
  '..........#.....................',
  '..........#.....................',
  '..........#.....................',
];

/**
 * OrientationScene — "rotate your phone" (mobile foundation rule 4, T-024).
 *
 * The game is landscape-locked; on a touch device held upright this panel
 * covers the letterboxed canvas with the bitmap font instead of a broken
 * layout. Launched once by BootScene, kept on top by WorldScene; it never
 * appears on a keyboard device.
 */
export class OrientationScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.ORIENTATION;

  private root!: Phaser.GameObjects.Container;

  constructor() {
    super(OrientationScene.KEY);
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    const bg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, Phaser.Display.Color.HexStringToColor(hex('hud.plate')).color).setOrigin(0);
    const w = 44, h = 26;
    const phone = bake(this, 'orient:phone', w + 32, h + 6, (g) => {
      ring(g, 0, 6, w, h, 5, 2, hex('hud.text'));
      rect(g, 4, 10, w - 10, h - 8, hex('phone.lcd.bg'));
      rect(g, w - 4, 15, 2, 8, hex('hud.text'));
      bitmap(g, TURN, w - 8, 0, hex('hud.star'));
    });
    const img = this.add.image(GAME_WIDTH / 2 - 8, GAME_HEIGHT / 2 - 40, phone).setScale(2);
    const title = pxText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 'ROTATE YOUR PHONE', { bold: true, k: 2, align: 'center' });
    const sub = pxText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'Bangalore Times plays sideways.', { tint: 'hud.border', align: 'center' });
    this.root = this.add.container(0, 0, [bg, img, title, sub]).setVisible(false);

    const check = () => this.check();
    this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, check);
    this.scale.on(Phaser.Scale.Events.RESIZE, check);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, check);
      this.scale.off(Phaser.Scale.Events.RESIZE, check);
    });
    check();
  }

  private check(): void {
    const parent = this.scale.parentSize;
    const upright = parent.height > parent.width;
    this.root.setVisible(platform.input.coarsePointer() && upright);
  }
}

export default OrientationScene;
