import { exitRuns, fareAt } from '../systems/night';
import { ACT4_FLAG } from '../systems/stability';
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
  /** True while the player stands in this exit's zone. */
  standingIn(zone: string): boolean;
  /** Board an `interact` exit (E): the same gates as walking in — the bus, the hour, the fare. */
  take(zone: string): void;
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
  const zones = new Map<string, Phaser.GameObjects.Zone>();

  for (const exit of district.exits ?? []) {
    const obj = findObject(map, spawnLayer, exit.zone);
    if (!obj) {
      // The validator checks this at build time; at runtime it means data and
      // build have diverged, which deserves a loud message, not a silent wall.
      console.error(`[Exits] district "${district.id}" exit zone "${exit.zone}" is not in its map`);
      continue;
    }

    const zone = zoneFromObject(scene, obj, map.tileWidth);
    zones.set(exit.zone, zone);
    // An `interact` exit (the 500-D at the kerb) is a place to stand, not a door: walking in only announces the zone;
    // E boards, through take() below.
    if (exit.board === 'interact') {
      watchers.push(new EntryWatcher(scene, player, zone, () => {
        gameEvents.emit('zone:reached', { zoneId: exit.zone, districtId: district.id });
        // No bus will come (night, Act 4): say so at the stop, not only on E.
        const why = closed(exit);
        if (why) gameEvents.emit('ui:toast', { text: why });
      }));
      continue;
    }
    watchers.push(
      new EntryWatcher(scene, player, zone, () => {
        gameEvents.emit('zone:reached', { zoneId: exit.zone, districtId: district.id });
        attempt(exit);
      }),
    );
  }

  /** The gates every exit passes, walked into or boarded. */
  /**
   * Why this exit doesn't run right now ('' = silently: a sibling on the same zone takes over), or null when it runs.
   * Act 4 (ADR-150): nothing runs — no bus, no auto, no metro, no scooter; you walk, and long walks are cards.
   * Night (ADR-133): buses stop at 23:00; a day- or night-only exit waits, and a sibling exit on the same zone that
   * does run (the night auto on the hill road) takes over silently.
   */
  function closed(exit: DistrictExit): string | null {
    const minute = useGameStore.getState().clock.minute;
    if (useGameStore.getState().flags[ACT4_FLAG] && exit.transit !== 'walk') return 'Nothing runs. The city is shut.';
    if (exitRuns(exit, minute)) return null;
    const sibling = (district.exits ?? []).some((e) => e !== exit && e.zone === exit.zone && exitRuns(e, minute));
    return !sibling && exit.transit === 'bus' ? 'Last bus left at 11. Next one at 5:30.' : '';
  }

  function attempt(exit: DistrictExit): void {
    const why = closed(exit);
    if (why !== null) {
      if (why) gameEvents.emit('ui:toast', { text: why });
      return;
    }
    const minute = useGameStore.getState().clock.minute;
    if (!ReputationManager.getInstance().canEnter(exit.to)) {
      // A locked door says why, once per approach (the watcher re-arms on step-out). E never does nothing (ADR-162).
      const text = exit.lockedText ?? (exit.board === 'interact' ? "You can't go there yet." : undefined);
      if (text) gameEvents.emit('ui:toast', { text });
      return;
    }
    // A ride that needs a fare agreed first (the auto stand): the flag is spent on boarding.
    if (exit.requiresFlag && !useGameStore.getState().flags[exit.requiresFlag]) {
      if (exit.lockedText) gameEvents.emit('ui:toast', { text: exit.lockedText });
      return;
    }
    // The fare is the first real money sink (game_components §7).
    // Ledger label: the ride's name from its card ("Vayu Vajra KIA-8 → Whitefield · ₹250").
    const label = exit.card?.split('·')[0].trim() ?? `${exit.transit} fare`;
    // Boxes ride on a luggage ticket (story 2.4): the fare grows per box carried; autos double after midnight.
    const fare = fareAt(exit, minute) + (exit.farePerBox ? exit.farePerBox * carried() : 0);
    if (fare && !StatsManager.getInstance().spend(fare, `fare:${exit.transit}`, label)) return;
    // Spent only once the fare is paid: a short wallet leaves the bus standing (and the auto's deal agreed).
    if (exit.requiresFlag) useGameStore.getState().setFlag(exit.requiresFlag, false);
    go(exit);
  }

  return {
    update: () => watchers.forEach((w) => w.update()),
    standingIn: (name) => { const z = zones.get(name); return !!z && scene.physics.overlap(player, z); },
    take: (name) => { const exit = (district.exits ?? []).find((e) => e.zone === name && zones.has(name)); if (exit) attempt(exit); },
  };
}
