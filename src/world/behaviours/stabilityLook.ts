import type Phaser from 'phaser';
import { gradeLook, type GradeLook } from '../../systems/stability';
import { stabilityNow } from '../../systems/stabilityNow';
import { useGameStore } from '../../store';
import { clearGlows, setGlows } from '../../systems/glows';
import { color, type TokenName } from '../../ui/tokens';
import { SCENE_KEYS, TILE_SIZE } from '../../utils/constants';
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

    // The place's own lights (ADR-161): GradeScene draws them above the drain, so the tunnel's red stays red.
    const lights = (district.glows ?? []).map((g) => ({ x: g.at[0] * TILE_SIZE, y: g.at[1] * TILE_SIZE, r: Math.max(1, Math.round(g.radius * TILE_SIZE * 0.35)), color: color(g.color as TokenName), pulseMs: g.pulseMs, flag: g.requiresFlag }));
    let t = 0;
    const glowTick = (_time: number, delta: number) => {
      t += delta;
      const flags = useGameStore.getState().flags;
      setGlows('district', lights.filter((l) => !l.flag || flags[l.flag]).map((l) => ({ x: l.x, y: l.y, r: l.r, color: l.color, halo: 3, alpha: l.pulseMs && !reducedMotion ? 0.6 + 0.4 * Math.sin((t / l.pulseMs) * Math.PI * 2) : 0.85 })));
    };

    update(0, READ_EVERY_MS);
    scene.events.on('update', update);
    if (lights.length) { glowTick(0, 0); scene.events.on('update', glowTick); }
    return () => {
      scene.events.off('update', update);
      scene.events.off('update', glowTick);
      clearGlows('district');
      if (matrix) drop(matrix);
      scene.scene.stop(SCENE_KEYS.GRADE);
    };
  },
};
