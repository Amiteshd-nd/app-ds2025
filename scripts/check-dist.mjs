/**
 * Fails the build if any dev-only Test Playground code reached the production
 * output (ADR-104). The PWA precache and the Capacitor Android/iOS shells copy
 * this same dist/, so a clean dist is a clean web, PWA, Android and iOS build.
 *
 *   node scripts/check-dist.mjs [distDir]      (runs at the end of `pnpm build`)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Strings that only exist in playground / dev-API code. */
export const MARKERS = ['__nqDev', '__pg/', 'installDevApi', 'Test Playground', 'PLAYGROUND_SAVE_NAMESPACE', 'pg-toolbar', 'playground.html', 'MovieRunner', 'Movie Mode'];
const TEXT = /\.(js|mjs|css|html|json|webmanifest|txt|map)$/;

export function checkDist(dir) {
  const problems = [];
  if (!existsSync(dir)) return [`${dir} does not exist — build first`];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      const rel = path.slice(dir.length + 1);
      if (/playground/i.test(rel)) problems.push(`${rel}: playground file in the production build`);
      if (!TEXT.test(name)) continue;
      const text = readFileSync(path, 'utf8');
      for (const m of MARKERS) if (text.includes(m)) problems.push(`${rel}: contains dev-only "${m}"`);
    }
  };
  walk(dir);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dir = resolve(process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), 'dist'));
  const problems = checkDist(dir);
  if (problems.length) {
    console.error(`\n✗ dev-only code in the production build:\n${problems.map((p) => `  • ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  console.log('✓ dist clean — no playground or dev-API code (web, PWA, Android, iOS)');
}
