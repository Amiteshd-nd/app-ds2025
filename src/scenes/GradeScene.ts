import Phaser from 'phaser';
import { useGameStore } from '../store';
import { gradeLook, type GradeLook } from '../systems/stability';
import { stabilityNow } from '../systems/stabilityNow';
import { GRID, color } from '../ui/tokens';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';

/** How often the place's stability is read again. */
const READ_EVERY_MS = 250;
/** The edge bands, stepped like pixel art, never a smooth gradient: the fog reaches in six, the red rim hugs the edge in three. */
const FOG_BANDS = 6;
const RIM_BANDS = 3;

/**
 * GradeScene (design system §9, ADR-144) — the grade's screen edges: a sick
 * green creeping in, a red rim when the place is hot. It sits just above
 * WorldScene (scene order in PhaserGame) so the world camera's colour drain
 * never greys it, and below the HUD, cards and menus. It fades with the world
 * camera (a door's fade-to-black takes the edges with it). Launched and
 * stopped by the `stabilityLook` behaviour; knows no place.
 */
export class GradeScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.GRADE;

  private edges!: Phaser.GameObjects.Graphics;
  private shown: GradeLook | null = null;
  private sinceRead = READ_EVERY_MS;

  constructor() {
    super(GradeScene.KEY);
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    this.edges = this.add.graphics();
    this.shown = null;
    this.sinceRead = READ_EVERY_MS;
    this.input.enabled = false;
  }

  update(_time: number, delta: number): void {
    this.sinceRead += delta;
    if (this.sinceRead >= READ_EVERY_MS) {
      this.sinceRead = 0;
      const look = gradeLook(stabilityNow(useGameStore.getState().activeDistrict));
      if (look !== this.shown) this.draw(look);
    }
    // The world camera's fade (its black's alpha is public in Phaser, not in its typings).
    const fade = this.scene.get(SCENE_KEYS.WORLD)?.cameras?.main?.fadeEffect as (Phaser.Cameras.Scene2D.Effects.Fade & { alpha: number }) | undefined;
    this.edges.setAlpha(fade && (fade.isRunning || fade.isComplete) ? 1 - fade.alpha : 1);
  }

  private draw(look: GradeLook): void {
    this.shown = look;
    this.edges.clear();
    this.ring(color('world.fog'), look.fog, FOG_BANDS);
    this.ring(color('world.vignette'), look.vignette, RIM_BANDS);
  }

  /** A frame of `bands` stepped rings, strongest at the edge. */
  private ring(fill: number, strength: number, bands: number): void {
    if (strength <= 0) return;
    for (let i = 0; i < bands; i++) {
      const a = strength * ((bands - i) / bands) ** 2;
      const inset = i * GRID;
      const w = GAME_WIDTH - inset * 2, h = GAME_HEIGHT - inset * 2;
      this.edges.fillStyle(fill, a);
      this.edges.fillRect(inset, inset, w, GRID);
      this.edges.fillRect(inset, inset + h - GRID, w, GRID);
      this.edges.fillRect(inset, inset + GRID, GRID, h - GRID * 2);
      this.edges.fillRect(inset + w - GRID, inset + GRID, GRID, h - GRID * 2);
    }
  }
}

export default GradeScene;
