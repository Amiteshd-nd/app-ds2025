/**
 * Prerequisite state for the Test Playground (dev only, ADR-104/105).
 *
 * Jumping straight into scene N should feel like having played 1..N−1: every
 * earlier scene's `save_flags` are set and its quests completed, the player
 * stands at scene N's `entry`, and — when starting at a beat — the flags of
 * the beats before it in that scene are set too. Wallet, stats, inventory and
 * clock start from the game's defaults; the playground lets you override any
 * of it (presets) before pressing Play.
 *
 * Pure: scenes and defaults come in, a plain object comes out. Tests pin it.
 */
import type { PlayerStats, SceneBeat, SceneComponent } from '../utils/types';

export interface PlaygroundState {
  flags: Record<string, boolean>;
  questsCompleted: string[];
  stats: PlayerStats;
  inventory: string[];
  counters: Record<string, number>;
  clock: { day: number; minute: number };
  reputation: number;
  position: { districtId: string; spawnId: string };
}

/** A preset or an inspector edit: any part of the state. */
export interface StateOverride {
  flags?: Record<string, boolean>;
  questsCompleted?: string[];
  stats?: Partial<PlayerStats>;
  inventory?: string[];
  counters?: Record<string, number>;
  clock?: Partial<PlaygroundState['clock']>;
  reputation?: number;
  position?: Partial<PlaygroundState['position']>;
}

const seqKey = (s: SceneComponent): [number, number, string] => {
  const m = /^(\d+)\.(\d+)$/.exec(s.seq ?? '');
  return m ? [Number(m[1]), Number(m[2]), s.id] : [s.act, Number.MAX_SAFE_INTEGER, s.id];
};

/** Scenes in story order: by `seq` ("act.scene"); scenes without one go last in their act. */
export function sceneOrder(scenes: SceneComponent[]): SceneComponent[] {
  return [...scenes].sort((a, b) => {
    const [a1, a2, a3] = seqKey(a), [b1, b2, b3] = seqKey(b);
    return a1 - b1 || a2 - b2 || a3.localeCompare(b3);
  });
}

/** The flag a beat sets: its `flag`, or the first of "a | b" alternatives; "-" sets none. */
export const beatFlag = (beat: SceneBeat): string | null => {
  const first = beat.flag?.split('|')[0]?.trim();
  return first && first !== '-' ? first : null;
};

/** "08:30 morning" → 510; nothing parseable → null. */
const parseTime = (time?: string): number | null => {
  const m = /(\d{1,2}):(\d{2})/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export interface PrereqDefaults {
  stats: PlayerStats;
  clock: { day: number; minute: number };
}

export function buildPrereqState(
  sceneId: string,
  scenes: SceneComponent[],
  defaults: PrereqDefaults,
  beatId?: string,
): PlaygroundState {
  const ordered = sceneOrder(scenes);
  const index = ordered.findIndex((s) => s.id === sceneId);
  if (index < 0) throw new Error(`Unknown scene "${sceneId}"`);
  const target = ordered[index];

  const flags: Record<string, boolean> = {};
  const questsCompleted: string[] = [];
  for (const earlier of ordered.slice(0, index)) {
    for (const flag of earlier.save_flags ?? []) flags[flag] = true;
    for (const quest of earlier.quests ?? []) if (!questsCompleted.includes(quest)) questsCompleted.push(quest);
  }

  if (beatId) {
    const beats = (target.beats ?? []).filter((b): b is SceneBeat => typeof b === 'object');
    const at = beats.findIndex((b) => b.id === beatId);
    if (at < 0) throw new Error(`Scene "${sceneId}" has no beat "${beatId}"`);
    for (const beat of beats.slice(0, at)) {
      const flag = beatFlag(beat);
      if (flag) flags[flag] = true;
    }
  }

  return {
    flags,
    questsCompleted,
    stats: { ...defaults.stats },
    inventory: [],
    counters: {},
    clock: { day: defaults.clock.day, minute: parseTime(target.time) ?? defaults.clock.minute },
    reputation: 0,
    position: { districtId: target.district, spawnId: target.entry?.spawn ?? '' },
  };
}

/** Apply a preset / inspector override on top of a built state (objects merge one level deep). */
export function applyOverride(state: PlaygroundState, override: StateOverride = {}): PlaygroundState {
  const out = structuredClone(state);
  for (const [key, value] of Object.entries(override) as Array<[keyof PlaygroundState, unknown]>) {
    if (value === undefined) continue;
    const current = out[key];
    if (current && typeof current === 'object' && !Array.isArray(current) && value && typeof value === 'object' && !Array.isArray(value)) {
      (out as unknown as Record<string, unknown>)[key] = { ...(current as object), ...(value as object) };
    } else {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
