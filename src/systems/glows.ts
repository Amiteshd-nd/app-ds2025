/**
 * Glows (ADR-161): lights that keep their colour when a place's grade drains it — the tunnel's red emergency
 * lights, the Host's eyes. Whoever owns a light puts it here in world px under a key; GradeScene (above the
 * world camera's colour matrix, below the HUD) draws every glow in screen space, so the drain never greys it.
 * Pure state, no Phaser.
 */
export interface Glow {
  x: number;
  y: number;
  /** Radius of the brightest core, px; the halo steps out from it. */
  r: number;
  color: number;
  /** 0–1. */
  alpha: number;
  /** Rings of halo around the core (pixel-stepped, never a smooth gradient). 0 = a hard dot (an eye). */
  halo: number;
}

const owners = new Map<string, Glow[]>();

export const setGlows = (key: string, list: Glow[]): void => { if (list.length) owners.set(key, list); else owners.delete(key); };
export const clearGlows = (key: string): void => { owners.delete(key); };
export const allGlows = (): Glow[] => [...owners.values()].flat();
export const resetGlows = (): void => { owners.clear(); };
