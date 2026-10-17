import { PLAYER_RUN_SPEED, PLAYER_SPEED, TILE_SIZE } from '../utils/constants';
import { NOISE } from './noise';
import EVOLVED_JSON from '../data/infected/evolved.json';
import COMBAT_JSON from '../data/infected/combat.json';

/** The Evolved tier's numbers (the user's addendum §2b, ADR-147) — data, not code. */
export const EVOLVED = EVOLVED_JSON;

/** Fresh (0–2 days since the place fell) and Degraded (3+) share the numbers above; the Evolved are their own. */
export type Tier = 'fresh' | 'degraded' | 'evolved';

/**
 * The infected's mind — pure (infected doc §1–2, act4 doc §4, ADR-31/49,
 * Act 4 plan §3.3, ADR-145). One function, `think`, turns what an infected
 * senses into what it does next; the entity only moves where it is told.
 *
 *   idle (a pack member in cover) ─┐
 *   wander ── sees you / the pack calls ──▶ alert (0.5 s growl, +1 s if you
 *   were Namma to them) ──▶ chase (≤ 8 s; loses sight → your last spot)
 *   ──▶ search (3 s) ──▶ wander.       A hit → recover (1 s) → chase.
 *   Your swing (ADR-151) → stunned (2 s) → chase, angrier for 5 s.
 *   A lure it hears and you out of sight → it walks to the lure.
 *
 * It never leaves its zone (the caller clamps), never enters UV, and cannot
 * see you while you are hidden. Night adds 2 tiles and 10 % speed.
 */
export const INFECTED = {
  /** 0.4× your walk (ADR-49). */
  wanderSpeed: 0.4 * PLAYER_SPEED,
  /** 0.9× your run (plan §7): you can outrun them, barely. */
  chaseSpeed: 0.9 * PLAYER_RUN_SPEED,
  growlMs: 500,
  chaseMs: 8000,
  searchMs: 3000,
  /** After a hit it stands for a second: your window to run. */
  recoverMs: 1000,
  /** Someone you reached Namma with hesitates (ADR-34). */
  hesitateMs: 1000,
  nightTiles: 2,
  nightSpeed: 1.1,
  /** A lead's growl wakes its pack within this many tiles. */
  packAlertTiles: 8,
  /** Feet centres closer than this = a touch. */
  touchPx: 20,
  /** A wanderer pauses this long between strolls. */
  pauseMs: [800, 2400] as const,
} as const;

export type InfectedMode = 'idle' | 'wander' | 'alert' | 'chase' | 'search' | 'recover' | 'stunned';
export type Point = [number, number];

export interface InfectedBrain {
  mode: InfectedMode;
  /** ms in this mode. */
  t: number;
  /** ms since the chase began (a re-sighting does not extend it). */
  chaseT: number;
  lastSeen: Point | null;
  /** Where it is walking to, or null (standing / about to pick). */
  target: Point | null;
  /** This one was someone you reached Namma with. */
  namma: boolean;
  hesitated: boolean;
  /** A wander pause, picked when a stroll ends. */
  pause: number;
  tier: Tier;
  /** How long this stun lasts (ms). */
  stunMs: number;
  /** ms of anger left after a stun: it chases faster (act4 doc §4). */
  angry: number;
}

export const brain = (mode: InfectedMode = 'wander', namma = false, tier: Tier = 'degraded'): InfectedBrain =>
  ({ mode, t: 0, chaseT: 0, lastSeen: null, target: null, namma, hesitated: false, pause: 0, tier, stunMs: 0, angry: 0 });

/** Detection radius in px: your noise in tiles (never under crouch's 2 — standing still close up still counts), +2 at night. */
export const detectRadius = (noiseTiles: number, night: boolean, tier: Tier = 'degraded'): number =>
  (Math.max(noiseTiles, NOISE.crouch) + (night ? INFECTED.nightTiles : 0) + (tier === 'evolved' ? EVOLVED.detectBonusTiles : 0)) * TILE_SIZE;

/** Sees you: in line of sight, inside the radius, and you are neither hidden nor in UV light. */
export function detects(distPx: number, noiseTiles: number, night: boolean, los: boolean, hidden: boolean, inUV: boolean, tier: Tier = 'degraded'): boolean {
  return !hidden && !inUV && los && distPx <= detectRadius(noiseTiles, night, tier);
}

/** Hears you without seeing you: inside your noise radius (a loud sound reaches further) but no line of sight. */
export const hears = (distPx: number, noiseTiles: number, night: boolean, hidden: boolean, tier: Tier = 'degraded'): boolean =>
  !hidden && noiseTiles > 0 && distPx <= (tier === 'evolved' ? Math.max(EVOLVED.hearTiles, noiseTiles) : noiseTiles + (night ? INFECTED.nightTiles : 0)) * TILE_SIZE;

/** Chase speed by tier: Fresh/Degraded 0.9× your run (you can outrun them); Evolved 1.1× (1.2× at night) — you can't, in the open. */
export const chaseSpeed = (tier: Tier, night: boolean): number =>
  tier === 'evolved' ? PLAYER_RUN_SPEED * (night ? EVOLVED.nightRunRatio : EVOLVED.chaseRunRatio) : INFECTED.chaseSpeed * (night ? INFECTED.nightSpeed : 1);

