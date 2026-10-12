import { motion } from '../../ui/tokens';
import type { Behaviour } from './index';

/**
 * beh_breathing — idle breathing for the player and every standing character
 * (ADR-107, supersedes ADR-106's whole-sprite offset).
 *
 * Breathing is a real animation of baked frames (scripts/import-breath.mjs):
 * F0 idle → F1 head dips → F2 upper body down 1px → F3 recovering. The feet
 * and legs never move, and nothing but frames changes, so bodies, collision
 * and interaction zones are untouched by construction.
 *
 * This molecule only decides WHEN: a character standing still for
 * `m.breath.resume` ms on its idle frame starts `<sheet>-breath-<dir>`;
 * moving plays the walk (the owner does that), which stops breathing at once.
 * NPCs start on a random frame with a ±`m.breath.jitter` speed, so a crowd
 * never breathes in step; the player always resumes from F0 at speed 1.
 * `breathing: false` (sleepers, statues, poses) and reduced motion keep the
 * still idle. Checks run on a 100 ms timer, not per frame.
 */

export const CHECK_MS = 100;

export interface BreathCharacter {
  active: boolean;
  texture: { key: string };
  body?: { velocity?: { x: number; y: number } } | null;
  anims: { currentAnim?: { key: string } | null; timeScale: number };
  getData(key: string): unknown;
  play(config: { key: string; startFrame?: number; timeScale?: number }): unknown;
}

export interface BreathAnimations {
  exists(key: string): boolean;
}

export interface BreathTiming {
  resume: number;
  jitter: number;
}

export const breathTiming = (): BreathTiming => ({
  resume: motion('m.breath.resume'),
  jitter: motion('m.breath.jitter'),
});

interface State {
  stillSince: number | null;
  started: boolean;
  timeScale: number;
}

/** `<sheet>-idle-<dir>` → dir, or null for any other animation. */
export const idleDirection = (sheet: string, animKey: string | undefined): string | null => {
  const prefix = `${sheet}-idle-`;
  return animKey?.startsWith(prefix) ? animKey.slice(prefix.length) : null;
};

/**
 * One check for one character. Returns what to play, or null to leave it.
 * Pure: `now`, randomness and animation lookups are passed in.
 */
export function breathDecision(
  c: BreathCharacter,
  state: State,
  now: number,
  t: BreathTiming,
  anims: BreathAnimations,
  isPlayer: boolean,
  random: () => number,
): { key: string; startFrame: number; timeScale: number } | null {
  if (!c.active || c.getData('breathing') === false) return null;
  const v = c.body?.velocity;
  if (v && (v.x !== 0 || v.y !== 0)) {
    state.stillSince = null;
    return null;
  }
  if (state.stillSince === null) state.stillSince = now;
  if (now - state.stillSince < t.resume) return null;

  const sheet = c.texture.key;
  const dir = idleDirection(sheet, c.anims.currentAnim?.key);
  if (!dir) return null; // already breathing, or in a special animation
  const key = `${sheet}-breath-${dir}`;
  if (!anims.exists(key)) return null;

  // First breath of an NPC: random frame, so the crowd starts out of step.
  const startFrame = !isPlayer && !state.started ? Math.floor(random() * 4) : 0;
  state.started = true;
  return { key, startFrame, timeScale: state.timeScale };
}

/** What the molecule needs from a scene — a Phaser scene satisfies it. */
export interface BreathScene {
  time: { now: number; addEvent(config: { delay: number; loop: boolean; callback: () => void }): { remove(): void } };
  anims: BreathAnimations;
}

export function attachBreathing(
  scene: BreathScene,
  characters: () => BreathCharacter[],
  player: BreathCharacter | null,
  options: { still?: boolean; random?: () => number; timing?: BreathTiming } = {},
): () => void {
  if (options.still) return () => {};
  const t = options.timing ?? breathTiming();
  const random = options.random ?? Math.random;
  const states = new WeakMap<BreathCharacter, State>();

  const check = () => {
    const now = scene.time.now;
    for (const c of characters()) {
      let s = states.get(c);
      if (!s) {
        const isPlayer = c === player;
        s = { stillSince: null, started: false, timeScale: isPlayer ? 1 : 1 + (random() * 2 - 1) * t.jitter };
        states.set(c, s);
      }
      const play = breathDecision(c, s, now, t, scene.anims, c === player, random);
      if (play) c.play(play);
    }
  };

  const timer = scene.time.addEvent({ delay: CHECK_MS, loop: true, callback: check });
  return () => timer.remove();
}

/**
 * The registered molecule. WorldScene attaches it everywhere (CORE_BEHAVIOURS):
 * the player, placed NPCs and the crowd breathe in every district.
 */
export const beh_breathing: Behaviour = {
  attach(ctx) {
    return attachBreathing(
      ctx.scene as unknown as BreathScene,
      () => ctx.characters() as unknown as BreathCharacter[],
      ctx.player as unknown as BreathCharacter,
      { still: ctx.reducedMotion },
    );
  },
};
