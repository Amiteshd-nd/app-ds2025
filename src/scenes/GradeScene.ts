import Phaser from 'phaser';
import { useGameStore } from '../store';
import { allGlows } from '../systems/glows';
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
  /** Lights that escape the drain (ADR-161), redrawn every frame under the edges. */
  private glows!: Phaser.GameObjects.Graphics;
  private shown: GradeLook | null = null;
  private sinceRead = READ_EVERY_MS;

  constructor() {
    super(GradeScene.KEY);
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    this.glows = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
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
    const shown = fade && (fade.isRunning || fade.isComplete) ? 1 - fade.alpha : 1;
    this.edges.setAlpha(shown);
    this.drawGlows(shown);
  }

  /** Every registered glow in screen space: a hard core and stepped halo rings (pixel art, no smooth gradient). */
  private drawGlows(shown: number): void {
    this.glows.clear();
    const cam = this.scene.get(SCENE_KEYS.WORLD)?.cameras?.main;
    if (!cam || shown <= 0) return;
    const z = cam.zoom, v = cam.worldView;
    for (const g of allGlows()) {
      const x = Math.round((g.x - v.x) * z), y = Math.round((g.y - v.y) * z), r = Math.max(1, Math.round(g.r * z));
      if (x < -r * 4 || y < -r * 4 || x > GAME_WIDTH + r * 4 || y > GAME_HEIGHT + r * 4) continue;
      for (let i = g.halo; i >= 1; i--) {
        this.glows.fillStyle(g.color, g.alpha * shown * 0.12 * (g.halo - i + 1) / g.halo);
        this.glows.fillCircle(x, y, r + i * r);
      }
      this.glows.fillStyle(g.color, g.alpha * shown);
      if (g.halo === 0) this.glows.fillRect(x - Math.floor(r / 2), y - Math.floor(r / 2), r, r);
      else this.glows.fillCircle(x, y, r);
    }
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
