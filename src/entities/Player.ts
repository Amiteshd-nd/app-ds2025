import Phaser from 'phaser';
import type { Direction } from '../utils/types';
import { DEPTH, HUNGRY_AT, HUNGRY_SPEED, PLAYER_RUN_SPEED, PLAYER_SPEED, TILE_SIZE } from '../utils/constants';
import { useGameStore } from '../store';
import { ensurePlaceholderTexture } from '../utils/placeholders';
import { consumeInteract, input } from '../input/InputMap';

/**
 * Player — the controllable character.
 *
 * Arrow keys or WASD to move, SHIFT to run, E to interact — and the same
 * four actions from the shared InputMap (on-screen joystick + A button, later
 * a gamepad), merged here so no scene ever asks what device it is on (mobile
 * foundation §5 rule 1). A freeze switch holds the player during dialogue.
 * Animation playback is guarded by anims.exists() so the entity runs on a
 * placeholder texture and starts animating the moment a sheet is loaded under
 * `<sheet>-walk-<dir>` / `<sheet>-idle-<dir>` keys.
 */
export class Player extends Phaser.GameObjects.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private shiftKey: Phaser.Input.Keyboard.Key;
  private eKey: Phaser.Input.Keyboard.Key;

  private currentDirection: Direction = 'down';

  /** Which way the player faces (the map's heading arrow uses it). */
  get facing(): Direction {
    return this.currentDirection;
  }
  private isMoving = false;
  private interactionEnabled = true;
  private interactionCallback: (() => void) | null = null;

  /** `textureKey` also selects the animation set, `<key>-walk-<dir>` etc. */
  constructor(scene: Phaser.Scene, x: number, y: number, private textureKey: string) {
    // A sheet that failed to load (or a key from a save made before it
    // existed) must not crash the scene: stand in with the silhouette.
    if (!scene.textures.exists(textureKey)) {
      console.error(`[Player] sprite sheet "${textureKey}" is not loaded; using placeholder`);
      ensurePlaceholderTexture(scene, textureKey, 32, 48, 0xff5a5f, 0xffffff);
    }
    super(scene, x, y, textureKey);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // The 32×48 sprite carries head and torso in the top ~36px, feet in the
    // bottom ~12px, so the collision box sits at the feet — that is what makes
    // a top-down character read as standing "in" the scene rather than on it.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 12);
    body.setOffset(6, 35);
    body.setCollideWorldBounds(true);

    this.setDepth(DEPTH.ENTITIES);

    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Player requires the keyboard input plugin');

    this.cursors = keyboard.createCursorKeys();
    this.wasdKeys = {
      W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.playIdleAnim();
  }

  /** Called from the scene's update loop. */
  update(): void {
    if (!this.interactionEnabled) {
      this.stopMoving();
      // Drain buffered presses so the input that closed a dialogue does not
      // immediately re-trigger an interaction on unfreeze.
      Phaser.Input.Keyboard.JustDown(this.eKey);
      consumeInteract();
      return;
    }

    const left = this.cursors.left.isDown || this.wasdKeys.A.isDown || input.axisX < 0;
    const right = this.cursors.right.isDown || this.wasdKeys.D.isDown || input.axisX > 0;
    const up = this.cursors.up.isDown || this.wasdKeys.W.isDown || input.axisY < 0;
    const down = this.cursors.down.isDown || this.wasdKeys.S.isDown || input.axisY > 0;

    // Low food = slower walk (components §7) — felt, not fatal, in Acts 0–3.
    const hungry = useGameStore.getState().stats.food < HUNGRY_AT ? HUNGRY_SPEED : 1;
    const speed = (this.shiftKey.isDown || input.run ? PLAYER_RUN_SPEED : PLAYER_SPEED) * hungry;

    let velX = 0;
    let velY = 0;

    if (left) {
      velX = -speed;
      this.currentDirection = 'left';
    }
    if (right) {
      velX = speed;
      this.currentDirection = 'right';
    }
    if (up) {
      velY = -speed;
      this.currentDirection = 'up';
    }
    if (down) {
      velY = speed;
      this.currentDirection = 'down';
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(velX, velY);

    // Keep diagonals from outrunning the cardinals.
    if (velX !== 0 && velY !== 0) {
      body.velocity.normalize().scale(speed);
    }

    this.isMoving = velX !== 0 || velY !== 0;
    if (this.isMoving) this.playWalkAnim();
    else this.playIdleAnim();

    // `||` would short-circuit and leave a touch press buffered; read both.
    const keyPressed = Phaser.Input.Keyboard.JustDown(this.eKey);
    const touchPressed = consumeInteract();
    if (keyPressed || touchPressed) this.interactionCallback?.();
  }

  private playAnimIfPresent(key: string): void {
    // No-op until real spritesheets register these animation keys.
    if (!this.scene.anims.exists(key)) return;
    if (this.anims.currentAnim?.key === key) return;
    this.play(key);
  }

  private playWalkAnim(): void {
    this.playAnimIfPresent(`${this.textureKey}-walk-${this.currentDirection}`);
  }

  private playIdleAnim(): void {
    // Breathing (beh_breathing) is a kind of idle: do not knock it back to the still frame.
    if (this.anims.currentAnim?.key === `${this.textureKey}-breath-${this.currentDirection}`) return;
    this.playAnimIfPresent(`${this.textureKey}-idle-${this.currentDirection}`);
  }

  private stopMoving(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.isMoving = false;
    this.playIdleAnim();
  }

  getDirection(): Direction {
    return this.currentDirection;
  }

  getIsMoving(): boolean {
    return this.isMoving;
  }

  /** Freeze or unfreeze movement (used during dialogue). */
  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
  }

  /** Register the E-key interaction handler. */
  onInteract(callback: () => void): void {
    this.interactionCallback = callback;
  }

  /** Tile coordinate one step ahead of the player, in tile units. */
  getFacingPosition(): { x: number; y: number } {
    const tileX = Math.floor(this.x / TILE_SIZE);
    const tileY = Math.floor(this.y / TILE_SIZE);

    switch (this.currentDirection) {
      case 'up':
        return { x: tileX, y: tileY - 1 };
      case 'down':
        return { x: tileX, y: tileY + 1 };
      case 'left':
        return { x: tileX - 1, y: tileY };
      case 'right':
        return { x: tileX + 1, y: tileY };
    }
  }
}
