import { useGameStore } from '../../store';
import { LAYERS } from '../../utils/constants';
import { findObject } from '../Zones';
import type { Behaviour } from './index';

/**
 * photoSpots — City Moments (story 1.6 F1, ADR-123): the district lists
 * `photoSpots: [{ zone, photo }]`; while the player's feet are inside one the
 * Camera app frames that photo. Same shape as signalZones: a per-frame feet
 * test, cleared on leaving and on teardown.
 */
export const photoSpots: Behaviour = {
  attach({ scene, district, map, player }) {
    const spots = (district.photoSpots ?? []).map((z) => {
      const obj = findObject(map, LAYERS.spawns, z.zone);
      return obj ? { photo: z.photo, x: obj.x ?? 0, y: obj.y ?? 0, w: obj.width ?? 0, h: obj.height ?? 0 } : null;
    }).filter((z): z is { photo: string; x: number; y: number; w: number; h: number } => z !== null);
    if (!spots.length) return;
    const store = useGameStore.getState;
    const update = () => {
      const body = player.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const cx = body.x + body.width / 2, cy = body.y + body.height / 2;
      const hit = spots.find((z) => cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h);
      const want = hit ? hit.photo : null;
      if (store().photoSpot !== want) store().setPhotoSpot(want);
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      if (store().photoSpot !== null) store().setPhotoSpot(null);
    };
  },
};
