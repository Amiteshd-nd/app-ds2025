import { runStep } from './actions';
import type { MovieDriver, RunnerState, RunReport, SceneReport, SceneStatus, Step, StepResult, Walkthrough } from './types';

export interface MovieScene {
  id: string;
  title: string;
  act: number;
  /** The district the scene stands in, for the title card. */
  place: string;
  /** Beat ids in order, for "play from here". */
  beats: string[];
}

export interface RunnerOptions {
  seed?: number;
  /** Where the report goes at the end (the Playground POSTs it); returns a file name to show. */
  onReport?: (report: RunReport) => Promise<string | null>;
}

const MAX_LOG = 40;

/**
 * Movie Mode's runner (Test Playground, dev only): plays every built scene in
 * story order through the MovieDriver, one walkthrough step at a time. A
 * failed or timed-out step marks the scene red and the next scene starts from
 * its own prerequisite state; the movie always reaches the end. Everything the
 * UI shows comes from `state`, published through `subscribe`.
 */
export class MovieRunner {
  state: RunnerState;
  private listeners = new Set<(s: RunnerState) => void>();
  private stopRequested = false;
  private skipRequested = false;
  private restartRequested = false;
  private running: Promise<void> | null = null;
  private trace: string[] = [];

  constructor(private readonly driver: MovieDriver & { setSpeed?(s: number): void; setPaused?(p: boolean): void; abort?(): void; seed?(n: number): void; unseed?(): void }, private readonly scenes: MovieScene[], private readonly walkthroughs: Record<string, Walkthrough>, private readonly opts: RunnerOptions = {}) {
    this.state = { status: 'idle', speed: 1, sceneIndex: -1, stepIndex: -1, currentScene: null, currentBeat: null, currentStep: null, scenes: scenes.map((s) => ({ scene: s.id, title: s.title, status: 'pending' })), report: null, log: [] };
  }

