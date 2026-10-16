import { useGameStore } from '../../store';
import { LAYERS } from '../../utils/constants';
import { findObject } from '../Zones';
import type { Behaviour } from './index';

/**
 * fuelSpots — the fuel gauge is contextual (ADR-118): it shows while the
 * player stands on a bunk's forecourt (`fuelSpots` zones) and for a moment
 * after a ride lands. Same per-frame feet test as signalZones.
 */
export const fuelSpots: Behaviour = {
  attach({ scene, district, map, player }) {
    const zones = (district.fuelSpots ?? []).map((name) => findObject(map, LAYERS.spawns, name)).filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => ({ x: o.x ?? 0, y: o.y ?? 0, w: o.width ?? 0, h: o.height ?? 0 }));
    if (!zones.length) return;
    const store = useGameStore.getState;
    const update = () => {
      const body = player.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const cx = body.x + body.width / 2, cy = body.y + body.height / 2;
      const on = zones.some((z) => cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h);
      if (store().fuelContext !== on) store().setFuelContext(on);
    };
    scene.events.on('update', update);
    return () => { scene.events.off('update', update); if (store().fuelContext) store().setFuelContext(false); };
  },
};
