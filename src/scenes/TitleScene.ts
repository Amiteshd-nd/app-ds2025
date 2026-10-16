import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import { SaveManager } from '../systems/SaveManager';
import { useGameStore } from '../store';
import { platform } from '../platform';
import { color, hex } from '../ui/tokens';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import type { MenuScene } from './MenuScene';
import type { WorldSceneData } from './WorldScene';

/** Draw order, back to front. */
const Z = {
  bg: 0, clouds: 1, birds: 2, metro: 3, traffic: 4, glow: 5, fg: 6, petals: 7, player: 8, logo: 10, menu: 11,
} as const;

/** Where things sit in the 640×360 background (from the generated art, ADR-101). */
const ROAD_FAR_Y = 284; // bottom of a vehicle in the far lane (moving left)
const ROAD_NEAR_Y = 298; // bottom of a vehicle in the near lane (moving right)
const METRO_Y = 189; // the viaduct deck
const METRO_MASK_X = 104; // the gulmohar canopy covers the viaduct left of this
const FG_TOP = 255; // where the foreground cut-out starts
const LAMPS: Array<[number, number]> = [[99, 223], [220, 223], [359, 225], [476, 225], [625, 225], [571, 246]];
const TRAFFIC = ['title_auto', 'title_bus', 'title_car', 'title_scooter', 'title_auto', 'title_car'];
const MENU_X = 252;
const MENU_Y = 292;
const MENU_GAP = 15;

/**
 * TitleScene — Bengaluru at golden hour, seen from a park on a rise (ADR-101).
 *
 * The first screen should feel like arriving: warm light, the city humming
 * below — autos and buses on the road, the purple metro gliding along the
 * viaduct, clouds drifting, gulmohar petals falling — and a newcomer walking
 * up the steps to look at it all. Then New Game / Continue / Settings, with a
 * steaming tumbler of filter coffee as the cursor.
 *
 * With the OS "reduce motion" setting every element is still shown, placed
 * and still (CLAUDE.md rule 12): nothing drives, drifts or falls.
 * Navigable by keyboard (arrows/WASD + Enter), mouse or touch.
 */
