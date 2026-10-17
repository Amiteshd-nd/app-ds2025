import { exitRuns, fareAt } from '../systems/night';
import { carried } from '../systems/carry';
import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { ReputationManager } from '../systems/ReputationManager';
import { useGameStore } from '../store';
import { StatsManager } from '../systems/StatsManager';
import type { DistrictDef, DistrictExit } from '../utils/types';
import { EntryWatcher, findObject, zoneFromObject } from './Zones';

export interface BoundExits {
  update(): void;
}

/**
 * Bind a district's exits to zones in its map.
 *
 * An exit is a zone first: stepping into it is a fact quests may be waiting on
 * (the arrival quest's last objective is "reach zone_exit"), so `zone:reached`
 * goes out *before* the gate is checked. Then, if the destination is open and
 * the fare (if any) is paid through spend(), the scene is handed the exit and
 * transitions; if not, nothing happens and the watcher re-arms when the player
 * steps out — a locked door, not a dead end.
 */
export function bind(
  scene: Phaser.Scene,
  district: DistrictDef,
  map: Phaser.Tilemaps.Tilemap,
  spawnLayer: string | undefined,
  player: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  go: (exit: DistrictExit) => void,
): BoundExits {
  const watchers: EntryWatcher[] = [];

  for (const exit of district.exits ?? []) {
    const obj = findObject(map, spawnLayer, exit.zone);
    if (!obj) {
      // The validator checks this at build time; at runtime it means data and
      // build have diverged, which deserves a loud message, not a silent wall.
      console.error(`[Exits] district "${district.id}" exit zone "${exit.zone}" is not in its map`);
      continue;
    }

    const zone = zoneFromObject(scene, obj, map.tileWidth);
    watchers.push(
      new EntryWatcher(scene, player, zone, () => {
        gameEvents.emit('zone:reached', { zoneId: exit.zone, districtId: district.id });
        // Night (ADR-133): buses stop at 23:00; a day- or night-only exit waits. A sibling exit on the same zone that
        // does run (the night auto on the hill road) takes over silently; otherwise say why.
        const minute = useGameStore.getState().clock.minute;
        if (!exitRuns(exit, minute)) {
          const sibling = (district.exits ?? []).some((e) => e !== exit && e.zone === exit.zone && exitRuns(e, minute));
          if (!sibling && exit.transit === 'bus') gameEvents.emit('ui:toast', { text: 'Last bus left at 11. Next one at 5:30.' });
          return;
        }
        if (!ReputationManager.getInstance().canEnter(exit.to)) {
          // A locked door says why, once per approach (the watcher re-arms on step-out).
          if (exit.lockedText) gameEvents.emit('ui:toast', { text: exit.lockedText });
          return;
        }
        // A ride that needs a fare agreed first (the auto stand): the flag is spent on boarding.
        if (exit.requiresFlag) {
          const store = useGameStore.getState();
          if (!store.flags[exit.requiresFlag]) {
            if (exit.lockedText) gameEvents.emit('ui:toast', { text: exit.lockedText });
            return;
          }
          store.setFlag(exit.requiresFlag, false);
        }
        // The fare is the first real money sink (game_components §7).
        // Ledger label: the ride's name from its card ("Vayu Vajra KIA-8 → Whitefield · ₹250").
        const label = exit.card?.split('·')[0].trim() ?? `${exit.transit} fare`;
        // Boxes ride on a luggage ticket (story 2.4): the fare grows per box carried; autos double after midnight.
        const fare = fareAt(exit, minute) + (exit.farePerBox ? exit.farePerBox * carried() : 0);
        if (fare && !StatsManager.getInstance().spend(fare, `fare:${exit.transit}`, label)) return;
        go(exit);
      }),
    );
  }

  return { update: () => watchers.forEach((w) => w.update()) };
}
