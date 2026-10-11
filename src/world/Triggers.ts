import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import type { DistrictDef } from '../utils/types';
import { EntryWatcher, findObject, zoneFromObject } from './Zones';

export interface BoundTriggers {
  update(): void;
}

/**
 * Bind a district's trigger zones. A trigger only announces `zone:reached`;
 * QuestManager decides what that means. That keeps quest logic out of the
 * world code as the number of zones grows.
 */
export function bind(
  scene: Phaser.Scene,
  district: DistrictDef,
  map: Phaser.Tilemaps.Tilemap,
  spawnLayer: string | undefined,
  player: Phaser.Types.Physics.Arcade.ArcadeColliderType,
): BoundTriggers {
  const watchers: EntryWatcher[] = [];

  for (const trigger of district.triggers ?? []) {
    const obj = findObject(map, spawnLayer, trigger.zone);
    if (!obj) {
      console.error(`[Triggers] district "${district.id}" trigger zone "${trigger.zone}" is not in its map`);
      continue;
    }

    const zone = zoneFromObject(scene, obj, map.tileWidth);
    let fired = false;
    watchers.push(
      new EntryWatcher(scene, player, zone, () => {
        if (fired && trigger.once !== false) return;
        fired = true;
        gameEvents.emit('zone:reached', { zoneId: trigger.zone, districtId: district.id });
      }),
    );
  }

  return { update: () => watchers.forEach((w) => w.update()) };
}
