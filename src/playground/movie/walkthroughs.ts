import type { Walkthrough } from './types';

/**
 * Walkthroughs by scene id, discovered by glob (dev only — this module is
 * imported by the Playground alone, so src/data/index.ts never pulls the
 * folder into the production bundle; scripts/check-dist.mjs verifies).
 */
const modules = import.meta.glob('../../data/walkthroughs/*.json', { eager: true, import: 'default' }) as Record<string, Walkthrough>;

export const WALKTHROUGHS: Record<string, Walkthrough> = Object.fromEntries(
  Object.values(modules).map((w) => [w.scene, w]),
);
