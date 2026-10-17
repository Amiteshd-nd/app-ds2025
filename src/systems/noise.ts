/**
 * noise — the shared gameplay/audio value (ADR-23 → ADR-31/49; audio plan v1
 * §2.7), in tiles of detection radius: crouch 2, walk 5, run 8, fight 12.
 * Movement sets a floor every frame; a loud sound (a cue's `noise`) lifts it
 * and decays back over 1.5 s. Act 4's infected read `noise.value`. Pure state,
 * no engine: tests drive it directly.
 */
export const NOISE = { idle: 0, crouch: 2, walk: 5, run: 8, fight: 12 } as const;
export const NOISE_DECAY_MS = 1500;

export interface NoiseState { value: number; peak: number; peakAge: number; floor: number }

export const noise: NoiseState = { value: 0, peak: 0, peakAge: 0, floor: 0 };

export function resetNoise(): void { noise.value = 0; noise.peak = 0; noise.peakAge = 0; noise.floor = 0; }

/** A sound was made: the loudest recent one wins. */
export function feedNoise(tiles: number): void {
  if (tiles >= noise.value) { noise.peak = tiles; noise.peakAge = 0; noise.value = Math.max(noise.floor, tiles); }
}

/** Every frame: the movement floor, and the last loud sound fading back to it. */
export function tickNoise(dtMs: number, floor: number): number {
  noise.floor = floor;
  noise.peakAge += dtMs;
  const t = Math.min(1, noise.peakAge / NOISE_DECAY_MS);
  noise.value = Math.max(floor, noise.peak * (1 - t));
  return noise.value;
}
