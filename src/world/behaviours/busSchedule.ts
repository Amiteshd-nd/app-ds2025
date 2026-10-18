import type Phaser from 'phaser';
import { depthForZY } from '../../core/depth';
import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { exitRuns } from '../../systems/night';
import { ACT4_FLAG } from '../../systems/stability';
import { LAYERS } from '../../utils/constants';
import type { BusSchedule } from '../../utils/types';
import { findObject } from '../Zones';
import type { Behaviour } from './index';
import { cue } from '../../audio/cue';

/** Seconds the bus takes to pull in / pull out (reduced motion: it simply appears). */
export const BUS_MOVE_MS = 2500;
/** Seconds an on-call bus waits after you step off the stop before it pulls away (ADR-162). */
export const BUS_ON_CALL_DWELL_S = 4;

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
 * An on-call bus (ADR-162), one step at a time: it comes when you stand at the
 * stop and the route runs, stands while you're there, and leaves `dwell`
 * seconds after you step away. `away` → `arriving` → `here` → `leaving` → `away`.
 */
export type CallState = 'away' | 'arriving' | 'here' | 'leaving';
export function onCallNext(state: CallState, atStop: boolean, runs: boolean, awaySince: number | null, now: number, dwell: number): CallState {
  if (state === 'away') return atStop && runs ? 'arriving' : 'away';
  if (state === 'here') return !runs || (!atStop && awaySince !== null && now - awaySince >= dwell) ? 'leaving' : 'here';
  return state; // arriving / leaving end when their tween does
}

type BusSprite = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

/**
 * busSchedule — buses you board with E (story 1.5 F2, ADR-123, ADR-160/161).
 * The district lists `buses`. An interval bus (`every`) slides in from `from`
 * to `stop`, stands `dwell` seconds with its `flag` set (the boarding exit's
 * `requiresFlag`), then leaves to `to`; the HUD's timer plate counts down to
 * it. An on-call bus (`onCall`) comes when you stand at its stop. A bus
 * without `from`/`stop`/`to` is not drawn (the airport coach): its doors are
 * open while you stand at the stop. While the doors are open and you stand on
 * the footpath by them (the exit's zone), E shows BOARD over the front door.
 * The art faces west; a bus driving east is mirrored. Clock runs on the
 * scene's time (pauses with the world), and the flags are cleared on attach
 * and teardown so a save never carries a phantom bus.
 */
