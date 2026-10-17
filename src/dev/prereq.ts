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
  // "2.2b" is the second half of a story beat that spans two places (AUDIT_LOG P8): it follows "2.2" and precedes "2.3".
  const m = /^(\d+)\.(\d+)([a-z]?)$/.exec(s.seq ?? '');
  return m ? [Number(m[1]), Number(m[2]), `${m[3]}:${s.id}`] : [s.act, Number.MAX_SAFE_INTEGER, s.id];
};

/** Scenes in story order: by `seq` ("act.scene", optionally "act.sceneb" for a beat's second half); scenes without one go last in their act. */
export function sceneOrder(scenes: SceneComponent[]): SceneComponent[] {
  return [...scenes].sort((a, b) => {
    const [a1, a2, a3] = seqKey(a), [b1, b2, b3] = seqKey(b);
    return a1 - b1 || a2 - b2 || a3.localeCompare(b3);
  });
}

/**
 * The flags a beat sets: its `flag` field, "a, b" setting both and "a | b"
 * meaning alternatives (the first is taken); "-" sets none.
 */
export const beatFlags = (beat: SceneBeat): string[] =>
  (beat.flag ?? '')
    .split(',')
    .map((part) => part.split('|')[0]?.trim() ?? '')
    .filter((flag) => flag && flag !== '-');

/** The first flag a beat sets, for labels. */
export const beatFlag = (beat: SceneBeat): string | null => beatFlags(beat)[0] ?? null;

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
    // Places an earlier scene stood in have been visited — Maps offers METRO / RIDE there (ADR-134).
    for (const d of [earlier.district, ...((earlier.cast ?? []) as Array<{ district?: string } | string>).map((c) => (typeof c === 'object' ? c.district : undefined))]) if (d) flags[`visited:${d}`] = true;
  }

  // Beats that happen before the scene's entry (the bus ride before the office gate, the opening before the station stairs): their flags are already true when the scene starts.
  const allBeats = (target.beats ?? []).filter((b): b is SceneBeat => typeof b === 'object');
  for (const id of target.entry?.after ?? []) { const beat = allBeats.find((b) => b.id === id); if (beat) for (const flag of beatFlags(beat)) flags[flag] = true; }
  if (beatId) {
    const beats = allBeats;
    const at = beats.findIndex((b) => b.id === beatId);
    if (at < 0) throw new Error(`Scene "${sceneId}" has no beat "${beatId}"`);
    for (const beat of beats.slice(0, at)) for (const flag of beatFlags(beat)) flags[flag] = true;
  }

  return {
    flags,
    questsCompleted,
    stats: { ...defaults.stats },
    inventory: Object.entries(target.entry?.inventory ?? {}).flatMap(([id, n]) => Array<string>(n).fill(id)),
    counters: { ...(target.entry?.counters ?? {}) },
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
