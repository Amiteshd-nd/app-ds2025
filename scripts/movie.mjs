/**
 * `pnpm movie` — Movie Mode without a window (T-054 step 4, ADR-130).
 *
 * Starts the Vite dev server on 6177 (strictPort; the Playground's own 6175
 * stays free for a human), opens playground.html in headless Chromium
 * (playwright-core, Apache-2.0, pinned to a browser build already cached by
 * `npx playwright install chromium`), and drives the game on ONE stepped
 * clock: the RAF loop sleeps, every tween manager reads a fixed 16.67 ms, and
 * Node advances the game frame by frame until `__nqMovie.state.status` is done.
 * The same seed then gives the same run on any machine, at any CPU speed.
 *
 *   pnpm movie                     every built scene; exit 1 on a failed scene
 *   pnpm movie --twice             two runs (a fresh page each), then compare traces + scene times
 *   pnpm movie --scene act1_cubbon [--beat F3]   from that scene on (▶ from here)
 *   pnpm movie --strict            cheated / missing scenes fail too
 *   pnpm movie --url http://localhost:6175   reuse a running Playground
 *
 * The run report also lands in playground/reports/ (the Playground POSTs it).
 */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareRuns, exitCode, formatReport } from './movie-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 6177;
const FRAME_MS = 1000 / 60;
const CHUNK = 3000; // frames per page.evaluate — progress prints between chunks
const MAX_FRAMES = 60 * 60 * 30; // half an hour of game time: a hung run ends, it never spins

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  console.error('playwright-core is missing — run `corepack pnpm install`.');
  process.exit(2);
}

let server = null;
let base = option('url');
if (!base) {
  server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { port: PORT, strictPort: true, open: false } });
  await server.listen();
  base = `http://localhost:${PORT}`;
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (e) {
  console.error(`Could not start headless Chromium: ${e.message.split('\n')[0]}\nInstall the browser playwright-core 1.63 expects: npx playwright@1.63.0 install chromium-headless-shell`);
  await server?.close();
  process.exit(2);
}

let code = 0;
try {
  const runs = flag('twice') ? 2 : 1;
  const reports = [];
  for (let r = 0; r < runs; r++) {
    if (runs > 1) console.log(`\n── run ${r + 1} of ${runs} ──`);
    // A fresh page per run: what is compared is a run from boot, the way CI starts one.
    const page = await openPlayground();
    const report = await playOnce(page, { scene: option('scene'), beat: option('beat') });
    await page.close();
    reports.push(report);
    console.log(formatReport(report));
    code = Math.max(code, exitCode(report, { strict: flag('strict') }));
  }
  if (runs === 2) {
    const diffs = compareRuns(reports[0], reports[1], { toleranceMs: Number(option('tolerance') ?? 0) });
    if (diffs.length) { console.log(`\n✗ the two runs differ:\n  ${diffs.join('\n  ')}`); code = 1; }
    else console.log(`\n✓ deterministic: identical ${reports[0].trace.length}-step trace, every scene's game time within tolerance`);
  }
} catch (e) {
  console.error(e);
  code = 2;
} finally {
  await browser.close();
  await server?.close();
}
process.exit(code);

/** playground.html in a new page, booted, on the stepped clock. */
async function openPlayground() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${base}/playground.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__nqMovie && window.__nqGame?.cache.bitmapFont.exists('pxb'), null, { timeout: 60_000 });

  // Boot has finished loading when the fonts are in; give the title a few real frames to settle.
  await page.waitForTimeout(500);
  // One clock: stop the RAF loop; every tween manager (including scenes started later) reads a fixed frame.
  await page.evaluate((frameMs) => {
    const g = window.__nqGame;
    g.loop.sleep();
    const fix = () => { for (const s of g.scene.scenes) if (s.tweens && !s.tweens.__nqFixed) { s.tweens.getDelta = function () { return frameMs * this.timeScale; }; s.tweens.__nqFixed = true; } };
    fix();
    g.events.on('prestep', fix);
    window.__nqClock = { t: g.loop.now || performance.now(), frames: 0 };
    // A macrotask yield that is not clamped to 4 ms like nested setTimeouts are.
    const ch = new MessageChannel(); const queue = [];
    ch.port1.onmessage = () => queue.shift()?.();
    window.__nqYield = () => new Promise((r) => { queue.push(r); ch.port2.postMessage(0); });
  }, FRAME_MS);

  return page;
}

/** Start a run and step the game until the runner reports done (or stopped); returns the report. */
async function playOnce(page, from) {
  await page.evaluate((f) => { window.__nqMoviePrev = window.__nqMovie.state.report; window.__nqMovie.play(f.scene ? f : {}); }, from);
  let frames = 0, lastLine = '';
  for (;;) {
    const s = await page.evaluate(async ({ n, frameMs }) => {
      const g = window.__nqGame, m = window.__nqMovie, c = window.__nqClock;
      const fresh = () => m.state.report && m.state.report !== window.__nqMoviePrev;
      for (let i = 0; i < n; i++) {
        if (fresh() && (m.state.status === 'done' || m.state.status === 'stopped')) break;
        c.t += frameMs; c.frames++;
        g.step(c.t, frameMs);
        await window.__nqYield();
      }
      // Let the report POST and the last awaits settle.
      for (let i = 0; i < 5; i++) await window.__nqYield();
      return { status: fresh() ? m.state.status : 'starting', scene: m.state.currentScene, step: m.state.currentStep, frames: c.frames };
    }, { n: CHUNK, frameMs: FRAME_MS });
    frames += CHUNK;
    const line = `  ${s.status} · ${s.scene ?? '-'} · ${s.step ?? ''}`;
    if (line !== lastLine) { console.log(line); lastLine = line; }
    if (s.status === 'done' || s.status === 'stopped') break;
    if (frames > MAX_FRAMES) {
      await page.evaluate(() => window.__nqMovie.stop());
      throw new Error(`no end after ${MAX_FRAMES} frames — stopped at ${s.scene} · ${s.step}`);
    }
  }
  const report = await page.evaluate(() => {
    const r = window.__nqMovie.state.report;
    // Screenshots stay in the JSON file the Playground wrote; the console needs the rest.
    return { ...r, scenes: r.scenes.map(({ screenshot, ...s }) => ({ ...s, screenshot: screenshot ? '(in the report file)' : undefined })) };
  });
  return report;
}
