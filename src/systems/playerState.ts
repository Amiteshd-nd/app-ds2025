import { NOISE } from './noise';

/**
 * What the player is doing, in one shared place (Act 4 plan §3.2, ADR-145):
 * the Player writes it each frame; the noise floor (AudioSystem), the
 * infected and the HUD read it. Pure state.
 */
export type MoveMode = 'idle' | 'crouch' | 'walk' | 'run';

export interface PlayerState {
  mode: MoveMode;
  /** Crouch is a toggle (C / the touch button); it slows and quiets you. */
  crouching: boolean;
  /** Crouched and still on a hide spot: no noise, and the infected search instead of chase. */
  hidden: boolean;
  /** The hide spot you are standing on, if any (the HUD's HIDE prompt). */
  onHideSpot: boolean;
}

export const playerState: PlayerState = { mode: 'idle', crouching: false, hidden: false, onHideSpot: false };

export function resetPlayerState(): void {
  playerState.mode = 'idle'; playerState.crouching = false; playerState.hidden = false; playerState.onHideSpot = false;
}

/** The movement floor of `noise` (ADR-49 tiles): crouch 2 · walk 5 · run 8 · still 0 · hidden 0. A crouch while still makes none. */
export function noiseFloor(s: PlayerState = playerState): number {
  if (s.hidden) return 0;
  return s.mode === 'run' ? NOISE.run : s.mode === 'walk' ? NOISE.walk : s.mode === 'crouch' ? NOISE.crouch : NOISE.idle;
}

/** Crouch walks at half speed (ADR-46). */
export const CROUCH_SPEED = 0.5;
