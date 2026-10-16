import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { useGameStore } from '../store';
import type { DistrictDef } from '../utils/types';
import { EntryWatcher, findObject, zoneFromObject } from './Zones';

export interface BoundTriggers {
  update(): void;
}

/** What a trigger may ask the scene to do beyond announcing itself. */
export interface TriggerActions {
  openDialogue(dialogueId: string): void;
  /** False while a conversation, a fade or an overlay is up — a dialogue trigger waits for the next entry instead of firing into silence. */
  canTalk(): boolean;
  sleep(): void;
  /** The office door: fade, the day passes, fade back at closing time (story 1.1 F3–F5). */
  workday(): void;
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
  actions: TriggerActions,
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
        if (trigger.unlessFlag && useGameStore.getState().flags[trigger.unlessFlag]) return;
        if (trigger.requiresFlag && !useGameStore.getState().flags[trigger.requiresFlag]) return;
        // A conversation is already up (Ananya's previous stop still open): do not spend this trigger — re-arm on the next entry (ADR-124).
        if (trigger.dialogue && !actions.canTalk()) return;
        fired = true;
        for (const flag of trigger.setFlags ?? []) useGameStore.getState().setFlag(flag, true);
        gameEvents.emit('zone:reached', { zoneId: trigger.zone, districtId: district.id });
        if (trigger.dialogue) actions.openDialogue(trigger.dialogue);
        if (trigger.action === 'sleep') actions.sleep();
        if (trigger.action === 'workday') actions.workday();
      }),
    );
  }

  return { update: () => watchers.forEach((w) => w.update()) };
}
