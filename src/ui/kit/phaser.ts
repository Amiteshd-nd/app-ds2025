import Phaser from 'phaser';
import { color, type TokenName } from '../tokens';
import type { PixelCtx } from './pixel';
import { FONT, measure } from './text';

/**
 * Phaser glue for the UI kit: bake PixelCtx paint calls into a CanvasTexture
 * once, and place bitmap text by its capital line. Everything here lands on
 * whole pixels.
 */

/** Paint once into a texture under `key` (cached; `repaint` forces a redraw). */
export function bake(scene: Phaser.Scene, key: string, w: number, h: number, paint: (g: PixelCtx) => void, repaint = false): string {
  const textures = scene.textures;
  if (textures.exists(key)) {
    if (!repaint) return key;
    textures.remove(key);
  }
  const tex = textures.createCanvas(key, Math.max(1, w), Math.max(1, h));
  if (!tex) throw new Error(`Could not create texture "${key}"`);
  const g = tex.getContext();
  g.imageSmoothingEnabled = false;
  paint(g);
  tex.refresh();
  return key;
}

export interface TextOptions {
  bold?: boolean;
  tint?: TokenName;
  /** Integer scale only (ADR-114). */
  k?: 1 | 2;
  align?: 'left' | 'center' | 'right';
}

/**
 * Bitmap text whose CAPITALS start at y (the line box has FONT.capTop empty
 * rows above them). x is the left edge, centre or right edge per `align`.
 */
export function pxText(scene: Phaser.Scene, x: number, y: number, text: string, opts: TextOptions = {}): Phaser.GameObjects.BitmapText {
  const k = opts.k ?? 1;
  const w = measure(text, opts.bold, k);
  const left = opts.align === 'center' ? Math.round(x - w / 2) : opts.align === 'right' ? x - w : x;
  const t = scene.add.bitmapText(left, y - FONT.capTop * k, opts.bold ? FONT.bold : FONT.regular, text, FONT.size);
  t.setOrigin(0, 0).setScale(k);
  t.setTint(color(opts.tint ?? 'hud.text'));
  return t;
}
