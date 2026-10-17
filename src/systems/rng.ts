/**
 * Seeded randomness for anything that must play the same way twice (Movie
 * Mode's `--twice`, ADR-130): mulberry32, and a string → seed hash so a place
 * and an Act 4 day give the same rolls every time. Gameplay never calls
 * Math.random for an outcome.
 */
export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** FNV-1a: a stable 32-bit seed from a string ("whitefield_street:3"). */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
