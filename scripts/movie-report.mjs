/**
 * Movie Mode reports, read in Node (T-054 step 4) — pure, so vitest covers it.
 * `scripts/movie.mjs` prints with `formatReport`, decides the exit code with
 * `exitCode`, and checks two runs against each other with `compareRuns`.
 */

const MARK = { passed: '✓', failed: '✗', cheated: '!', missing: '?', skipped: '-', running: '…', pending: '·' };

/** One line per scene, the failing step's reason under a red one, then the totals. */
export function formatReport(report) {
  const lines = [];
  for (const s of report.scenes) {
    const unresolved = s.steps.filter((st) => st.status === 'unresolved').length;
    const extra = [s.cheats && `${s.cheats} cheated`, unresolved && `${unresolved} unresolved`].filter(Boolean).join(', ');
    lines.push(`${MARK[s.status] ?? '?'} ${s.scene.padEnd(26)} ${s.status.padEnd(8)} ${String(s.steps.length).padStart(3)} steps ${(s.durationMs / 1000).toFixed(1).padStart(6)} s  ₹${s.walletEnd}${extra ? `  (${extra})` : ''}`);
    if (s.failedStep) lines.push(`    ${s.failedStep.id} ${s.failedStep.summary} — ${s.failedStep.reason ?? 'failed'}`);
  }
  const t = report.totals;
  lines.push(`${t.scenes} scenes · ${t.passed} passed · ${t.failed} failed · ${t.cheated} cheated · ${t.missing} missing · ${Math.round(t.playMs / 1000)} s play · wallet ₹${t.walletEnd} · ${t.flagsSet} flags · seed ${report.seed} · ${report.speed}×`);
  return lines.join('\n');
}

/** Non-zero on any failed scene; with `strict`, also on cheated or missing ones. */
export function exitCode(report, { strict = false } = {}) {
  const t = report.totals;
  if (t.failed > 0) return 1;
  if (strict && (t.cheated > 0 || t.missing > 0)) return 1;
  return 0;
}

/**
 * Two runs with the same seed must leave the same trace, and each scene the
 * same game time within `toleranceMs` (the pause menu opening on a hidden tab
 * is the one real-time event that can shift a scene by a few frames).
 * Returns the differences, empty when the runs agree.
 */
export function compareRuns(a, b, { toleranceMs = 250 } = {}) {
  const diffs = [];
  if (a.seed !== b.seed) diffs.push(`seed ${a.seed} ≠ ${b.seed}`);
  const n = Math.max(a.trace.length, b.trace.length);
  for (let i = 0; i < n; i++) {
    if (a.trace[i] !== b.trace[i]) {
      diffs.push(`trace[${i}]: ${a.trace[i] ?? '(end)'} ≠ ${b.trace[i] ?? '(end)'}`);
      break; // everything after the first divergence differs too
    }
  }
  if (a.trace.length !== b.trace.length) diffs.push(`trace length ${a.trace.length} ≠ ${b.trace.length}`);
  const bScenes = new Map(b.scenes.map((s) => [s.scene, s]));
  for (const s of a.scenes) {
    const o = bScenes.get(s.scene);
    if (!o) { diffs.push(`${s.scene}: missing from the second run`); continue; }
    if (s.status !== o.status) diffs.push(`${s.scene}: ${s.status} ≠ ${o.status}`);
    if (Math.abs(s.durationMs - o.durationMs) > toleranceMs) diffs.push(`${s.scene}: ${s.durationMs} ms ≠ ${o.durationMs} ms`);
    if (s.walletEnd !== o.walletEnd) diffs.push(`${s.scene}: wallet ₹${s.walletEnd} ≠ ₹${o.walletEnd}`);
  }
  return diffs;
}
