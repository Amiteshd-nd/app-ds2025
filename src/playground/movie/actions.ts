import { DISTRICTS } from '../../data';
import { INTERACT_RANGE_PX } from '../../utils/constants';
import { DEFAULT_TIMEOUT_MS, type MovieDriver, type Step, type StepStatus, type Target } from './types';

export interface ActionContext {
  speed: number;
  /** True once the runner wants this step abandoned (skip / stop). */
  cancelled(): boolean;
  log(message: string): void;
}

export interface ActionResult { status: StepStatus; reason?: string }

const ok = (): ActionResult => ({ status: 'passed' });
const fail = (reason: string): ActionResult => ({ status: 'failed', reason });

const KEYS = {
  E: ['KeyE', 'e', 69], Enter: ['Enter', 'Enter', 13], Up: ['ArrowUp', 'ArrowUp', 38], Down: ['ArrowDown', 'ArrowDown', 40],
  P: ['KeyP', 'p', 80], Escape: ['Escape', 'Escape', 27],
} as const;
type KeyName = keyof typeof KEYS;
const press = (d: MovieDriver, k: KeyName) => { const [code, key, keyCode] = KEYS[k]; return d.key(code, key, keyCode); };

/** Poll a condition once per frame until it holds, the deadline passes, or the step is cancelled. */
async function until(d: MovieDriver, ctx: ActionContext, cond: () => boolean, deadline: number): Promise<'ok' | 'timeout' | 'cancelled'> {
  for (;;) {
    if (ctx.cancelled()) return 'cancelled';
    if (cond()) return 'ok';
    if (d.now() > deadline) return 'timeout';
    await d.frames(1);
  }
}

const outcome = (r: 'ok' | 'timeout' | 'cancelled', reason: string): ActionResult | null =>
  r === 'ok' ? null : r === 'cancelled' ? { status: 'skipped', reason: 'cancelled' } : fail(reason);

const describeTarget = (t: Target) => t;

