/**
 * Enforces ADR-64 / mobile foundation §4: device and browser APIs are called
 * only from src/platform/. Anywhere else, `navigator.*`, `localStorage`,
 * `sessionStorage`, `indexedDB`, `@capacitor/*` or `Capacitor.*` is a build
 * error with the file and line in it.
 *
 * Why a grep and not a lint plugin: the rule is one sentence, the repo has no
 * ESLint config yet, and a 60-line script with a test is cheaper to keep
 * honest than a plugin dependency.
 *
 * Exit 0 = clean. 1 = at least one leak.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');
const srcDir = resolve(here, '../src');

/** Patterns that mean "talking to the device" — each with the molecule to use instead. */
export const FORBIDDEN = [
  { pattern: /\bnavigator\./, use: 'platform.network / haptics / share' },
  { pattern: /\blocalStorage\b/, use: 'platform.storage or platform.saves' },
  { pattern: /\bsessionStorage\b/, use: 'platform.storage' },
  { pattern: /\bindexedDB\b/, use: 'platform.saves' },
  { pattern: /from ['"]@capacitor\//, use: 'a molecule in src/platform/' },
  { pattern: /\bCapacitor\./, use: 'platform.kind' },
];

/**
 * Files allowed to keep a direct call for now, each with the task that
 * removes it. Shrinks, never grows, without a DECISIONS row.
 */
export const ALLOWLIST = {
  'systems/SaveManager.ts': 'T-011 — moves to platform.saves with the 3-slot system (ADR-63)',
};

// `playground` is dev-only tooling (ADR-104): it never ships to web, PWA,
// Android or iOS — scripts/check-dist.mjs proves the build is free of it.
const SKIP_DIRS = new Set(['platform', '__tests__', 'playground']);

export function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(path, out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

/** Pure: check one file's text. Returns problems with line numbers. */
export function checkSource(relPath, source) {
  if (relPath in ALLOWLIST) return [];
  const problems = [];
  source.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, ''); // comments may mention the API
    for (const { pattern, use } of FORBIDDEN) {
      if (pattern.test(code)) {
        problems.push(`${relPath}:${i + 1}: ${code.trim()} — game code must go through src/platform (${use})`);
      }
    }
  });
  return problems;
}

export function runValidation(root = srcDir) {
  const problems = [];
  for (const path of walk(root)) {
    problems.push(...checkSource(relative(root, path), readFileSync(path, 'utf8')));
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const problems = runValidation();
  if (problems.length) {
    console.error(`\n✗ Platform boundary violated (${problems.length}):\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
  }
  const allowed = Object.keys(ALLOWLIST).length;
  console.log(`✓ platform boundary clean${allowed ? ` (${allowed} allowlisted: ${Object.keys(ALLOWLIST).join(', ')})` : ''}`);
}