/**
 * May an Evolved appear here (addendum §2b)? Only where stability is under 25, only once the base chain has
 * reached the café (the gate flag), at most 2 in a place and 1 in a pack, and never within 3 tiles of a UV
 * light's edge.
 */
export function evolvedAllowed(o: { stability: number; flags: Record<string, boolean>; inPlace: number; inPack: number; tilesFromUVEdge: number }): boolean {
  const g = EVOLVED.spawn;
  return o.stability < g.maxStability && Boolean(o.flags[g.gateFlag]) && o.inPlace < g.perPocket && o.inPack < g.perPack && o.tilesFromUVEdge >= g.uvEdgeTiles;
}

export interface Senses {
  dt: number;
  sees: boolean;
  /** Where you are (feet). */
  player: Point;
  /** A sound it heard but can't see the source of: walk to it. */
  heard: Point | null;
  /** Its pack's lead growled within range. */
  packAlert: boolean;
  /** A thrown noise it can hear (ADR-151): it walks there while it doesn't see you. */
  lure?: Point | null;
  /** It has reached its target (the caller measures). */
  atTarget: boolean;
  night: boolean;
}

export interface Intent {
  speed: number;
  target: Point | null;
  /** It just turned on you — the growl (and the detect sting). */
  growled: boolean;
}

const enter = (b: InfectedBrain, mode: InfectedMode) => { b.mode = mode; b.t = 0; };

/** One tick of thought. `rng` and `stroll` (a point to wander to inside its zone) are the caller's, seeded. */
export function think(b: InfectedBrain, s: Senses, rng: () => number, stroll: () => Point | null): Intent {
  b.t += s.dt;
  b.angry = Math.max(0, b.angry - s.dt);
  const lure = s.lure ?? null;
  const night = s.night ? INFECTED.nightSpeed : 1;
  let growled = false;
  const toAlert = () => { enter(b, 'alert'); b.target = null; growled = true; };

  switch (b.mode) {
    case 'idle':
      if (s.sees || s.packAlert) toAlert();
      else if (lure) { enter(b, 'wander'); b.target = lure; }
      break;
    case 'wander':
      if (s.sees || s.packAlert) { toAlert(); break; }
      if (lure) { b.target = lure; break; }
      if (s.heard) { b.target = s.heard; break; }
      if (b.target && s.atTarget) { b.target = null; b.t = 0; b.pause = INFECTED.pauseMs[0] + rng() * (INFECTED.pauseMs[1] - INFECTED.pauseMs[0]); }
      if (!b.target && b.t >= b.pause) b.target = stroll();
      break;
    case 'alert': {
      const wait = (b.tier === 'evolved' ? EVOLVED.growlMs : INFECTED.growlMs) + (b.namma && !b.hesitated ? INFECTED.hesitateMs : 0);
      if (b.t >= wait) { b.hesitated = true; enter(b, 'chase'); b.chaseT = 0; b.lastSeen = s.player; }
      break;
    }
    case 'chase':
      b.chaseT += s.dt;
      if (s.sees) b.lastSeen = s.player;
      else if (lure) b.lastSeen = lure;
      b.target = b.lastSeen;
      if (b.chaseT >= INFECTED.chaseMs || (!s.sees && s.atTarget)) { enter(b, 'search'); b.target = null; }
      break;
    case 'search':
      if (s.sees) { toAlert(); break; }
      if (lure) { b.target = lure; break; }
      if (b.t >= (b.tier === 'evolved' ? EVOLVED.searchMs : INFECTED.searchMs)) { enter(b, 'wander'); b.target = null; b.pause = 0; break; }
      if (!b.target || s.atTarget) b.target = stroll();
      break;
    case 'recover':
      if (b.t >= INFECTED.recoverMs) { enter(b, 'chase'); b.lastSeen = s.player; }
      break;
    case 'stunned':
      // Up again, and angry: straight back at you.
      if (b.t >= b.stunMs) { enter(b, 'chase'); b.chaseT = 0; b.lastSeen = s.player; b.angry = COMBAT_JSON.stunned.angryMs; }
      break;
  }

  const speed = b.mode === 'chase' ? chaseSpeed(b.tier, s.night) * (b.angry > 0 ? COMBAT_JSON.stunned.angrySpeed : 1)
    : b.mode === 'wander' ? INFECTED.wanderSpeed * night
    : b.mode === 'search' ? INFECTED.wanderSpeed * 1.5 * night
    : 0;
  return { speed, target: speed > 0 ? b.target : null, growled };
}

/** It touched you: it stands for a second (your window), then the chase goes on. */
export function struck(b: InfectedBrain): void { enter(b, 'recover'); b.target = null; }

/** Your swing landed (ADR-48/151): down for `ms` — not dead — then up and angry. */
export function stun(b: InfectedBrain, ms: number): void { enter(b, 'stunned'); b.stunMs = ms; b.target = null; b.hesitated = true; }