/** One step of a walkthrough, through the real game. Never throws for a game reason — failures are results. */
export async function runStep(d: MovieDriver, step: Step, ctx: ActionContext): Promise<ActionResult> {
  const deadline = d.now() + (step.timeout ?? DEFAULT_TIMEOUT_MS);
  try {
    switch (step.do) {
      case 'wait_for': return waitFor(d, step, ctx, deadline);
      case 'goto': return goto(d, step.target, ctx, step.timeout);
      case 'interact': return interact(d, step.target, ctx, deadline);
      case 'choose': return choose(d, step.option, ctx, deadline);
      case 'wait': { const r = await until(d, ctx, () => false, Math.min(deadline, d.now() + step.ms)); return r === 'cancelled' ? { status: 'skipped', reason: 'cancelled' } : ok(); }
      case 'phone': return phone(d, step.action, ctx, deadline);
      case 'sleep': return sleep(d, ctx, deadline);
      case 'pay': return pay(d, step.max ?? Infinity, ctx, deadline);
      case 'expect': return expect(d, step, ctx);
      case 'set_flag': d.setFlag(step.flag, step.value ?? true); return { status: 'cheated', reason: `set_flag ${step.flag}=${step.value ?? true}` };
      case 'unresolved': return { status: 'unresolved', reason: step.reason };
      default: return fail(`unknown_action:${(step as { do: string }).do}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'aborted') return { status: 'skipped', reason: 'cancelled' };
    return fail(`exception:${err instanceof Error ? err.message : String(err)}`);
  }
}

async function waitFor(d: MovieDriver, step: Extract<Step, { do: 'wait_for' }>, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  switch (step.ready) {
    case 'scene_loaded': {
      const r = await until(d, ctx, () => { const s = d.state(); return s.activeScene === 'WorldScene' && (!step.scene || s.district === step.scene) && s.free; }, deadline);
      return outcome(r, `timeout:scene_loaded${step.scene ? `:${step.scene}` : ''} (at ${d.state().district ?? 'nowhere'})`) ?? ok();
    }
    case 'free': return outcome(await until(d, ctx, () => d.state().free, deadline), 'timeout:free') ?? ok();
    case 'flag': { const flag = step.flag ?? step.id ?? ''; return outcome(await until(d, ctx, () => Boolean(d.state().flags[flag]), deadline), `timeout:flag:${flag}`) ?? ok(); }
    case 'dialogue': return outcome(await until(d, ctx, () => d.state().dialogueOpen, deadline), 'timeout:dialogue') ?? ok();
    case 'objective': {
      const want = step.objective ?? step.id ?? '';
      let seen = false;
      const off = d.on('quest:objective', (p) => { const { questId, objectiveId } = p as { questId: string; objectiveId: string }; if (objectiveId === want || `${questId}:${objectiveId}` === want) seen = true; });
      const r = await until(d, ctx, () => seen, deadline);
      off();
      return outcome(r, `timeout:objective:${want}`) ?? ok();
    }
    default: return fail(`unknown_ready:${String(step.ready)}`);
  }
}

/**
 * Walk to a target: plan on the walk grid, then hold the virtual stick toward
 * each corner of the route. No progress for 1.2 s → replan (the crowd
 * wanders; a citizen in the way moves on) — three replans, then stuck.
 */
const MAX_REPLANS = 3;
const STUCK_MS = 1200;
async function goto(d: MovieDriver, target: Target, ctx: ActionContext, timeout?: number): Promise<ActionResult> {
  const free = await until(d, ctx, () => d.state().free, d.now() + 2000);
  if (free !== 'ok') return outcome(free, 'not_free') ?? ok();
  let route = d.route(target);
  if (!route.ok) return fail(route.reason);
  const deadline = d.now() + (timeout ?? (route.px / 100) * 1000 + 5000);
  const tolerance = 3 + 2 * ctx.speed;
  const startDistrict = d.state().district;
  let k = 0, replans = 0;
  let lastProgressAt = d.now(), lastFeet = d.feet();
  try {
    for (;;) {
      if (ctx.cancelled()) return { status: 'skipped', reason: 'cancelled' };
      if (d.now() > deadline) return fail('timeout:goto');
      const s = d.state();
      // An exit took us: the zone fired, the transit started, the district changed — that is arrival.
      if (s.activeScene !== 'WorldScene' || s.district !== startDistrict) { d.walk(0, 0); return ok(); }
      if (s.dialogueOpen) {
        // A zone opened a conversation on the way: step through lines with no choices; a choice is the walkthrough's call.
        const dlg = d.dialogue();
        if (dlg?.choices.length) return fail(`interrupted:dialogue_with_choices (${dlg.text.slice(0, 40)})`);
        ctx.log('a conversation opened on the way — advancing it');
        await press(d, 'E');
        continue;
      }
      if (!s.free) { await d.frames(1); continue; }
      const feet = d.feet();
      if (!feet) return fail('no_player');
      if (k >= route.corners.length) { d.walk(0, 0); return ok(); }
      const [cx, cy] = route.corners[k];
      const dx = cx - feet[0], dy = cy - feet[1];
      if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) { k += 1; continue; }
      // Dominant axis first: routes are 4-connected, so corners line up on one axis at a time.
      if (Math.abs(dx) > tolerance) d.walk(Math.sign(dx), 0); else d.walk(0, Math.sign(dy));
      if (lastFeet && Math.hypot(feet[0] - lastFeet[0], feet[1] - lastFeet[1]) >= 4) { lastProgressAt = d.now(); lastFeet = feet; }
      else if (d.now() - lastProgressAt > STUCK_MS) {
        if (replans >= MAX_REPLANS) return fail(`stuck near ${Math.round(feet[0])},${Math.round(feet[1])} heading for ${describeTarget(target)}`);
        replans += 1; lastProgressAt = d.now();
        ctx.log(`no progress — replanning (${replans}/${MAX_REPLANS})`);
        route = d.route(target);
        if (!route.ok) return fail(route.reason);
        k = 0;
      }
      await d.frames(1);
    }
  } finally {
    d.walk(0, 0);
  }
}

async function interact(d: MovieDriver, target: Target | undefined, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  // While a conversation is open, interact = the next line (E).
  if (d.state().dialogueOpen) { await press(d, 'E'); return ok(); }
  const free = await until(d, ctx, () => d.state().free, Math.min(deadline, d.now() + 1500));
  if (free !== 'ok') return outcome(free, 'not_free') ?? ok();
  if (target) {
    const r = d.route(target);
    if (!r.ok && r.reason.startsWith('unknown_target')) return fail(r.reason);
    if (r.ok && r.px > INTERACT_RANGE_PX * 1.5) return fail(`not_in_range:${target} (${Math.round(r.px)}px away — goto first)`);
  }
  let interacted = false;
  const off = d.on('entity:interacted', () => { interacted = true; });
  d.interact();
  const r = await until(d, ctx, () => interacted || d.state().dialogueOpen, Math.min(deadline, d.now() + 1500));
  off();
  return outcome(r, `no_interaction${target ? `:${target}` : ''}`) ?? ok();
}

/**
 * Pick a dialogue option by index, by the start of its text, or by the node
 * it leads to; then step through choice-less lines until the box closes or
 * the next choice appears.
 */
async function choose(d: MovieDriver, option: string | number, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  const opened = await until(d, ctx, () => d.state().dialogueOpen, Math.min(deadline, d.now() + 1500));
  if (opened !== 'ok') return outcome(opened, 'dialogue_not_open') ?? ok();
  // Let the line finish (one E skips the typewriter).
  const settled = await until(d, ctx, () => { const g = d.dialogue(); return Boolean(g && (!g.typing || g.choices.length > 0)); }, Math.min(deadline, d.now() + 4000));
  if (settled !== 'ok') return outcome(settled, 'dialogue_stuck_typing') ?? ok();
  let dlg = d.dialogue();
  if (dlg?.typing) { await press(d, 'E'); await d.frames(2); dlg = d.dialogue(); }
  if (!dlg || !dlg.open) return fail('dialogue_closed_early');
  if (!dlg.choices.length) return fail(`no_choices_here (${dlg.text.slice(0, 40)})`);
  const index = typeof option === 'number'
    ? option
    : dlg.choices.findIndex((c) => c.next === option || c.text.toLowerCase().startsWith(option.toLowerCase()) || c.text.toLowerCase().includes(option.toLowerCase()));
  if (index < 0 || index >= dlg.choices.length) return fail(`choice_not_found:${option} (have: ${dlg.choices.map((c) => c.text).join(' | ')})`);
  if (!dlg.choices[index].enabled) return fail(`choice_locked:${dlg.choices[index].text}`);
  // Move the selection with real arrow presses, then confirm.
  for (let guard = 0; guard < 8; guard++) {
    dlg = d.dialogue();
    if (!dlg?.open) return fail('dialogue_closed_early');
    if (dlg.selected === index) break;
    await press(d, dlg.selected < index ? 'Down' : 'Up');
  }
  if (d.dialogue()?.selected !== index) return fail(`selection_failed:${index}`);
  await press(d, 'Enter');
  return drain(d, ctx, deadline);
}

/** Step through lines with no choices until the box closes or a choice appears. */
async function drain(d: MovieDriver, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  for (;;) {
    if (ctx.cancelled()) return { status: 'skipped', reason: 'cancelled' };
    if (d.now() > deadline) return fail('dialogue_stuck');
    await d.frames(3);
    const dlg = d.dialogue();
    if (!dlg || !dlg.open) return ok();
    if (dlg.choices.length && !dlg.typing) return ok();
    await press(d, 'E');
  }
}

async function phone(d: MovieDriver, action: 'open' | 'close' | 'app' | 'tap', ctx: ActionContext, deadline: number): Promise<ActionResult> {
  if (action === 'open') {
    if (d.state().overlay === 'phone') return ok();
    await press(d, 'P');
    return outcome(await until(d, ctx, () => d.state().overlay === 'phone', Math.min(deadline, d.now() + 2000)), 'phone_did_not_open') ?? ok();
  }
  if (action === 'close') {
    if (d.state().overlay !== 'phone') return ok();
    await press(d, 'P');
    return outcome(await until(d, ctx, () => d.state().overlay === null, Math.min(deadline, d.now() + 2000)), 'phone_did_not_close') ?? ok();
  }
  return fail(`phone_action_unsupported:${action} (step 3)`);
}

/** Walk to the district's bed (its `action: sleep` trigger zone) and wait for the night. */
async function sleep(d: MovieDriver, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  const district = d.state().district;
  const bed = district ? DISTRICTS[district]?.triggers?.find((t) => t.action === 'sleep') : undefined;
  if (!bed) return fail(`no_bed_here:${district ?? 'nowhere'}`);
  let slept = false;
  const off = d.on('time:slept', () => { slept = true; });
  try {
    const walked = await goto(d, `zone:${bed.zone}`, ctx);
    if (walked.status !== 'passed') return walked;
    return outcome(await until(d, ctx, () => slept, Math.max(deadline, d.now() + 6000)), 'did_not_sleep') ?? ok();
  } finally { off(); }
}

/** In an open conversation, take the first affordable choice that costs money. */
async function pay(d: MovieDriver, max: number, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  const opened = await until(d, ctx, () => d.state().dialogueOpen, Math.min(deadline, d.now() + 1500));
  if (opened !== 'ok') return outcome(opened, 'dialogue_not_open') ?? ok();
  await until(d, ctx, () => { const g = d.dialogue(); return Boolean(g && !g.typing); }, Math.min(deadline, d.now() + 4000));
  const dlg = d.dialogue();
  const index = dlg?.choices.findIndex((c) => c.enabled && c.cost > 0 && c.cost <= max) ?? -1;
  if (index < 0) return fail(`nothing_to_pay (have: ${dlg?.choices.map((c) => `${c.text}${c.cost ? ` ₹${c.cost}` : ''}`).join(' | ')})`);
  let spent = false;
  const off = d.on('wallet:spent', () => { spent = true; });
  try {
    const r = await choose(d, index, ctx, deadline);
    if (r.status !== 'passed') return r;
    return outcome(await until(d, ctx, () => spent, Math.min(deadline, d.now() + 1000)), 'no_payment_recorded') ?? ok();
  } finally { off(); }
}

async function expect(d: MovieDriver, step: Extract<Step, { do: 'expect' }>, ctx: ActionContext): Promise<ActionResult> {
  const problems = (): string[] => {
    const s = d.state(), out: string[] = [];
    if (step.flag && !s.flags[step.flag]) out.push(`flag ${step.flag} not set`);
    if (step.not_flag && s.flags[step.not_flag]) out.push(`flag ${step.not_flag} is set`);
    if (step.wallet_lte !== undefined && s.wallet > step.wallet_lte) out.push(`wallet ₹${s.wallet} > ₹${step.wallet_lte}`);
    if (step.wallet_gte !== undefined && s.wallet < step.wallet_gte) out.push(`wallet ₹${s.wallet} < ₹${step.wallet_gte}`);
    if (step.district && s.district !== step.district) out.push(`in ${s.district ?? 'nowhere'}, not ${step.district}`);
    if (step.scene && s.activeScene !== step.scene) out.push(`scene ${s.activeScene ?? 'none'}, not ${step.scene}`);
    if (step.near) { const r = d.route(step.near); if (!r.ok) out.push(r.reason); else if (r.px > 48) out.push(`${Math.round(r.px)}px from ${step.near}`); }
    return out;
  };
  // A short grace: flags set by the event that just fired land a frame or two later.
  const r = await until(d, ctx, () => problems().length === 0, d.now() + 600);
  if (r === 'cancelled') return { status: 'skipped', reason: 'cancelled' };
  const left = problems();
  return left.length ? fail(`expect_failed: ${left.join('; ')}`) : ok();
}
