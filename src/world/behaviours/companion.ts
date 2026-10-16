import Phaser from 'phaser';
import { useGameStore } from '../../store';
import type { Direction } from '../../utils/types';
import type { Behaviour } from './index';

/** How close the companion walks (px between feet) and how fast. */
export const COMPANION_GAP = 34;
export const COMPANION_SPEED = 110;

/**
 * companion — an NPC who walks the loop with you (story 1.6 F3, ADR-123). The
 * district names `companion: { npc, whileFlag, untilFlag }`; while the flag
 * holds, that NPC steps toward the player whenever they are more than a gap
 * away, facing the way they move, and stands where they are once the walk
 * ends. The NPC stays a normal, talkable NPC throughout (its static body is
 * moved with it), so the stop dialogues are ordinary zone triggers.
 */
export const companion: Behaviour = {
  attach({ scene, district, player, characters }) {
    const def = district.companion;
    if (!def) return;
    const store = useGameStore.getState;
    let facing: Direction = 'down';
    let moving = false;
    const update = (_t: number, delta: number) => {
      const flags = store().flags;
      const npc = characters().find((c) => c.getData('npcId') === def.npc);
      if (!npc || !npc.active) return;
      const walking = Boolean(flags[def.whileFlag]) && !(def.untilFlag && flags[def.untilFlag]);
      const sheet = npc.texture.key;
      if (!walking) {
        if (moving) { moving = false; if (scene.anims.exists(`${sheet}-idle-${facing}`)) npc.play(`${sheet}-idle-${facing}`, true); }
        return;
      }
      const dx = player.x - npc.x, dy = player.y - npc.y;
      const dist = Math.hypot(dx, dy);
      if (dist > COMPANION_GAP) {
        const step = Math.min(dist - COMPANION_GAP + 1, (COMPANION_SPEED * delta) / 1000);
        npc.x += (dx / dist) * step;
        npc.y += (dy / dist) * step;
        facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        if (scene.anims.exists(`${sheet}-walk-${facing}`)) npc.play(`${sheet}-walk-${facing}`, true);
        moving = true;
        const body = npc.body as Phaser.Physics.Arcade.StaticBody | null;
        body?.updateFromGameObject();
      } else if (moving) {
        moving = false;
        if (scene.anims.exists(`${sheet}-idle-${facing}`)) npc.play(`${sheet}-idle-${facing}`, true);
      }
    };
    scene.events.on('update', update);
    return () => scene.events.off('update', update);
  },
};
