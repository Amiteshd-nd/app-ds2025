import { useGameStore } from '../../store';
import { nightDepth } from '../../systems/night';
import { color } from '../../ui/tokens';
import { LAYER_DEPTH, LAYERS } from '../../utils/constants';
import type { Behaviour } from './index';

/** Alpha of the night overlay at full depth; a power cut (`power_cut`) goes deeper. */
const NIGHT_ALPHA = 0.7;
const POWER_CUT_ALPHA = 0.85;

/**
 * nightLook (story 2.5, ADR-133) — every district wears the night between
 * 23:00 and 05:30: a screen-fixed deep-blue multiply over the world (the HUD
 * is its own scene, so it stays readable). It follows the clock in steps, it
 * never flickers (reduced motion changes nothing here).
 */
export const nightLook: Behaviour = {
  attach({ scene }) {
    const cam = scene.cameras.main;
    const shade = scene.add.rectangle(0, 0, cam.width, cam.height, color('world.night'), 0)
      .setOrigin(0).setScrollFactor(0).setDepth(LAYER_DEPTH[LAYERS.fx]).setBlendMode('MULTIPLY');
    const update = () => {
      const s = useGameStore.getState();
      const depth = nightDepth(s.clock.minute);
      const a = depth * (s.flags.power_cut ? POWER_CUT_ALPHA : NIGHT_ALPHA);
      if (Math.abs(shade.fillAlpha - a) > 0.01) shade.setFillStyle(color('world.night'), a);
    };
    update();
    scene.events.on('update', update);
    return () => { scene.events.off('update', update); shade.destroy(); };
  },
};
