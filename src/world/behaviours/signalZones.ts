import { useGameStore } from '../../store';
import { findObject } from '../Zones';
import type { Behaviour } from './index';

/**
 * signalZones — phone signal by where you stand (story 1.4, ADR-122): the
 * district lists `signalZones: [{ zone, bars }]`; while the player's feet are
 * inside one, the phone's status bar and Reels read that many bars instead of
 * the district's. Cleared on leaving the zone and on scene shutdown.
 */
export const signalZones: Behaviour = {
  attach({ scene, district, map, player }) {
    const zones = (district.signalZones ?? []).map((z) => {
      const obj = findObject(map, 'Spawns', z.zone);
      return obj ? { bars: z.bars, flag: z.flag ?? null, x: obj.x ?? 0, y: obj.y ?? 0, w: obj.width ?? 0, h: obj.height ?? 0 } : null;
    }).filter((z): z is { bars: number; flag: string | null; x: number; y: number; w: number; h: number } => z !== null);
    if (!zones.length) return;
    const store = useGameStore.getState;
    const update = () => {
      const body = player.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const cx = body.x + body.width / 2, cy = body.y + body.height / 2;
      const hit = zones.find((z) => cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h);
      const want = hit ? hit.bars : null;
      if (store().signalOverride !== want || store().signalZoneFlag !== (hit?.flag ?? null)) store().setSignalOverride(want, hit?.flag ?? null);
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      if (store().signalOverride !== null) store().setSignalOverride(null);
    };
  },
};
