import type Phaser from 'phaser';
import { gradeLook, type GradeLook } from '../../systems/stability';
import { stabilityNow } from '../../systems/stabilityNow';
import { SCENE_KEYS } from '../../utils/constants';
import type { Behaviour } from './index';

/** How often the place's stability is read again (it moves by the day, or by the Playground's dial). */
const READ_EVERY_MS = 250;
/** A glitch every this many ms on the hot levels, lasting a blink. */
const GLITCH_EVERY_MS = 4500;
const GLITCH_MS = 90;

/**
 * stabilityLook (design system §9, ADR-27/144) — every district wears its
 * grade: colour drains (one camera colour matrix), and a blink of a glitch on
 * the worst levels; the green edges and the red rim are GradeScene's, launched
 * here, so the drain never greys them. One function decides it (`gradeLook`);
 * nothing here knows any place. At stability ≥ 80 no filter is added. The HUD
 * is its own scene, so it stays clean. Reduced motion drops the glitch only.
 */
export const stabilityLook: Behaviour = {
  attach({ scene, district, reducedMotion }) {
    const cam = scene.cameras.main;
    scene.scene.launch(SCENE_KEYS.GRADE);
    let matrix: Phaser.FX.ColorMatrix | null = null;
    // Phaser 3.90's typings miss that the FX ColorMatrix is a Controller.
    const drop = (m: Phaser.FX.ColorMatrix) => cam.postFX.remove(m as unknown as Phaser.FX.Controller);
    let shown: GradeLook | null = null;
    let sinceRead = READ_EVERY_MS;
    let sinceGlitch = 0;

    const apply = (look: GradeLook) => {
      shown = look;
      if (look.desat > 0 && cam.postFX) {
        matrix ??= cam.postFX.addColorMatrix();
        matrix.grayscale(look.desat);
      } else if (matrix) {
        drop(matrix);
        matrix = null;
      }
    };

    const update = (_time: number, delta: number) => {
      sinceRead += delta;
      if (sinceRead >= READ_EVERY_MS) {
        sinceRead = 0;
        const look = gradeLook(stabilityNow(district.id));
        if (look !== shown) apply(look);
      }
      if (!shown?.glitch || reducedMotion) return;
      sinceGlitch += delta;
      if (sinceGlitch >= GLITCH_EVERY_MS) { sinceGlitch = 0; cam.shake(GLITCH_MS, 0.004); }
    };

    update(0, READ_EVERY_MS);
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      if (matrix) drop(matrix);
      scene.scene.stop(SCENE_KEYS.GRADE);
    };
  },
};
