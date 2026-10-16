import Phaser from 'phaser';
import { depthForZY } from '../../core/depth';
import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { LAYERS } from '../../utils/constants';
import { findObject } from '../Zones';
import type { Behaviour } from './index';

/** Seconds the bus takes to pull in / pull out (reduced motion: it simply appears). */
export const BUS_MOVE_MS = 2500;

/**
 * Where a bus is `t` seconds into its cycle: on its way (`waiting`, with the
 * seconds until it stands at the stop), or `here` (with the seconds left before
 * it leaves). The cycle is `every` seconds long; the bus stands for `dwell`
 * of them at the end, so the first arrival takes a full wait.
 */
export function busPhase(t: number, every: number, dwell: number): { state: 'waiting' | 'here'; seconds: number } {
  const cycle = ((t % every) + every) % every;
  const arrive = every - dwell;
  return cycle < arrive ? { state: 'waiting', seconds: Math.ceil(arrive - cycle) } : { state: 'here', seconds: Math.ceil(every - cycle) };
}

/** "500-D in 1:12" / "500-D at the stop · 0:18". */
export function busTimerText(label: string, phase: { state: 'waiting' | 'here'; seconds: number }): string {
  const m = Math.floor(phase.seconds / 60), s = phase.seconds % 60;
  const clock = `${m}:${String(s).padStart(2, '0')}`;
  return phase.state === 'waiting' ? `${label} in ${clock}` : `${label} at the stop · ${clock}`;
}

/**
 * busSchedule — buses on a visible interval (story 1.5 F2, ADR-123). The
 * district lists `buses`; each one slides in from `from` to `stop`, stands
 * `dwell` seconds with its `flag` set (the boarding exit's `requiresFlag`),
 * then leaves to `to`. The HUD's timer plate counts down to it. Clock runs on
 * the scene's time (pauses with the world), and the flag is cleared on
 * attach and teardown so a save never carries a phantom bus.
 */
export const busSchedule: Behaviour = {
  attach({ scene, district, map, reducedMotion }) {
    const buses = district.buses ?? [];
    if (!buses.length) return;
    const store = () => useGameStore.getState();
    const sprites = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle>();
    const point = (name: string) => { const o = findObject(map, LAYERS.spawns, name); return o ? { x: o.x ?? 0, y: o.y ?? 0 } : null; };

    for (const bus of buses) {
      if (store().flags[bus.flag]) store().setFlag(bus.flag, false);
      const from = point(bus.from);
      if (!from) continue;
      const sprite = bus.prop && scene.textures.exists(bus.prop)
        ? scene.add.image(from.x, from.y, bus.prop).setOrigin(0.5, 1)
        : scene.add.rectangle(from.x, from.y, 112, 40, 0x334466).setOrigin(0.5, 1);
      sprite.setDepth(depthForZY(from.y));
      sprite.setVisible(false);
      sprites.set(bus.id, sprite);
    }

    const start = scene.time.now;
    let lastText: string | null = null;
    const states = new Map<string, 'waiting' | 'here'>();
    const update = () => {
      const t = (scene.time.now - start) / 1000;
      // Sort with the people on the road: the bus's bottom edge is its feet.
      for (const s of sprites.values()) if (s.visible) s.setDepth(depthForZY(s.y));
      let text: string | null = null;
      for (const bus of buses) {
        const phase = busPhase(t, bus.every, bus.dwell);
        const prev = states.get(bus.id) ?? 'waiting';
        if (phase.state !== prev) {
          states.set(bus.id, phase.state);
          const sprite = sprites.get(bus.id);
          if (phase.state === 'here') {
            const stop = point(bus.stop);
            // The doors open when the bus has visibly stopped: the flag follows the tween, not a separate clock.
            const open = () => { if (states.get(bus.id) === 'here') store().setFlag(bus.flag, true); };
            if (sprite) scene.tweens.killTweensOf(sprite); // a leave still sliding must not fight the pull-in
            if (sprite && stop && !reducedMotion) {
              const f = point(bus.from)!;
              sprite.setVisible(true).setPosition(f.x, f.y);
              scene.tweens.add({ targets: sprite, x: stop.x, y: stop.y, duration: BUS_MOVE_MS, ease: 'Sine.easeOut', onComplete: open });
            } else {
              if (sprite && stop) sprite.setVisible(true).setPosition(stop.x, stop.y);
              open();
            }
            gameEvents.emit('ui:toast', { text: `${bus.label} pulling in.`, icon: 'bus' });
          } else {
            store().setFlag(bus.flag, false);
            const to = point(bus.to);
            if (sprite) scene.tweens.killTweensOf(sprite);
            if (sprite && to) {
              if (reducedMotion) sprite.setVisible(false);
              else scene.tweens.add({ targets: sprite, x: to.x, y: to.y, duration: BUS_MOVE_MS, ease: 'Sine.easeIn', onComplete: () => sprite.setVisible(false) });
            }
          }
        }
        // One plate: the first bus listed owns the countdown.
        if (text === null) text = busTimerText(bus.label, phase.state === 'here' && !store().flags[bus.flag] ? { state: 'waiting', seconds: 0 } : phase);
      }
      if (text !== lastText) { lastText = text; gameEvents.emit('ui:timer', { text }); }
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      for (const bus of buses) if (store().flags[bus.flag]) store().setFlag(bus.flag, false);
      for (const s of sprites.values()) s.destroy();
      gameEvents.emit('ui:timer', { text: null });
    };
  },
};
