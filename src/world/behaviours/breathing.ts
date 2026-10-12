import { motion } from '../../ui/tokens';
import type { Behaviour } from './index';

/**
 * beh_breathing — idle breathing for the player and every standing character.
 *
 * A 1px lift held for half a breath (design system §7: sprites snap, no
 * easing), only while a character stands still, resuming `m.breath.resume`
 * ms after it stops. Every character gets its own phase so a crowd never
 * breathes in step. Driven by motion tokens, not numbers in code.
 *
 * Pixel and physics safe: the offset is added to the sprite after physics
 * has run (POST_UPDATE) and taken off again before the next step
 * (PRE_UPDATE), so bodies, collision and interaction reach never move — only
 * the drawn sprite does, by whole pixels. One shared tick for everyone;
 * off-screen characters are skipped.
 */

export interface BreathTokens {
  amplitude: number;
  period: number;
  resume: number;
}

export const breathTokens = (): BreathTokens => ({
  amplitude: motion('m.breath.amplitude'),
  period: motion('m.breath.period'),
  resume: motion('m.breath.resume'),
});

/** Lift at a moment in the breath: 0 (rest) or −amplitude (inhale), whole pixels only. */
export function breathOffset(nowMs: number, phaseMs: number, t: BreathTokens): number {
  const at = (((nowMs + phaseMs) % t.period) + t.period) % t.period;
  return at < t.period / 2 ? 0 : -Math.round(t.amplitude);
}

export interface BreathState {
  phase: number;
  /** When the character last came to rest; null while moving. */
  stillSince: number | null;
}

/** Advance one character: moving → 0 and reset; standing → wait `resume`, then breathe. */
export function breathStep(state: BreathState, moving: boolean, nowMs: number, t: BreathTokens): number {
  if (moving) {
    state.stillSince = null;
    return 0;
  }
  if (state.stillSince === null) state.stillSince = nowMs;
  if (nowMs - state.stillSince < t.resume) return 0;
  return breathOffset(nowMs, state.phase, t);
}

/** What the molecule needs from a character — a Phaser sprite satisfies it. */
export interface Breather {
  x: number;
  y: number;
  active: boolean;
  body?: { velocity?: { x: number; y: number } } | null;
  getData(key: string): unknown;
}

/** What the molecule needs from a scene — a Phaser scene satisfies it. */
export interface BreathScene {
  time: { now: number };
  events: { on(event: string, fn: () => void): unknown; off(event: string, fn: () => void): unknown };
  cameras: { main: { worldView: { contains(x: number, y: number): boolean } } };
}

/** Phaser scene event names (Phaser.Scenes.Events), kept as strings so this file runs in Node tests. */
const PRE_UPDATE = 'preupdate';
const POST_UPDATE = 'postupdate';
/** Characters within this many px of the view still breathe (they may step in). */
const MARGIN = 48;

/**
 * Attach breathing to whatever `characters()` returns each frame. Returns the
 * teardown. `breathing: false` in a character's data (sleeping NPCs, statues,
 * special poses) opts it out; `still` (reduced motion) turns it all off.
 */
export function attachBreathing(
  scene: BreathScene,
  characters: () => Breather[],
  options: { still?: boolean; random?: () => number; tokens?: BreathTokens } = {},
): () => void {
  if (options.still) return () => {};
  const t = options.tokens ?? breathTokens();
  const random = options.random ?? Math.random;
  const states = new WeakMap<Breather, BreathState & { applied: number }>();
  let lifted: Array<Breather> = [];

  const settle = () => {
    for (const c of lifted) {
      const s = states.get(c);
      if (s && s.applied) { c.y -= s.applied; s.applied = 0; }
    }
    lifted = [];
  };

  const breathe = () => {
    const now = scene.time.now;
    const view = scene.cameras.main.worldView;
    for (const c of characters()) {
      if (!c.active || c.getData('breathing') === false) continue;
      let s = states.get(c);
      if (!s) {
        s = { phase: Math.floor(random() * t.period), stillSince: null, applied: 0 };
        states.set(c, s);
      }
      const v = c.body?.velocity;
      const moving = Boolean(v && (v.x !== 0 || v.y !== 0));
      const near = view.contains(c.x, c.y)
        || view.contains(c.x - MARGIN, c.y) || view.contains(c.x + MARGIN, c.y)
        || view.contains(c.x, c.y - MARGIN) || view.contains(c.x, c.y + MARGIN);
      const offset = near ? breathStep(s, moving, now, t) : 0;
      if (offset) {
        c.y += offset;
        s.applied = offset;
        lifted.push(c);
      }
    }
  };

  scene.events.on(PRE_UPDATE, settle);
  scene.events.on(POST_UPDATE, breathe);
  return () => {
    settle();
    scene.events.off(PRE_UPDATE, settle);
    scene.events.off(POST_UPDATE, breathe);
  };
}

/**
 * The registered molecule. WorldScene attaches it everywhere (CORE_BEHAVIOURS):
 * the player, placed NPCs and the crowd breathe in every district.
 */
export const beh_breathing: Behaviour = {
  attach(ctx) {
    return attachBreathing(ctx.scene, () => ctx.characters() as unknown as Breather[], { still: ctx.reducedMotion });
  },
};