export class TitleScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.TITLE;

  private selectedIndex = 0;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private menuOptions = ['New Game', 'Continue', 'Load Game', 'Settings'];
  private statusText!: Phaser.GameObjects.Text;
  private cursor!: Phaser.GameObjects.Image;
  private still = false;
  private leaving = false;

  constructor() {
    super(TitleScene.KEY);
  }

  create(): void {
    this.selectedIndex = 0;
    this.menuItems = [];
    this.leaving = false;
    this.still = platform.display.prefersReducedMotion();

    useGameStore.getState().setActiveScene(TitleScene.KEY);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor(hex('ui.bg'));
    this.cameras.main.fadeIn(this.still ? 200 : 900, 0, 0, 0);

    this.add.image(0, 0, 'title_bg').setOrigin(0, 0).setDepth(Z.bg);
    this.add.image(0, FG_TOP, 'title_fg').setOrigin(0, 0).setDepth(Z.fg);

    this.createClouds();
    this.createMetro();
    this.createTraffic();
    this.createLampGlow();
    this.createBirds();
    this.createPetals();
    this.createWalker();
    this.createLogo();
    this.createMenu();
    this.setupInput();
    // The pause/settings menu and the rotate panel stay above the title.
    this.scene.bringToTop(SCENE_KEYS.MENU);
    this.scene.bringToTop(SCENE_KEYS.ORIENTATION);
  }

  /** While the Load / Settings menu is up, the title's own menu sleeps. */
  private get menuUp(): boolean {
    return useGameStore.getState().overlay !== null;
  }

  private menu(): MenuScene | null {
    return this.scene.isActive(SCENE_KEYS.MENU) ? (this.scene.get(SCENE_KEYS.MENU) as MenuScene) : null;
  }

  /** The menu loaded a slot: fade into the world at its saved spot. */
  startWorldAt(position: { districtId: string; x: number; y: number }): void {
    if (this.leaving) return;
    this.fadeToScene(SCENE_KEYS.WORLD, position satisfies WorldSceneData);
  }

  // ── The living city ───────────────────────────────────────────────────────

  /** Three warm clouds drifting left across the sky, wrapping round. */
  private createClouds(): void {
    const clouds: Array<[string, number, number, number]> = [
      ['title_cloud_l', 470, 42, 26000],
      ['title_cloud_m', 150, 70, 34000],
      ['title_cloud_s', 360, 92, 41000],
    ];
    for (const [key, x, y, crossMs] of clouds) {
      const cloud = this.add.image(x, y, key).setDepth(Z.clouds).setAlpha(0.9);
      if (this.still) continue;
      const span = GAME_WIDTH + cloud.width;
      const loop = () => {
        cloud.x = GAME_WIDTH + cloud.width / 2;
        this.tweens.add({ targets: cloud, x: -cloud.width / 2, duration: crossMs, onComplete: loop });
      };
      // First pass starts where the cloud is, at the same speed.
      this.tweens.add({
        targets: cloud, x: -cloud.width / 2,
        duration: crossMs * ((cloud.x + cloud.width / 2) / span), onComplete: loop,
      });
    }
  }

  /** The purple metro, every ~12 s, along the viaduct — behind the gulmohar. */
  private createMetro(): void {
    const train = this.add.image(0, METRO_Y, 'title_metro').setOrigin(0, 1).setDepth(Z.metro);
    const mask = this.make.graphics({}, false).fillRect(METRO_MASK_X, 0, GAME_WIDTH - METRO_MASK_X, GAME_HEIGHT);
    train.setMask(mask.createGeometryMask());
    if (this.still) {
      train.x = 330;
      return;
    }
    const run = (leftward: boolean) => {
      train.setFlipX(leftward);
      train.x = leftward ? GAME_WIDTH + 10 : -train.width - 10;
      this.tweens.add({
        targets: train,
        x: leftward ? -train.width - 10 : GAME_WIDTH + 10,
        duration: 9000,
        ease: 'Sine.easeInOut',
        onComplete: () => this.time.delayedCall(Phaser.Math.Between(3000, 6000), () => run(!leftward)),
      });
    };
    this.time.delayedCall(1500, () => run(true));
  }

  /** Autos, buses, cars and scooters in two lanes; each bobs a pixel on the road. */
  private createTraffic(): void {
    if (this.still) {
      // Parked at the bus stop and on the road — present, not moving.
      this.add.image(410, ROAD_FAR_Y, 'title_bus').setOrigin(0.5, 1).setDepth(Z.traffic).setFlipX(true);
      this.add.image(250, ROAD_NEAR_Y, 'title_auto').setOrigin(0.5, 1).setDepth(Z.traffic);
      return;
    }
    const spawn = (near: boolean, key: string, startX?: number) => {
      const vehicle = this.add.image(0, near ? ROAD_NEAR_Y : ROAD_FAR_Y, key).setOrigin(0.5, 1).setDepth(Z.traffic + (near ? 0.5 : 0));
      vehicle.setFlipX(!near); // the art faces right; the far lane drives left
      const from = near ? -vehicle.width : GAME_WIDTH + vehicle.width;
      const to = near ? GAME_WIDTH + vehicle.width : -vehicle.width;
      vehicle.x = startX ?? from;
      const speed = key === 'title_bus' ? 38 : key === 'title_scooter' ? 70 : Phaser.Math.Between(50, 62);
      this.tweens.add({
        targets: vehicle, x: to, duration: (Math.abs(to - vehicle.x) / speed) * 1000,
        onComplete: () => vehicle.destroy(),
      });
      this.tweens.add({ targets: vehicle, y: vehicle.y - 1, duration: 180, yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 180) });
    };
    const lane = (near: boolean) => {
      spawn(near, Phaser.Utils.Array.GetRandom(TRAFFIC));
      this.time.delayedCall(Phaser.Math.Between(2600, 5200), () => lane(near));
    };
    // The road is already busy when the screen opens.
    spawn(false, 'title_bus', 430);
    spawn(true, 'title_auto', 190);
    this.time.delayedCall(1200, () => lane(true));
    this.time.delayedCall(2400, () => lane(false));
  }

  /** Streetlamps and the chai stall's bulb, breathing a warm glow. */
  private createLampGlow(): void {
    const key = 'title_glow';
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({}, false);
      for (let r = 10; r > 0; r -= 2) g.fillStyle(color('accent.auto'), 0.07).fillCircle(10, 10, r);
      g.generateTexture(key, 20, 20);
      g.destroy();
    }
    for (const [x, y] of LAMPS) {
      const glow = this.add.image(x, y, key).setDepth(Z.glow).setBlendMode(Phaser.BlendModes.ADD);
      if (!this.still) {
        this.tweens.add({ targets: glow, alpha: 0.55, duration: Phaser.Math.Between(1400, 2200), yoyo: true, repeat: -1 });
      }
    }
  }

  /** Now and then a small flock crosses the sky toward the sunset. */
  private createBirds(): void {
    if (this.still) return;
    const fly = () => {
      const birds = this.add.image(GAME_WIDTH + 20, Phaser.Math.Between(40, 95), 'title_birds').setDepth(Z.birds);
      this.tweens.add({ targets: birds, x: -40, y: birds.y - 18, duration: 14000, onComplete: () => birds.destroy() });
      this.tweens.add({ targets: birds, scaleY: 0.8, duration: 260, yoyo: true, repeat: -1 });
      this.time.delayedCall(Phaser.Math.Between(9000, 16000), fly);
    };
    this.time.delayedCall(3000, fly);
  }

  /** Gulmohar petals drifting down from the tree on the left. */
  private createPetals(): void {
    if (this.still) return;
    this.add.particles(0, 0, 'title_petal', {
      x: { min: 0, max: 150 },
      y: { min: 30, max: 150 },
      lifespan: 7000,
      speedX: { min: 6, max: 18 },
      speedY: { min: 10, max: 22 },
      rotate: { start: 0, end: 360 },
      alpha: { start: 1, end: 0 },
      frequency: 700,
      quantity: 1,
    }).setDepth(Z.petals);
  }

  /**
   * The newcomer: up the steps, onto the lawn, then turns to look at the city
   * (back to us). Your own character when there is a save, else a default.
   */
  private createWalker(): void {
    const save = SaveManager.getInstance().load();
    const saved = save?.player.appearance.sheet;
    const sheet = saved && this.textures.exists(saved) ? saved : 'player_m_3';
    if (!this.textures.exists(sheet)) return;

    const standX = 470, feetY = 318;
    const walker = this.add.sprite(standX, feetY, sheet).setOrigin(0.5, 1).setDepth(Z.player);
    if (this.still) {
      walker.play(`${sheet}-idle-up`);
      return;
    }
    walker.setPosition(560, 342);
    walker.play(`${sheet}-walk-up`);
    this.tweens.chain({
      targets: walker,
      tweens: [
        { y: feetY, duration: 1500, delay: 1200 },
        { x: standX, duration: 2200, onStart: () => walker.play(`${sheet}-walk-left`) },
        { duration: 10, onComplete: () => walker.play(`${sheet}-idle-up`) },
      ],
    });
  }

  // ── Logo and menu ─────────────────────────────────────────────────────────

  private createLogo(): void {
    const logo = this.add.image(GAME_WIDTH / 2, 72, 'title_logo').setDepth(Z.logo);
    if (this.still) return;
    logo.y = -70;
    this.tweens.add({
      targets: logo, y: 72, duration: 1100, ease: 'Back.easeOut', delay: 300,
      onComplete: () => this.tweens.add({ targets: logo, y: 70, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
    });
  }

  private textStyle(size: number): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      font: `bold ${size}px monospace`,
      color: hex('ui.paper'),
      stroke: hex('ui.text.ink'),
      strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 1, color: hex('ui.text.ink'), fill: true, stroke: true },
    };
  }

  private createMenu(): void {
    this.menuOptions.forEach((option, index) => {
      const text = this.add.text(MENU_X, MENU_Y + index * MENU_GAP, option, this.textStyle(11))
        .setOrigin(0, 0.5).setDepth(Z.menu);
      text.setInteractive({ useHandCursor: true });
      text.on('pointerover', () => { if (this.menuUp) return; this.selectedIndex = index; this.updateMenuDisplay(); });
      text.on('pointerdown', () => { if (this.menuUp) return; this.selectedIndex = index; this.confirmSelection(); });
      this.menuItems.push(text);
    });

    // The cursor: a steel tumbler of filter coffee, steam curling off it.
    this.cursor = this.add.image(MENU_X - 12, MENU_Y, 'title_tumbler').setDepth(Z.menu);
    if (!this.still) {
      this.tweens.add({ targets: this.cursor, scaleY: 0.92, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const menu = [...this.menuItems, this.cursor];
      menu.forEach((m) => m.setAlpha(0));
      this.tweens.add({ targets: menu, alpha: 1, duration: 600, delay: 1300 });
    }

    this.add.text(8, GAME_HEIGHT - 10, '© 2026 Bangalore Times', this.textStyle(7)).setOrigin(0, 0.5).setDepth(Z.menu);
    this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 10, 'Made in Bengaluru', this.textStyle(7)).setOrigin(1, 0.5).setDepth(Z.menu);
    this.statusText = this.add.text(MENU_X, MENU_Y + this.menuOptions.length * MENU_GAP + 2, '', this.textStyle(8))
      .setOrigin(0, 0.5).setDepth(Z.menu).setColor(hex('ui.focus'));

    this.updateMenuDisplay();
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    // Scene-scoped listeners: Phaser tears these down on shutdown.
    keyboard.on('keydown-UP', () => this.moveSelection(-1));
    keyboard.on('keydown-W', () => this.moveSelection(-1));
    keyboard.on('keydown-DOWN', () => this.moveSelection(1));
    keyboard.on('keydown-S', () => this.moveSelection(1));
    keyboard.on('keydown-ENTER', () => this.confirmSelection());
    keyboard.on('keydown-SPACE', () => this.confirmSelection());
    const offPad = attachGamepad(this, {
      button: (b) => { if (b === PAD.A || b === PAD.START) this.confirmSelection(); },
      dir: (d) => { if (d === 'up' || d === 'down') this.moveSelection(d === 'up' ? -1 : 1); },
    }, () => !this.menuUp && !this.leaving);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offPad);
  }

  private moveSelection(direction: number): void {
    if (this.menuUp) return;
    this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex + direction, 0, this.menuOptions.length);
    this.updateMenuDisplay();
  }

  private updateMenuDisplay(): void {
    this.menuItems.forEach((item, index) => {
      const selected = index === this.selectedIndex;
      item.setColor(selected ? hex('ui.focus') : hex('ui.paper'));
      item.setX(selected ? MENU_X + 3 : MENU_X);
    });
    const target = this.menuItems[this.selectedIndex];
    if (target && this.cursor) this.cursor.setY(target.y);
  }

  private confirmSelection(): void {
    if (this.leaving || this.menuUp) return;
    // The first confirm on the title screen is the user gesture that unlocks
    // audio on iOS/Android (mobile foundation rule 8); nothing plays before it.
    void platform.audio.unlock();

    switch (this.menuOptions[this.selectedIndex]) {
      case 'New Game':
        this.startNewGame();
        break;
      case 'Continue':
        this.continueGame();
        break;
      case 'Load Game':
        this.menu()?.open({ mode: 'title', screen: 'load' });
        break;
      case 'Settings':
        this.menu()?.open({ mode: 'title', screen: 'settings' });
        break;
    }
  }

  /** Resume a saved run, or say so plainly when there is nothing to resume. */
  private continueGame(): void {
    const save = SaveManager.getInstance().load();
    if (!save) {
      this.statusText.setText('No saved game yet.');
      return;
    }
    // The save is the only thing that hydrates the store: WorldScene never
    // restores on its own, so a fresh run cannot inherit an old one.
    SaveManager.getInstance().restore();
    const { districtId, x, y } = save.player.position;
    this.fadeToScene(SCENE_KEYS.WORLD, { districtId, x, y } satisfies WorldSceneData);
  }

  private startNewGame(): void {
    useGameStore.getState().reset();
    SaveManager.getInstance().startNewRun();
    this.fadeToScene(SCENE_KEYS.CHARACTER_SELECT);
  }

  private fadeToScene(key: string, data?: object): void {
    this.leaving = true;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key, data));
  }
}

export default TitleScene;
