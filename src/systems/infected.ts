import { PLAYER_RUN_SPEED, PLAYER_SPEED, TILE_SIZE } from '../utils/constants';
import { NOISE } from './noise';

/**
 * The infected's mind — pure (infected doc §1–2, act4 doc §4, ADR-31/49,
 * Act 4 plan §3.3, ADR-145). One function, `think`, turns what an infected
 * senses into what it does next; the entity only moves where it is told.
 *
 *   idle (a pack member in cover) ─┐
 *   wander ── sees you / the pack calls ──▶ alert (0.5 s growl, +1 s if you
 *   were Namma to them) ──▶ chase (≤ 8 s; loses sight → your last spot)
 *   ──▶ search (3 s) ──▶ wander.       A hit → recover (1 s) → chase.
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

export type InfectedMode = 'idle' | 'wander' | 'alert' | 'chase' | 'search' | 'recover';
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
}

export const brain = (mode: InfectedMode = 'wander', namma = false): InfectedBrain =>
  ({ mode, t: 0, chaseT: 0, lastSeen: null, target: null, namma, hesitated: false, pause: 0 });

/** Detection radius in px: your noise in tiles (never under crouch's 2 — standing still close up still counts), +2 at night. */
export const detectRadius = (noiseTiles: number, night: boolean): number =>
  (Math.max(noiseTiles, NOISE.crouch) + (night ? INFECTED.nightTiles : 0)) * TILE_SIZE;

/** Sees you: in line of sight, inside the radius, and you are neither hidden nor in UV light. */
export function detects(distPx: number, noiseTiles: number, night: boolean, los: boolean, hidden: boolean, inUV: boolean): boolean {
  return !hidden && !inUV && los && distPx <= detectRadius(noiseTiles, night);
}

/** Hears you without seeing you: inside your noise radius (a loud sound reaches further) but no line of sight. */
export const hears = (distPx: number, noiseTiles: number, night: boolean, hidden: boolean): boolean =>
  !hidden && noiseTiles > 0 && distPx <= (noiseTiles + (night ? INFECTED.nightTiles : 0)) * TILE_SIZE;

export interface Senses {
  dt: number;
  sees: boolean;
  /** Where you are (feet). */
  player: Point;
  /** A sound it heard but can't see the source of: walk to it. */
  heard: Point | null;
  /** Its pack's lead growled within range. */
  packAlert: boolean;
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
  const night = s.night ? INFECTED.nightSpeed : 1;
  let growled = false;
  const toAlert = () => { enter(b, 'alert'); b.target = null; growled = true; };

  switch (b.mode) {
    case 'idle':
      if (s.sees || s.packAlert) toAlert();
      break;
    case 'wander':
      if (s.sees || s.packAlert) { toAlert(); break; }
      if (s.heard) { b.target = s.heard; break; }
      if (b.target && s.atTarget) { b.target = null; b.t = 0; b.pause = INFECTED.pauseMs[0] + rng() * (INFECTED.pauseMs[1] - INFECTED.pauseMs[0]); }
      if (!b.target && b.t >= b.pause) b.target = stroll();
      break;
    case 'alert': {
      const wait = INFECTED.growlMs + (b.namma && !b.hesitated ? INFECTED.hesitateMs : 0);
      if (b.t >= wait) { b.hesitated = true; enter(b, 'chase'); b.chaseT = 0; b.lastSeen = s.player; }
      break;
    }
    case 'chase':
      b.chaseT += s.dt;
      if (s.sees) b.lastSeen = s.player;
      b.target = b.lastSeen;
      if (b.chaseT >= INFECTED.chaseMs || (!s.sees && s.atTarget)) { enter(b, 'search'); b.target = null; }
      break;
    case 'search':
      if (s.sees) { toAlert(); break; }
      if (b.t >= INFECTED.searchMs) { enter(b, 'wander'); b.target = null; b.pause = 0; break; }
      if (!b.target || s.atTarget) b.target = stroll();
      break;
    case 'recover':
      if (b.t >= INFECTED.recoverMs) { enter(b, 'chase'); b.lastSeen = s.player; }
      break;
  }

  const speed = b.mode === 'chase' ? INFECTED.chaseSpeed * night
    : b.mode === 'wander' ? INFECTED.wanderSpeed * night
    : b.mode === 'search' ? INFECTED.wanderSpeed * 1.5 * night
    : 0;
  return { speed, target: speed > 0 ? b.target : null, growled };
}

/** It touched you: it stands for a second (your window), then the chase goes on. */
export function struck(b: InfectedBrain): void { enter(b, 'recover'); b.target = null; }
