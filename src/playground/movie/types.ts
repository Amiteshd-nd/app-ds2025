/**
 * Movie Mode (Test Playground, dev only): walkthroughs as data, a bot that
 * plays the real game through the real input path, a report at the end.
 *
 * One file per scene: src/data/walkthroughs/<scene_id>.json. Game code never
 * contains "walk to the chai Anna" — the bot reads these steps.
 */
export type Ready = 'scene_loaded' | 'free' | 'flag' | 'dialogue' | 'objective';

/** A target for goto/interact: "npc:<id>", "zone:<name>", "spawn:<name>", "exit:<zone>", "tile:<x>,<y>", or a bare name tried in that order. */
export type Target = string;

interface Base {
  /** Optional id for the report; the index is used otherwise. */
  id?: string;
  /** The beat this step belongs to (the corner pill shows it). */
  beat?: string;
  /** Game-time ms before the step fails (default 10 000; goto scales with the path). */
  timeout?: number;
  /** A failure here does not fail the scene (an optional objective). */
  optional?: boolean;
}

export type Step = Base & (
  | { do: 'wait_for'; ready: Ready; id?: string; scene?: string; flag?: string; objective?: string }
  | { do: 'goto'; target: Target }
  | { do: 'interact'; target?: Target }
  | { do: 'choose'; option: string | number }
  | { do: 'wait'; ms: number }
  | { do: 'phone'; action: 'open' | 'close' | 'app' | 'tap'; app?: string; id?: string }
  | { do: 'sleep' }
  | { do: 'pay'; max?: number }
  | { do: 'expect'; flag?: string; not_flag?: string; wallet_lte?: number; wallet_gte?: number; district?: string; scene?: string; near?: Target }
  | { do: 'set_flag'; flag: string; value?: boolean }
  | { do: 'unresolved'; reason: string }
);

export type StepAction = Step['do'];
export const STEP_ACTIONS: readonly StepAction[] = ['wait_for', 'goto', 'interact', 'choose', 'wait', 'phone', 'sleep', 'pay', 'expect', 'set_flag', 'unresolved'];

export interface Walkthrough {
  scene: string;
  /** How the file came to be ("generated 2026-10-16 from beats", "hand-authored"). */
  generated?: string;
  /** RNG seed for this scene's run (the runner's seed otherwise). */
  seed?: number;
  steps: Step[];
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export type StepStatus = 'passed' | 'failed' | 'cheated' | 'unresolved' | 'skipped';

export interface StepResult {
  index: number;
  id: string;
  beat?: string;
  action: StepAction;
  summary: string;
  status: StepStatus;
  reason?: string;
  /** Game-time ms the step took. */
  ms: number;
}

export type SceneStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cheated' | 'missing' | 'skipped';

export interface SceneReport {
  scene: string;
  title: string;
  status: SceneStatus;
  startedAt: number;
  durationMs: number;
  steps: StepResult[];
  failedStep?: StepResult;
  cheats: number;
  /** PNG data URL of the canvas at the failing step. */
  screenshot?: string;
  flagsSet: string[];
  walletEnd: number;
}

export interface RunReport {
  version: 1;
  startedAt: string;
  finishedAt?: string;
  seed: number;
  speed: number;
  scenes: SceneReport[];
  totals: { scenes: number; passed: number; failed: number; cheated: number; missing: number; playMs: number; walletEnd: number; flagsSet: number };
  /** A deterministic trace: "scene:step:status" per step — two runs with the same seed must match. */
  trace: string[];
}

export type RunnerStatus = 'idle' | 'playing' | 'paused' | 'done' | 'stopped';

export interface RunnerState {
  status: RunnerStatus;
  speed: 1 | 2 | 4;
  sceneIndex: number;
  stepIndex: number;
  currentScene: string | null;
  currentBeat: string | null;
  currentStep: string | null;
  /** One entry per built scene, in story order. */
  scenes: Array<{ scene: string; title: string; status: SceneStatus }>;
  report: RunReport | null;
  /** The last few runner messages, newest last. */
  log: string[];
}

/** What the runner needs from the game — the Playground gives it the real one, tests give a fake. */
export interface MovieDriver {
  /** Start a scene at its prerequisite state (the Playground's loadNode). */
  loadScene(sceneId: string, beatId?: string): void;
  /** Resolve after `n` frames of the game stepping (paused frames do not count). */
  frames(n: number): Promise<void>;
  /** Game-time ms since the run began (speed-scaled). */
  now(): number;
  /** Current facts the actions ask about. */
  state(): DriverState;
  /** Input through the real paths. */
  walk(dx: number, dy: number): void;
  interact(): void;
  key(code: string, key: string, keyCode: number): Promise<void>;
  /** Walking: a planned route to a target, or an error reason. */
  route(target: Target): { ok: true; corners: Array<[number, number]>; px: number } | { ok: false; reason: string };
  /** Feet point of the player (for steering / expect near). */
  feet(): [number, number] | null;
  /** The dialogue box's choices right now (enabled flags), the selected index, and whether it is still typing. */
  dialogue(): { open: boolean; typing: boolean; selected: number; choices: Array<{ text: string; enabled: boolean; next?: string; cost: number }>; text: string } | null;
  /** Subscribe to one game event; returns the unsubscribe. */
  on(event: string, cb: (payload: unknown) => void): () => void;
  setFlag(flag: string, value: boolean): void;
  /** A PNG data URL of the canvas (for failure screenshots); null when unavailable. */
  screenshot(): Promise<string | null>;
  /** The runner's overlay: title card + corner pill. */
  overlay: { title(text: string): void; pill(text: string | null): void; clear(): void };
}

export interface DriverState {
  activeScene: string | null;
  district: string | null;
  overlay: 'phone' | 'map' | 'menu' | null;
  /** The player may act: no conversation, no fade, no overlay. */
  free: boolean;
  dialogueOpen: boolean;
  flags: Record<string, boolean>;
  wallet: number;
}
