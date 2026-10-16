import { useEffect, useState } from 'react';
import type { MovieRunner } from './movie/runner';
import type { RunnerState, SceneReport } from './movie/types';

interface Props {
  runner: MovieRunner | null;
  /** The scene / beat the tree has selected, for "Play from here". */
  selected: { scene: string; beat?: string } | null;
}

const COLOURS: Record<string, string> = { passed: 'var(--pg-good)', failed: 'var(--pg-bad)', cheated: 'var(--pg-warn)', missing: 'var(--pg-warn)', running: 'var(--pg-focus)', pending: 'var(--pg-edge)', skipped: 'var(--pg-dim)' };

/** The movie's controller bar: play / pause / skip / restart / stop, speed, the progress strip and the run report. */
export default function MovieBar({ runner, selected }: Props) {
  const [state, setState] = useState<RunnerState | null>(runner?.state ?? null);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!runner) return;
    setState(runner.state);
    return runner.subscribe(setState);
  }, [runner]);
  if (!runner || !state) return <div className="pg-movie"><button className="pg-primary" disabled>▶ PLAY</button><span className="pg-dim">Movie Mode loads with the game.</span></div>;
  const busy = state.status === 'playing' || state.status === 'paused';
  const report = state.report;
  const copy = async () => {
    if (!report) return;
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="pg-movie">
      <div className="pg-movie-controls">
        {!busy ? (
          <>
            <button className="pg-primary" title="Play every built scene from the first, like a movie" onClick={() => runner.play()}>▶ PLAY</button>
            <button disabled={!selected} title="Play from the selected scene / beat" onClick={() => selected && runner.play(selected)}>▶ from here</button>
          </>
        ) : state.status === 'playing' ? (
          <button title="Pause" onClick={() => runner.pause()}>⏸</button>
        ) : (
          <button className="pg-primary" title="Resume" onClick={() => runner.resume()}>▶</button>
        )}
        <button disabled={!busy} title="Skip this scene" onClick={() => runner.skipScene()}>⏭</button>
        <button disabled={!busy} title="Restart this scene" onClick={() => runner.restartScene()}>⏮</button>
        <button disabled={!busy} title="Stop the movie" onClick={() => runner.stop()}>⏹</button>
        <select title="Speed (dialogue scales too)" value={state.speed} onChange={(e) => runner.setSpeed(Number(e.target.value) as 1 | 2 | 4)}>
          {[1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <span className="pg-movie-status">
          {state.status === 'idle' ? 'Movie Mode' : state.status === 'done' ? 'Done' : state.status === 'stopped' ? 'Stopped' : `${state.currentScene ?? ''}${state.currentBeat ? ` · ${state.currentBeat}` : ''}${state.currentStep ? ` · ${state.currentStep}` : ''}`}
        </span>
        <button disabled={!report} onClick={() => setShowReport((v) => !v)}>{showReport ? 'Hide report' : 'Report'}</button>
      </div>
      <div className="pg-movie-strip" title="One block per built scene: green passed · red failed · yellow cheated or unresolved · grey not reached. Click to play from there.">
        {state.scenes.map((s) => (
          <button key={s.scene} className="pg-movie-block" style={{ background: COLOURS[s.status] ?? COLOURS.pending }} title={`${s.title} — ${s.status}`} disabled={busy} onClick={() => runner.play({ scene: s.scene })} />
        ))}
      </div>
      {state.log.length ? <div className="pg-movie-log">{state.log.slice(-3).map((l, i) => <div key={i}>{l}</div>)}</div> : null}
      {showReport && report && (
        <div className="pg-movie-report">
          <div className="pg-row">
            <strong>Run report</strong>
            <span className="pg-dim">seed {report.seed} · {report.speed}× · {report.totals.scenes} scenes · {report.totals.passed} passed · {report.totals.failed} failed · {report.totals.cheated} cheated · {Math.round(report.totals.playMs / 1000)} s play · wallet ₹{report.totals.walletEnd} · {report.totals.flagsSet} flags</span>
            <button onClick={copy}>{copied ? 'Copied' : 'Copy report'}</button>
          </div>
          {report.scenes.map((s) => <SceneRow key={`${s.scene}-${s.startedAt}`} scene={s} />)}
        </div>
      )}
    </div>
  );
}

function SceneRow({ scene }: { scene: SceneReport }) {
  const [open, setOpen] = useState(scene.status === 'failed' || scene.status === 'cheated');
  return (
    <details className="pg-fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><span style={{ color: COLOURS[scene.status] }}>■</span> {scene.title} — {scene.status} · {Math.round(scene.durationMs / 1000)} s{scene.failedStep ? ` · failed at ${scene.failedStep.id}: ${scene.failedStep.reason}` : ''}{scene.cheats ? ` · ${scene.cheats} cheated` : ''}</summary>
      <ul className="pg-movie-steps">
        {scene.steps.map((st) => <li key={st.index} style={{ color: COLOURS[st.status === 'unresolved' ? 'cheated' : st.status] }}>{st.id} {st.beat ? `[${st.beat}] ` : ''}{st.summary} — {st.status}{st.reason ? `: ${st.reason}` : ''} ({st.ms} ms)</li>)}
      </ul>
      {scene.screenshot && <img className="pg-movie-shot" src={scene.screenshot} alt={`${scene.scene} at the failing step`} />}
      {scene.flagsSet.length ? <div className="pg-dim">flags: {scene.flagsSet.join(', ')}</div> : null}
    </details>
  );
}
