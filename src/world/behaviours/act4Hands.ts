import type Phaser from 'phaser';
import { MAPS } from '../../assets/maps';
import { gameEvents } from '../../core/events';
import { depthForZY } from '../../core/depth';
import { COMBAT, field, landing, readied, resetField, unitOf, weaponFor } from '../../systems/combat';
import { spendPips } from '../../systems/energy';
import { InventoryManager } from '../../systems/InventoryManager';
import { feedNoise } from '../../systems/noise';
import { ACT4_FLAG } from '../../systems/stability';
import { useGameStore } from '../../store';
import { color } from '../../ui/tokens';
import { TILE_SIZE } from '../../utils/constants';
import { navOf, type Nav } from '../nav';
import { cellAt } from '../walkgrid';
import type { Point } from '../../systems/infected';
import type { Behaviour } from './index';

/**
 * act4Hands (Act 4 plan step S4, ADR-151) — your hands in Act 4, in any place:
 *
 *   SPACE / HIT   swing the best weapon you carry (or shove): it costs an
 *                 energy pip, stands you up, and is loud (fighting is heard 12
 *                 tiles away, ADR-49). `act4:hit` tells the infected.
 *   Q / THROW     throw the item readied in the bag ahead of you, to the first
 *                 wall: a lure sounds where it lands; smoke hangs there.
 *
 * What lands stays in `combat.field` for act4Threat to read. Placeholder
 * looks (ADR-25): a white arc for the swing, a dot in flight, grey discs of
 * smoke and a ring where a lure sounds — the art comes with the HUD/FX pass.
 */
export const act4Hands: Behaviour = {
  attach({ scene, map, district, player, reducedMotion, playerFree }) {
    resetField();
    const store = () => useGameStore.getState();
    const inv = InventoryManager.getInstance();
    const carried = (id: string) => inv.has(id);
    let nav: Nav | null = null;
    let cooldown = 0;
    const feet = (): Point => { const b = player.body as Phaser.Physics.Arcade.Body; return [b.center.x, b.center.y]; };
    const fx = scene.add.graphics().setDepth(depthForZY(100000) - 1);
    // Smoke sits over the people in it.
    const smoke = scene.add.graphics().setDepth(depthForZY(100000) - 2);
    const live = (): boolean => Boolean(store().flags[ACT4_FLAG]) && playerFree();

    const offSwing = gameEvents.on('player:swing', ({ facing }) => {
      if (!live() || cooldown > 0) return;
      if (!spendPips(COMBAT.swing.energyPips)) return;
      cooldown = COMBAT.swing.cooldownMs;
      const weapon = weaponFor(carried);
      player.setCrouching(false);
      feedNoise(weapon.noiseTiles);
      gameEvents.emit('audio:cue', { token: 'a.sfx.combat.swing' });
      const from = feet();
      gameEvents.emit('act4:hit', { from, facing, weapon });
      // The arc ahead: a quarter ring at the weapon's reach.
      const [ux, uy] = unitOf(facing), a = Math.atan2(uy, ux), half = ((COMBAT.swing.arcDeg / 2) * Math.PI) / 180;
      fx.clear().lineStyle(2, color(weapon.id === 'uv_torch' ? 'accent.uv' : 'hud.text'), 0.9);
      fx.beginPath(); fx.arc(from[0], from[1] - 10, (weapon.reachTiles + 0.5) * TILE_SIZE, a - half, a + half); fx.strokePath();
      scene.time.delayedCall(COMBAT.swing.showMs, () => fx.clear());
    });

    const offThrow = gameEvents.on('player:throw', ({ facing }) => {
      if (!live()) return;
      const id = readied(store().flags, carried);
      if (!id) { gameEvents.emit('ui:toast', { text: 'Nothing ready to throw. Ready something in the bag (I).' }); return; }
      const t = COMBAT.throws[id];
      nav ??= navOf(scene, map, MAPS[district.map]?.collisionLayer);
      const sight = nav.sight;
      const from = feet();
      const at = landing(from, facing, t.rangeTiles, (p) => { const i = cellAt(sight, p[0], p[1]); return i >= 0 && !sight.blocked[i]; });
      if (!at) { gameEvents.emit('ui:toast', { text: 'No room to throw.' }); return; }
      inv.remove(id, 1);
      gameEvents.emit('audio:cue', { token: 'a.sfx.combat.swing' });
      const land = () => {
        gameEvents.emit('audio:cue', { token: t.cue, at: { x: at[0], y: at[1] } });
        if (t.kind === 'lure') field.lures.push({ at, pull: (t.pullTiles ?? 8) * TILE_SIZE, until: field.now + t.ms });
        else field.clouds.push({ at, r: (t.radiusTiles ?? 2) * TILE_SIZE, until: field.now + t.ms });
      };
      if (reducedMotion) { land(); return; }
      const dot = scene.add.rectangle(from[0], from[1] - 16, 4, 4, color('hud.text')).setDepth(depthForZY(100000) - 1);
      scene.tweens.add({ targets: dot, x: at[0], y: at[1], duration: 60 * t.rangeTiles, onComplete: () => { dot.destroy(); land(); } });
    });

    const update = (_t: number, delta: number) => {
      if (playerFree()) { field.now += delta; cooldown = Math.max(0, cooldown - delta); }
      field.lures = field.lures.filter((l) => l.until > field.now);
      field.clouds = field.clouds.filter((c) => c.until > field.now);
      smoke.clear();
      for (const c of field.clouds) {
        // Thins over its last two seconds.
        const fade = Math.min(1, (c.until - field.now) / 2000);
        smoke.fillStyle(color('hud.border'), 0.5 * fade).fillCircle(c.at[0], c.at[1], c.r);
        smoke.fillStyle(color('hud.border'), 0.35 * fade).fillCircle(c.at[0] - c.r * 0.35, c.at[1] - c.r * 0.3, c.r * 0.6);
        smoke.fillStyle(color('hud.border'), 0.35 * fade).fillCircle(c.at[0] + c.r * 0.4, c.at[1] - c.r * 0.15, c.r * 0.55);
      }
      for (const l of field.lures) {
        // A ring that beats while it sounds.
        const beat = reducedMotion ? 0.5 : ((field.now % 600) / 600);
        smoke.lineStyle(1, color('hud.text'), 0.6 * (1 - beat)).strokeCircle(l.at[0], l.at[1], 6 + beat * 14);
      }
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      offSwing();
      offThrow();
      resetField();
      fx.destroy();
      smoke.destroy();
    };
  },
};
