import COMBAT_JSON from '../data/infected/combat.json';
import { TILE_SIZE } from '../utils/constants';
import type { Direction } from '../utils/types';
import type { Point } from './infected';

/**
 * Fighting and throwing in Act 4 — pure (act4 doc §3, ADR-48, the user's
 * infected spec §2, Act 4 plan step S4, ADR-151). The numbers are
 * `data/infected/combat.json`; act4Threat applies what these decide.
 *
 *   swing   SPACE / HIT: the first weapon in `order` you carry, else the shove.
 *           Everyone in reach and inside the arc ahead of you (nearest first, up
 *           to the weapon's `targets`) is stunned and knocked back. It costs an
 *           energy pip and it is loud: fighting is heard 12 tiles away (ADR-49).
 *   throw   Q / THROW: the item readied in the bag, `rangeTiles` ahead (or to
 *           the first wall). A lure pulls them; smoke blinds them.
 */
export interface Weapon { id: string; name: string; reachTiles: number; stunMs: number; knockbackTiles: number; targets: number; noiseTiles: number; cue: string }
export interface Throwable { kind: 'lure' | 'smoke'; rangeTiles: number; ms: number; pullTiles?: number; radiusTiles?: number; cue: string }

export const COMBAT = COMBAT_JSON as unknown as {
  swing: { cooldownMs: number; energyPips: number; arcDeg: number; showMs: number };
  order: string[];
  weapons: Record<string, Omit<Weapon, 'id'>>;
  stunned: { angryMs: number; angrySpeed: number; evolvedStunScale: number };
  throws: Record<string, Throwable>;
  bag: { slots: number };
};

/** The flag that marks the item readied to throw (one at a time). */
export const READY_PREFIX = 'ready:';
export const readyFlag = (itemId: string): string => `${READY_PREFIX}${itemId}`;

/** What you swing: the first of `order` you carry, else your hands. */
export function weaponFor(carried: (id: string) => boolean): Weapon {
  const id = COMBAT.order.find((w) => carried(w)) ?? 'shove';
  return { id, ...COMBAT.weapons[id] };
}

/** The item readied to throw, if you still carry it. */
export function readied(flags: Record<string, boolean>, carried: (id: string) => boolean): string | null {
  const id = Object.keys(flags).find((f) => f.startsWith(READY_PREFIX) && flags[f])?.slice(READY_PREFIX.length);
  return id && COMBAT.throws[id] && carried(id) ? id : null;
}

/** Ready one item: its flag on, every other ready flag off. */
export function readyEffect(itemId: string, flags: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of Object.keys(flags)) if (f.startsWith(READY_PREFIX) && flags[f]) out[f] = false;
  out[readyFlag(itemId)] = true;
  return out;
}

export const unitOf = (dir: Direction): Point => (dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]);

/**
 * Who a swing hits: indices of `targets` within reach (feet to feet, plus half a tile of body) and inside the arc
 * ahead, nearest first, at most the weapon's count. Stunned ones can be hit again (it resets the clock).
 */
export function swingHits(from: Point, facing: Direction, weapon: Weapon, targets: Point[]): number[] {
  const [ux, uy] = unitOf(facing);
  const reach = (weapon.reachTiles + 0.5) * TILE_SIZE;
  const cosHalf = Math.cos(((COMBAT.swing.arcDeg / 2) * Math.PI) / 180);
  return targets
    .map((t, i) => ({ i, d: Math.hypot(t[0] - from[0], t[1] - from[1]), dot: t[0] - from[0], doty: t[1] - from[1] }))
    .filter((o) => o.d <= reach && (o.d < TILE_SIZE * 0.5 || (o.dot * ux + o.doty * uy) / (o.d || 1) >= cosHalf))
    .sort((a, b) => a.d - b.d)
    .slice(0, weapon.targets)
    .map((o) => o.i);
}

/** Where a knockback pushes something at `at`, away from `from`. */
export function knockback(from: Point, at: Point, tiles: number): Point {
  const dx = at[0] - from[0], dy = at[1] - from[1], len = Math.hypot(dx, dy) || 1;
  return [at[0] + (dx / len) * tiles * TILE_SIZE, at[1] + (dy / len) * tiles * TILE_SIZE];
}

/** How long a hit stuns this tier (the Evolved shake it off in half the time). */
export const stunFor = (weapon: Weapon, evolved: boolean): number => Math.round(weapon.stunMs * (evolved ? COMBAT.stunned.evolvedStunScale : 1));

/**
 * Where a throw lands: `rangeTiles` ahead, or short of the first blocked point (`free` checks a point). Steps of a
 * quarter tile; the last free point wins. Null when even the first step is blocked (your face to a wall).
 */
export function landing(from: Point, facing: Direction, rangeTiles: number, free: (p: Point) => boolean): Point | null {
  const [ux, uy] = unitOf(facing);
  let last: Point | null = null;
  for (let s = 0.25; s <= rangeTiles + 1e-9; s += 0.25) {
    const p: Point = [from[0] + ux * s * TILE_SIZE, from[1] + uy * s * TILE_SIZE];
    if (!free(p)) break;
    last = p;
  }
  return last;
}

export interface Cloud { at: Point; r: number; until: number }

/** Does the segment a→b pass through a smoke cloud (or start or end inside one)? */
export function smokeBlocks(a: Point, b: Point, clouds: Cloud[], now: number): boolean {
  for (const c of clouds) {
    if (c.until <= now) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((c.at[0] - a[0]) * dx + (c.at[1] - a[1]) * dy) / len2));
    if (Math.hypot(a[0] + t * dx - c.at[0], a[1] + t * dy - c.at[1]) <= c.r) return true;
  }
  return false;
}

export interface Lure { at: Point; pull: number; until: number }

/** The lure that pulls something at `p` (the newest still sounding, in range), or null. */
export function lureFor(p: Point, lures: Lure[], now: number): Point | null {
  for (let i = lures.length - 1; i >= 0; i--) {
    const l = lures[i];
    if (l.until > now && Math.hypot(p[0] - l.at[0], p[1] - l.at[1]) <= l.pull) return l.at;
  }
  return null;
}

/**
 * What is in the air right now (ADR-151): the smoke clouds and the lures act4Hands threw, on its own clock. The
 * infected (act4Threat) read it; a place's teardown clears it.
 */
export const field: { now: number; clouds: Cloud[]; lures: Lure[] } = { now: 0, clouds: [], lures: [] };

export function resetField(): void { field.now = 0; field.clouds = []; field.lures = []; }
