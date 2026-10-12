import { describe, expect, it } from 'vitest';
import {
  attachBreathing, breathOffset, breathStep, breathTokens,
  type BreathScene, type Breather, type BreathState,
} from '../world/behaviours/breathing';
import { motion } from '../ui/tokens';

const T = breathTokens();

describe('beh_breathing — rules', () => {
  it('reads its numbers from motion tokens', () => {
    expect(T).toEqual({
      amplitude: motion('m.breath.amplitude'),
      period: motion('m.breath.period'),
      resume: motion('m.breath.resume'),
    });
    expect(T.amplitude).toBe(1);
  });

  it('only ever offsets by whole pixels: 0 or −amplitude', () => {
    const seen = new Set<number>();
    for (let ms = 0; ms < T.period * 3; ms += 7) seen.add(breathOffset(ms, 123, T));
    expect([...seen].sort()).toEqual([-1, 0]);
    for (const v of seen) expect(Number.isInteger(v)).toBe(true);
  });

  it('half a breath at rest, half lifted', () => {
    expect(breathOffset(0, 0, T)).toBe(0);
    expect(breathOffset(T.period / 2, 0, T)).toBe(-1);
    expect(breathOffset(T.period - 1, 0, T)).toBe(-1);
  });

  it('a phase offset shifts the breath (crowds never breathe in step)', () => {
    const at = T.period / 2 + 10;
    expect(breathOffset(at, 0, T)).not.toBe(breathOffset(at, T.period / 2, T));
  });

  it('stops instantly while moving and resumes after m.breath.resume ms of standing', () => {
    const s: BreathState = { phase: T.period / 2, stillSince: null }; // lifted at t=0 once breathing
    expect(breathStep(s, true, 1000, T)).toBe(0);
    expect(breathStep(s, false, 1000, T)).toBe(0); // just stopped
    expect(breathStep(s, false, 1000 + T.resume - 1, T)).toBe(0);
    // (4000 + period/2) % period lands in the lifted half.
    expect(breathStep(s, false, 4000, T)).toBe(-1);
    expect(breathStep(s, true, 5000, T)).toBe(0); // moving again: down at once
    expect(s.stillSince).toBeNull();
  });
});

describe('beh_breathing — molecule', () => {
  const fakeScene = () => {
    const handlers: Record<string, Array<() => void>> = {};
    const scene: BreathScene & { frame(now: number): void; inView: boolean } = {
      time: { now: 0 },
      inView: true,
      events: {
        on: (e, fn) => { (handlers[e] ??= []).push(fn); },
        off: (e, fn) => { handlers[e] = (handlers[e] ?? []).filter((h) => h !== fn); },
      },
      cameras: { main: { worldView: { contains: () => scene.inView } } },
      frame(now) {
        scene.time.now = now;
        (handlers.preupdate ?? []).forEach((h) => h());
        (handlers.postupdate ?? []).forEach((h) => h());
      },
    };
    return scene;
  };
  const char = (data: Record<string, unknown> = {}): Breather & { body: { velocity: { x: number; y: number } } } => ({
    x: 10, y: 100, active: true, body: { velocity: { x: 0, y: 0 } }, getData: (k) => data[k],
  });

  it('lifts the sprite by whole pixels after physics and puts it back before the next step', () => {
    const scene = fakeScene();
    const c = char();
    attachBreathing(scene, () => [c], { random: () => 0.5 }); // phase = period/2
    scene.frame(0);                       // comes to rest
    scene.frame(T.resume + T.period);     // lifted
    expect(c.y).toBe(99);
    // The next PRE_UPDATE (what physics sees) has the base position back.
    let seenByPhysics = 0;
    scene.events.on('preupdate', () => { seenByPhysics = c.y; });
    scene.frame(T.resume + T.period + 16);
    expect(seenByPhysics).toBe(100);
  });

  it('stops while moving; respects breathing:false, reduced motion and off-screen', () => {
    const scene = fakeScene();
    const walker = char();
    const statue = char({ breathing: false });
    attachBreathing(scene, () => [walker, statue], { random: () => 0.5 });
    walker.body.velocity.x = 120;
    for (let ms = 0; ms < 5000; ms += 16) scene.frame(ms);
    expect(walker.y).toBe(100);
    expect(statue.y).toBe(100);

    const off = fakeScene();
    off.inView = false;
    const far = char();
    attachBreathing(off, () => [far], { random: () => 0.5 });
    for (let ms = 0; ms < 5000; ms += 16) off.frame(ms);
    expect(far.y).toBe(100);

    const still = fakeScene();
    const calm = char();
    attachBreathing(still, () => [calm], { still: true, random: () => 0.5 });
    for (let ms = 0; ms < 5000; ms += 16) still.frame(ms);
    expect(calm.y).toBe(100);
  });

  it('teardown restores the base position and stops listening', () => {
    const scene = fakeScene();
    const c = char();
    const off = attachBreathing(scene, () => [c], { random: () => 0.5 });
    scene.frame(0);
    scene.frame(T.resume + T.period);
    expect(c.y).toBe(99);
    off();
    expect(c.y).toBe(100);
    scene.frame(T.resume + T.period * 2);
    expect(c.y).toBe(100);
  });
});