export const busSchedule: Behaviour = {
  attach({ scene, district, map, reducedMotion, playerFree, board, standingIn, offer }) {
    const buses = district.buses ?? [];
    if (!buses.length) return;
    const store = () => useGameStore.getState();
    const sprites = new Map<string, BusSprite>();
    const point = (name: string | undefined) => { const o = name ? findObject(map, LAYERS.spawns, name) : undefined; return o ? { x: o.x ?? 0, y: o.y ?? 0 } : null; };
    // Only the image mirrors (the fallback block has no front).
    const face = (sprite: BusSprite, fromX: number, toX: number) => { if ('setFlipX' in sprite) sprite.setFlipX(toX > fromX); };
    // The route runs (ADR-133/150): no buses at night or once the city is shut.
    const runs = (bus: BusSchedule) => {
      const exit = district.exits?.find((e) => e.zone === bus.zone);
      return !!exit && !store().flags[ACT4_FLAG] && exitRuns(exit, store().clock.minute);
    };

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

    /** Slide in to the stop; the doors open when it has visibly stopped. */
    const pullIn = (bus: BusSchedule, opened: () => boolean, done?: () => void) => {
      const sprite = sprites.get(bus.id);
      const stop = point(bus.stop);
      const open = () => { if (opened()) store().setFlag(bus.flag, true); done?.(); };
      if (sprite) scene.tweens.killTweensOf(sprite); // a leave still sliding must not fight the pull-in
      if (sprite && stop && !reducedMotion) {
        const f = point(bus.from)!;
        sprite.setVisible(true).setPosition(f.x, f.y);
        face(sprite, f.x, stop.x);
        scene.tweens.add({ targets: sprite, x: stop.x, y: stop.y, duration: BUS_MOVE_MS, ease: 'Sine.easeOut', onComplete: open });
      } else {
        if (sprite && stop) sprite.setVisible(true).setPosition(stop.x, stop.y);
        open();
      }
      gameEvents.emit('ui:toast', { text: `${bus.label} pulling in.`, icon: 'bus' });
      // Heard from the stop (ADR-140): the horn as it pulls in, the doors' hiss.
      if (stop) { cue('a.sfx.vehicle.bus.horn', stop); cue('a.sfx.vehicle.bus.door_hiss', stop); }
    };
    /** Doors shut; drive off to `to` (the hill's terminus: it turns round). */
    const pullOut = (bus: BusSchedule, done?: () => void) => {
      store().setFlag(bus.flag, false);
      const sprite = sprites.get(bus.id);
      const to = point(bus.to);
      const at = point(bus.stop);
      if (at) cue('a.sfx.vehicle.bus.pass', at);
      if (sprite) scene.tweens.killTweensOf(sprite);
      if (sprite && to && !reducedMotion) {
        face(sprite, sprite.x, to.x);
        scene.tweens.add({ targets: sprite, x: to.x, y: to.y, duration: BUS_MOVE_MS, ease: 'Sine.easeIn', onComplete: () => { sprite.setVisible(false); done?.(); } });
      } else {
        sprite?.setVisible(false);
        done?.();
      }
    };

    // BOARD over the front door while the doors are open and you're on the footpath; an undrawn bus, over the stop.
    const withdraw = buses.map((bus) => offer({
      verb: 'BOARD',
      at: () => {
        if (!store().flags[bus.flag] || !standingIn(bus.zone) || !playerFree()) return null;
        const sprite = sprites.get(bus.id);
        if (sprite) {
          const nose = 'flipX' in sprite && sprite.flipX ? 1 : -1;
          return { x: sprite.x + nose * sprite.displayWidth * 0.3, y: sprite.y - sprite.displayHeight };
        }
        const z = findObject(map, LAYERS.spawns, bus.zone);
        return z ? { x: (z.x ?? 0) + (z.width ?? 0) / 2, y: z.y ?? 0 } : null;
      },
      act: () => {
        gameEvents.emit('entity:interacted', { entityId: `bus:${bus.id}` });
        board(bus.zone);
      },
    }));

    const start = scene.time.now;
    let lastText: string | null = null;
    const states = new Map<string, 'waiting' | 'here'>();
    const calls = new Map<string, { state: CallState; awaySince: number | null }>();
    const update = () => {
      const now = scene.time.now;
      const t = (now - start) / 1000;
      // Sort with the people on the road: the bus's bottom edge is its feet.
      for (const s of sprites.values()) if (s.visible) s.setDepth(depthForZY(s.y));
      let text: string | null = null;
      for (const bus of buses) {
        if (bus.onCall) {
          const call = calls.get(bus.id) ?? { state: 'away' as CallState, awaySince: null };
          calls.set(bus.id, call);
          const atStop = standingIn(bus.zone);
          call.awaySince = atStop ? null : (call.awaySince ?? t);
          if (!sprites.has(bus.id)) {
            // Not drawn: the coach stands at the bay whenever the route runs.
            const open = atStop && runs(bus);
            if (!!store().flags[bus.flag] !== open) store().setFlag(bus.flag, open);
            continue;
          }
          const next = onCallNext(call.state, atStop, runs(bus), call.awaySince, t, bus.dwell ?? BUS_ON_CALL_DWELL_S);
          if (next === call.state) continue;
          call.state = next;
          if (next === 'arriving') pullIn(bus, () => call.state === 'arriving', () => { if (call.state === 'arriving') call.state = 'here'; });
          else if (next === 'leaving') pullOut(bus, () => { if (call.state === 'leaving') call.state = 'away'; });
          continue;
        }
        const phase = busPhase(t, bus.every!, bus.dwell!);
        const prev = states.get(bus.id) ?? 'waiting';
        if (phase.state !== prev) {
          states.set(bus.id, phase.state);
          if (phase.state === 'here') pullIn(bus, () => states.get(bus.id) === 'here');
          else pullOut(bus);
        }
        // One plate: the first interval bus listed owns the countdown.
        if (text === null) text = busTimerText(bus.label, phase.state === 'here' && !store().flags[bus.flag] ? { state: 'waiting', seconds: 0 } : phase);
      }
      if (text !== lastText) { lastText = text; gameEvents.emit('ui:timer', { text }); }
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      for (const w of withdraw) w();
      for (const bus of buses) if (store().flags[bus.flag]) store().setFlag(bus.flag, false);
      for (const s of sprites.values()) s.destroy();
      if (lastText !== null) gameEvents.emit('ui:timer', { text: null });
    };
  },
};