  subscribe(cb: (s: RunnerState) => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private publish(patch: Partial<RunnerState>): void { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l(this.state); }
  private log(message: string): void { this.publish({ log: [...this.state.log, message].slice(-MAX_LOG) }); }

  /** Play every built scene from the first, or from a scene (and beat) the tree has selected. */
  play(from: { scene?: string; beat?: string } = {}): void {
    if (this.state.status === 'playing' || this.state.status === 'paused') return;
    // A stopped run may still be writing its report: start after it, never beside it.
    const previous = this.running ?? Promise.resolve();
    const chain: Promise<void> = previous.catch(() => undefined).then(() => this.begin(from)).finally(() => { if (this.running === chain) this.running = null; });
    this.running = chain;
  }

  private async begin(from: { scene?: string; beat?: string }): Promise<void> {
    const start = from.scene ? Math.max(0, this.scenes.findIndex((s) => s.id === from.scene)) : 0;
    this.stopRequested = false; this.skipRequested = false; this.restartRequested = false;
    this.trace = [];
    const seed = this.opts.seed ?? 7;
    const report: RunReport = { version: 1, startedAt: new Date().toISOString(), seed, speed: this.state.speed, scenes: [], totals: { scenes: 0, passed: 0, failed: 0, cheated: 0, missing: 0, playMs: 0, walletEnd: 0, flagsSet: 0 }, trace: [] };
    this.publish({ status: 'playing', report, sceneIndex: start, stepIndex: -1, scenes: this.scenes.map((s, i) => ({ scene: s.id, title: s.title, status: i < start ? 'skipped' : 'pending' })), log: [] });
    this.driver.seed?.(seed);
    this.driver.setSpeed?.(this.state.speed);
    await this.run(start, from.beat);
  }

  pause(): void { if (this.state.status === 'playing') { this.driver.walk(0, 0); this.driver.setPaused?.(true); this.publish({ status: 'paused' }); } }
  resume(): void { if (this.state.status === 'paused') { this.driver.setPaused?.(false); this.publish({ status: 'playing' }); } }
  skipScene(): void { if (this.running) { this.skipRequested = true; if (this.state.status === 'paused') this.resume(); } }
  restartScene(): void { if (this.running) { this.restartRequested = true; this.skipRequested = true; if (this.state.status === 'paused') this.resume(); } }
  stop(): void { if (this.running) { this.stopRequested = true; this.skipRequested = true; if (this.state.status === 'paused') this.resume(); } }
  setSpeed(speed: 1 | 2 | 4): void { this.publish({ speed }); this.driver.setSpeed?.(speed); }

  private async run(start: number, beat?: string): Promise<void> {
    for (let i = start; i < this.scenes.length; i++) {
      if (this.stopRequested) break;
      this.publish({ sceneIndex: i });
      for (;;) {
        this.restartRequested = false; this.skipRequested = false;
        await this.runScene(this.scenes[i], i === start ? beat : undefined);
        if (!this.restartRequested || this.stopRequested) break;
        this.log(`restarting ${this.scenes[i].id}`);
        this.state.report!.scenes.pop();
      }
    }
    await this.finish();
  }

  private async runScene(scene: MovieScene, beat?: string): Promise<void> {
    const walkthrough = this.walkthroughs[scene.id];
    const report: SceneReport = { scene: scene.id, title: scene.title, status: 'running', startedAt: this.driver.now(), durationMs: 0, steps: [], cheats: 0, flagsSet: [], walletEnd: 0 };
    this.state.report!.scenes.push(report);
    this.setSceneStatus(scene.id, 'running');
    this.publish({ currentScene: scene.id, currentBeat: beat ?? null, currentStep: null, stepIndex: -1 });
    this.driver.overlay.title(`ACT ${scene.act} · ${scene.title.toUpperCase()} · ${scene.place.toUpperCase()}`);
    this.driver.overlay.pill(`${scene.id} · loading`);
    const flagsBefore = new Set(Object.keys(this.driver.state().flags).filter((f) => this.driver.state().flags[f]));
    // Each scene draws from its own seed: a scene plays the same in the full movie and from "▶ from here",
    // and a change to one scene's walkthrough never reshuffles the crowd in the scenes after it.
    this.driver.seed?.(sceneSeed(this.state.report!.seed, scene.id));
    this.driver.loadScene(scene.id, beat);
    if (!walkthrough) {
      report.status = 'missing';
      this.log(`${scene.id}: no walkthrough file — skipped (yellow)`);
      this.trace.push(`${scene.id}:missing`);
      await this.driver.frames(30).catch(() => undefined);
      this.closeScene(report, flagsBefore);
      return;
    }
    const steps = beat ? walkthrough.steps.slice(Math.max(0, walkthrough.steps.findIndex((s) => s.beat === beat))) : walkthrough.steps;
    let failed: StepResult | undefined;
    for (let i = 0; i < steps.length; i++) {
      if (this.skipRequested || this.stopRequested) { this.trace.push(`${scene.id}:${stepId(steps[i], i)}:skipped`); report.steps.push({ index: i, id: stepId(steps[i], i), beat: steps[i].beat, action: steps[i].do, summary: summarise(steps[i]), status: 'skipped', reason: 'skipped', ms: 0 }); continue; }
      const step = steps[i];
      this.publish({ stepIndex: i, currentBeat: step.beat ?? this.state.currentBeat, currentStep: summarise(step) });
      this.driver.overlay.pill(`${scene.id} · ${step.beat ?? '-'} · ${i + 1}/${steps.length} ${summarise(step)}`);
      // The pause menu opens by itself when the tab hides: close it and say so, rather than freezing the run.
      if (this.driver.state().overlay === 'menu') { this.log('the pause menu opened on its own — closing it'); await this.driver.key('Escape', 'Escape', 27).catch(() => undefined); }
      const t0 = this.driver.now();
      const result = await runStep(this.driver, step, { speed: this.state.speed, cancelled: () => this.skipRequested || this.stopRequested, log: (m) => this.log(`${scene.id}/${stepId(step, i)}: ${m}`) });
      const entry: StepResult = { index: i, id: stepId(step, i), beat: step.beat, action: step.do, summary: summarise(step), status: result.status, reason: result.reason, ms: Math.round(this.driver.now() - t0) };
      if (entry.status === 'failed' && step.optional) { entry.status = 'skipped'; entry.reason = `optional: ${result.reason}`; }
      report.steps.push(entry);
      this.trace.push(`${scene.id}:${entry.id}:${entry.status}`);
      if (entry.status === 'cheated') { report.cheats += 1; this.log(`${scene.id}/${entry.id}: CHEATED — ${entry.reason}`); }
      if (entry.status === 'unresolved') this.log(`${scene.id}/${entry.id}: unresolved — ${entry.reason}`);
      if (entry.status === 'failed') {
        failed = entry;
        this.log(`${scene.id}/${entry.id}: FAILED — ${entry.reason}`);
        report.screenshot = (await this.driver.screenshot()) ?? undefined;
        break;
      }
    }
    report.failedStep = failed;
    report.status = this.stopRequested ? 'skipped' : failed ? 'failed' : this.skipRequested ? 'skipped' : report.cheats || report.steps.some((s) => s.status === 'unresolved' && !steps[s.index]?.optional) ? 'cheated' : 'passed';
    this.closeScene(report, flagsBefore);
  }

  private closeScene(report: SceneReport, flagsBefore: Set<string>): void {
    const s = this.driver.state();
    report.durationMs = Math.round(this.driver.now() - report.startedAt);
    report.walletEnd = s.wallet;
    report.flagsSet = Object.keys(s.flags).filter((f) => s.flags[f] && !flagsBefore.has(f)).sort();
    this.setSceneStatus(report.scene, report.status);
    this.publish({ report: { ...this.state.report! } });
  }

  private setSceneStatus(id: string, status: SceneStatus): void {
    this.publish({ scenes: this.state.scenes.map((s) => (s.scene === id ? { ...s, status } : s)) });
  }

  private async finish(): Promise<void> {
    const report = this.state.report!;
    report.finishedAt = new Date().toISOString();
    report.trace = [...this.trace];
    const t = report.totals;
    t.scenes = report.scenes.length;
    t.passed = report.scenes.filter((s) => s.status === 'passed').length;
    t.failed = report.scenes.filter((s) => s.status === 'failed').length;
    t.cheated = report.scenes.filter((s) => s.status === 'cheated').length;
    t.missing = report.scenes.filter((s) => s.status === 'missing').length;
    t.playMs = report.scenes.reduce((n, s) => n + s.durationMs, 0);
    t.walletEnd = this.driver.state().wallet;
    t.flagsSet = new Set(report.scenes.flatMap((s) => s.flagsSet)).size;
    this.driver.overlay.pill(null);
    this.driver.overlay.clear();
    this.driver.unseed?.();
    this.driver.walk(0, 0);
    this.publish({ status: this.stopRequested ? 'stopped' : 'done', report: { ...report }, currentStep: null });
    if (this.opts.onReport) {
      const file = await this.opts.onReport(report).catch(() => null);
      if (file) this.log(`report written: ${file}`);
    }
  }
}

/** The run's seed mixed with the scene id (FNV-1a), so every scene has its own stream. */
export function sceneSeed(seed: number, sceneId: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < sceneId.length; i++) h = Math.imul(h ^ sceneId.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export const stepId = (step: Step, index: number): string => step.id ?? `#${index + 1}`;

/** "goto npc_chai_anna", "choose One chai", "expect act0_arrived" — the pill and the report use it. */
export function summarise(step: Step): string {
  switch (step.do) {
    case 'wait_for': return `wait_for ${step.ready}${step.scene ? ` ${step.scene}` : step.flag ? ` ${step.flag}` : step.objective ? ` ${step.objective}` : ''}`;
    case 'goto': return `goto ${step.target}`;
    case 'interact': return `interact${step.target ? ` ${step.target}` : ''}`;
    case 'choose': return `choose ${String(step.option)}`;
    case 'advance': return 'advance';
    case 'wait': return `wait ${step.ms}ms`;
    case 'phone': return `phone ${step.action}${step.app ? ` ${step.app}` : step.target ? ` ${step.target}` : step.n ? ` ${step.n}` : ''}`;
    case 'sleep': return 'sleep';
    case 'rhythm': return 'rhythm';
    case 'pay': return `pay${step.max !== undefined ? ` ≤₹${step.max}` : ''}`;
    case 'expect': return `expect ${[step.flag, step.not_flag && `!${step.not_flag}`, step.wallet_lte !== undefined && `wallet≤${step.wallet_lte}`, step.wallet_gte !== undefined && `wallet≥${step.wallet_gte}`, step.district, step.scene, step.near && `near ${step.near}`].filter(Boolean).join(' ')}`;
    case 'set_flag': return `set_flag ${step.flag}`;
    case 'unresolved': return `unresolved: ${step.reason}`;
    default: return (step as { do: string }).do;
  }
}
