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
    // The pause menu opens by itself when the tab hides mid-step: close it and carry on, rather than time out under it.
    if (d.state().overlay === 'menu') { ctx.log('the pause menu opened on its own — closing it'); await d.key('Escape', 'Escape', 27); continue; }
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
      case 'advance': { const opened = await until(d, ctx, () => d.state().dialogueOpen, Math.min(deadline, d.now() + 1500)); if (opened !== 'ok') return outcome(opened, 'dialogue_not_open') ?? ok(); return drain(d, ctx, deadline); }
      case 'wait': { const r = await until(d, ctx, () => false, Math.min(deadline, d.now() + step.ms)); return r === 'cancelled' ? { status: 'skipped', reason: 'cancelled' } : ok(); }
      case 'phone': return phone(d, step, ctx, deadline);
      case 'sleep': return sleep(d, ctx, deadline);
      case 'rhythm': return rhythm(d, ctx, deadline);
      case 'travel': return travel(d, step, ctx, deadline);
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
      // Loaded = the world is up in the right district and the player is free — or already in a conversation the
      // arrival zone opened (Amma's call at the flat door); the next steps advance it.
      const r = await until(d, ctx, () => { const s = d.state(); return s.activeScene === 'WorldScene' && (!step.scene || s.district === step.scene) && (s.free || s.dialogueOpen); }, deadline);
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
const MAX_REPLANS = 5;
const STUCK_MS = 1200;
async function goto(d: MovieDriver, target: Target, ctx: ActionContext, timeout?: number): Promise<ActionResult> {
  // Already there with the target's own conversation open (Amma's call at the flat door): nothing to walk.
  if (d.state().dialogueOpen) { const here = d.route(target); if (here.ok && here.px === 0) return ok(); }
  const free = await until(d, ctx, () => d.state().free, d.now() + 2000);
  if (free !== 'ok') return outcome(free, 'not_free') ?? ok();
  // The crowd wanders through the planning grid: a route sealed by three citizens around the spawn opens a moment
  // later. Give an unreachable or boxed-in plan a few seconds before calling it.
  let route = d.route(target);
  for (let tries = 0; !route.ok && /unreachable_target|player_boxed_in/.test(route.reason) && tries < 8; tries++) {
    if (ctx.cancelled()) return { status: 'skipped', reason: 'cancelled' };
    if (tries === 0) ctx.log(`no route yet (${route.reason}) — waiting for the crowd to move`);
    for (let i = 0; i < 30; i++) await d.frames(1);
    route = d.route(target);
  }
  if (!route.ok) return fail(route.reason);
  let deadline = d.now() + (timeout ?? (route.px / 100) * 1000 + 5000);
  const tolerance = 3 + 2 * ctx.speed;
  const startDistrict = d.state().district;
  let k = 0, replans = 0, frame = 0;
  let lastProgressAt = d.now(), bestDist = Infinity, bestK = -1;
  try {
    for (;;) {
      if (ctx.cancelled()) return { status: 'skipped', reason: 'cancelled' };
      if (d.now() > deadline) return fail('timeout:goto');
      const s = d.state();
      // An exit took us: the zone fired, the transit started, the district changed — arrival when that was the
      // target, an accident otherwise (a sidestep into the auto stand).
      if (s.activeScene !== 'WorldScene' || s.district !== startDistrict) { d.walk(0, 0); return target.startsWith('exit:') || target.startsWith('zone:') ? ok() : fail(`carried_off: an exit fired on the way to ${describeTarget(target)}`); }
      // A zone that opens the rhythm lane (the flat's guitar) takes the world over: that is arrival.
      if (d.rhythm?.()) { d.walk(0, 0); return ok(); }
      if (s.dialogueOpen) {
        // Arrived into the target's own conversation (a zone trigger with a dialogue): the walk is done; the next
        // step chooses or advances it. A conversation far from the target is stepped through if it has no choices.
        const left = d.route(target);
        if (left.ok && left.px <= 48) { d.walk(0, 0); return ok(); }
        const dlg = d.dialogue();
        if (dlg?.choices.length) return fail(`interrupted:dialogue_with_choices (${dlg.text.slice(0, 40)})`);
        ctx.log('a conversation opened on the way — advancing it');
        await press(d, 'E');
        continue;
      }
      if (!s.free) {
        // The zone did its thing (a workday card, a night's sleep, a phone call) while we stand in it: that is arrival.
        const here = d.feet();
        if (route.zone && here && here[0] + 10 > route.zone.x && here[0] - 10 < route.zone.x + route.zone.w && here[1] + 6 > route.zone.y && here[1] - 6 < route.zone.y + route.zone.h) { d.walk(0, 0); return ok(); }
        const t = d.now(); await d.frames(1); deadline += d.now() - t; // a paused world does not eat the walk's time
        continue;
      }
      const feet = d.feet();
      if (!feet) return fail('no_player');
      if (k >= route.corners.length) {
        // Zones often hug a wall or sit over the thing they belong to (a bed): press toward the centre until the
        // feet box overlaps by a few px on both axes, or the way is blocked — that is how a thumb reaches a bed.
        if (route.zone) {
          // Deep enough = the feet box's centre inside the zone (signal rooms and photo spots read the body centre),
          // or, for a zone drawn over something solid, as far in as the body goes.
          const z = route.zone;
          const claimed = (f: [number, number]) => (z.avoid ?? []).some((o) => f[0] >= o.x && f[0] <= o.x + o.w && f[1] >= o.y && f[1] <= o.y + o.h);
          const deep = (f: [number, number]) => f[0] >= z.x + 1 && f[0] <= z.x + z.w - 1 && f[1] >= z.y + 1 && f[1] <= z.y + z.h - 1 && !claimed(f);
          let last = feet, still = 0;
          for (let i = 0; i < 90 && !deep(d.feet() ?? feet) && !ctx.cancelled(); i++) {
            const f = d.feet(); if (!f) break;
            // Toward the nearest interior point: only the axis that is still outside moves (the zone's centre may be the thing photographed).
            let tx = Math.min(Math.max(f[0], z.x + 2), z.x + z.w - 2), ty = Math.min(Math.max(f[1], z.y + 2), z.y + z.h - 2);
            // Inside but claimed by a sibling zone: head for the nearest free side of that sibling.
            for (const o of z.avoid ?? []) if (tx >= o.x && tx <= o.x + o.w && ty >= o.y && ty <= o.y + o.h) { const left = tx - o.x, right = o.x + o.w - tx, up = ty - o.y, down = o.y + o.h - ty; const min = Math.min(left, right, up, down); if (min === left) tx = o.x - 2; else if (min === right) tx = o.x + o.w + 2; else if (min === up) ty = o.y - 2; else ty = o.y + o.h + 2; }
            const dx = tx - f[0], dy = ty - f[1];
            if (Math.abs(dx) >= Math.abs(dy)) d.walk(Math.sign(dx), 0); else d.walk(0, Math.sign(dy));
            await d.frames(1);
            const g = d.feet() ?? f;
            if (Math.hypot(g[0] - last[0], g[1] - last[1]) < 0.5) { if (++still > 12) break; } else { still = 0; last = g; }
            const s2 = d.state(); if (s2.activeScene !== 'WorldScene' || s2.district !== startDistrict || s2.dialogueOpen) break;
          }
        }
        d.walk(0, 0); return ok();
      }
      const [cx, cy] = route.corners[k];
      const dx = cx - feet[0], dy = cy - feet[1];
      const dist = Math.hypot(dx, dy);
      if (dist <= tolerance) { k += 1; continue; }
      // Follow the planned line, not just the next corner: the stick drifts a few px per leg, and a corridor beside
      // an exit zone is only as wide as the body. When the perpendicular error grows past 1.5 px, spend a frame
      // correcting it (alternating with advancing); otherwise steer along the leg (diagonals stay diagonals).
      const from = k > 0 ? route.corners[k - 1] : feet;
      const lx = cx - from[0], ly = cy - from[1], ll = Math.hypot(lx, ly) || 1;
      const err = ((feet[0] - from[0]) * ly - (feet[1] - from[1]) * lx) / ll; // signed distance from the leg line
      if (Math.abs(err) > 1.5 && (frame++ % 2 === 0)) d.walk(-Math.sign(err) * (ly / ll), Math.sign(err) * (lx / ll));
      else d.walk(dx / dist, dy / dist);
      if (k !== bestK) { bestK = k; bestDist = dist; lastProgressAt = d.now(); }
      if (dist < bestDist - 2) { bestDist = dist; lastProgressAt = d.now(); }
      else if (d.now() - lastProgressAt > STUCK_MS) {
        if (replans >= MAX_REPLANS) return fail(`stuck near ${Math.round(feet[0])},${Math.round(feet[1])} heading for ${describeTarget(target)}`);
        replans += 1; lastProgressAt = d.now();
        // Usually a citizen standing in the way (the crowd cannot be pushed): step aside for a moment so the
        // replan starts from a free cell and the citizen's wander timer gets a chance, then plan again.
        ctx.log(`no progress — sidestep and replan (${replans}/${MAX_REPLANS})`);
        const perp = Math.abs(dx) >= Math.abs(dy) ? [0, 1] : [1, 0];
        const sides = replans % 2 ? [1, -1] : [-1, 1];
        const side = sides.find((sg) => d.freeAt(feet[0] + perp[0] * sg * 16, feet[1] + perp[1] * sg * 16));
        if (side !== undefined) { for (let i = 0; i < 12 && !ctx.cancelled(); i++) { d.walk(perp[0] * side, perp[1] * side); await d.frames(1); } }
        d.walk(0, 0);
        for (let i = 0; i < 20 && !ctx.cancelled(); i++) await d.frames(1);
        deadline += 2000; // a replan buys time: the clock measured the planned walk, not the crowd
        const s3 = d.state();
        if (s3.activeScene !== 'WorldScene' || s3.district !== startDistrict) return target.startsWith('exit:') || target.startsWith('zone:') ? ok() : fail(`carried_off: an exit fired while sidestepping near ${Math.round(feet[0])},${Math.round(feet[1])}`);
        route = d.route(target);
        if (!route.ok) return fail(route.reason);
        k = 0; bestK = -1; bestDist = Infinity;
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
  // WorldScene re-enables interaction 80 ms after a dialogue or overlay closes and drains presses until then.
  await d.frames(6);
  d.interact();
  let r = await until(d, ctx, () => interacted || d.state().dialogueOpen, Math.min(deadline, d.now() + 900));
  if (r === 'timeout') { ctx.log('no answer to the first press — pressing again'); d.interact(); r = await until(d, ctx, () => interacted || d.state().dialogueOpen, Math.min(deadline, d.now() + 900)); }
  off();
  const res = outcome(r, `no_interaction${target ? `:${target}` : ''}`);
  if (res) return res;
  if (target?.startsWith('npc:') || (target && !target.includes(':'))) {
    const who = d.talkingTo();
    const want = target.replace(/^npc:/, '');
    if (who && who !== want) return fail(`wrong_npc: talked to ${who}, not ${want} (they stand too close together)`);
  }
  return ok();
}

/**
 * Pick a dialogue option by index, by the start of its text, or by the node
 * it leads to; then step through choice-less lines until the box closes or
 * the next choice appears.
 */
async function choose(d: MovieDriver, option: string | number, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  const opened = await until(d, ctx, () => d.state().dialogueOpen, Math.min(deadline, d.now() + 1500));
  if (opened !== 'ok') return outcome(opened, 'dialogue_not_open') ?? ok();
  // Let the line finish (one E skips the typewriter); lines without choices before the decision (a manual's
  // "Step 1", a call's greeting) are stepped through until the choices appear.
  let dlg = d.dialogue();
  for (let guard = 0; guard < 12; guard++) {
    if (ctx.cancelled()) return { status: 'skipped', reason: 'cancelled' };
    const settled = await until(d, ctx, () => { const g = d.dialogue(); return Boolean(g && (!g.typing || g.choices.length > 0)); }, Math.min(deadline, d.now() + 4000));
    if (settled === 'cancelled') return { status: 'skipped', reason: 'cancelled' };
    dlg = d.dialogue();
    if (!dlg || !dlg.open) return fail('dialogue_closed_early');
    if (dlg.choices.length && !dlg.typing) break;
    await press(d, 'E'); await d.frames(2);
  }
  dlg = d.dialogue();
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

/**
 * The rhythm lane (ADR-131), as a careful player plays it: wait for the card,
 * E to start, then E whenever the next note is a frame from the strum line
 * (the key lands on the next step), E on the result card to put the guitar
 * down. A lesson not learned is a failure with the count; a fail still uses
 * the night in the game, so the report says so rather than retrying.
 */
async function rhythm(d: MovieDriver, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  if (!d.rhythm) return fail('driver_has_no_rhythm');
  const opened = await until(d, ctx, () => d.rhythm!()?.phase === 'intro', Math.min(deadline, d.now() + 4000));
  if (opened !== 'ok') return outcome(opened, 'rhythm_not_open') ?? ok();
  await press(d, 'E');
  // The song: up to a minute of game time at the slowest lesson.
  const end = d.now() + 90_000;
  for (;;) {
    if (ctx.cancelled()) return { status: 'skipped', reason: 'cancelled' };
    const v = d.rhythm();
    if (!v) return fail('rhythm_closed_early');
    if (v.phase === 'result') break;
    if (d.now() > end) return fail('rhythm_stuck');
    if (v.phase === 'play' && v.nextNoteInMs !== null && v.nextNoteInMs <= 20) { await press(d, 'E'); continue; }
    await d.frames(1);
  }
  const v = d.rhythm()!;
  await press(d, 'E');
  const closed = await until(d, ctx, () => !d.rhythm!(), Math.min(deadline + 90_000, d.now() + 3000));
  if (closed !== 'ok') return outcome(closed, 'rhythm_did_not_close') ?? ok();
  return v.passed === false ? fail(`rhythm_not_learned:${v.hits}/${v.total}`) : ok();
}

/**
 * Maps METRO (ADR-134), as a player does it: M opens the city map, a tap on
 * the destination's node selects it, F rides. Fails with a reason when the
 * node is not on screen or METRO is not offered (not visited / known, line
 * closed) — never by calling the travel code.
 */
async function travel(d: MovieDriver, step: Extract<Step, { do: 'travel' }>, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  if (!d.map) return fail('driver_has_no_map');
  const free = await until(d, ctx, () => d.state().free, Math.min(deadline, d.now() + 3000));
  if (free !== 'ok') return outcome(free, 'not_free') ?? ok();
  const startDistrict = d.state().district;
  await d.key('KeyM', 'm', 77);
  const opened = await until(d, ctx, () => d.map!()?.phase === 'open', Math.min(deadline, d.now() + 3000));
  if (opened !== 'ok') return outcome(opened, 'map_not_open') ?? ok();
  if (d.map()!.view !== 'city') await d.key('KeyV', 'v', 86);
  const node = d.map()!.nodes.find((n) => n.id === step.to);
  if (!node) return fail(`no_map_node:${step.to}`);
  if (node.x < 4 || node.x > 636 || node.y < 4 || node.y > 356) return fail(`map_node_off_screen:${step.to}`);
  await d.tap(node.x, node.y);
  const picked = await until(d, ctx, () => d.map!()?.selected === step.to, Math.min(deadline, d.now() + 2000));
  if (picked !== 'ok') return outcome(picked, `map_select_failed:${step.to}`) ?? ok();
  if (!d.map()!.buttons.includes('fast')) { await d.key('Escape', 'Escape', 27); return fail(`metro_not_offered:${step.to}`); }
  await d.key('KeyF', 'f', 70);
  const left = await until(d, ctx, () => d.state().district !== startDistrict || d.state().activeScene !== 'WorldScene', Math.min(deadline, d.now() + 5000));
  return outcome(left, 'metro_did_not_leave') ?? ok();
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

const PHONE_KEYS = { Left: ['ArrowLeft', 'ArrowLeft', 37], Right: ['ArrowRight', 'ArrowRight', 39], Back: ['Backspace', 'Backspace', 8] } as const;

/**
 * The phone through its real keys: P opens/closes, arrows move focus, Enter
 * activates, Backspace goes back. `app <id>` returns to the home screen and
 * opens the tile; `tap <id>` focuses a focusable by id and activates it;
 * `scroll n` presses down n times (a scrolling screen scrolls, a list moves focus).
 */
async function phone(d: MovieDriver, step: Extract<Step, { do: 'phone' }>, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  const open = async (): Promise<ActionResult | null> => {
    if (d.phone()) return null;
    const free = await until(d, ctx, () => d.state().free, Math.min(deadline, d.now() + 1500));
    if (free !== 'ok') return outcome(free, 'not_free') ?? null;
    await press(d, 'P');
    return outcome(await until(d, ctx, () => d.phone() !== null, Math.min(deadline, d.now() + 2000)), 'phone_did_not_open');
  };
  /** Tap a focusable by id — a thumb on the phone screen. */
  const tapId = async (id: string): Promise<ActionResult | null> => {
    const ph = d.phone();
    if (!ph) return fail('phone_closed');
    const target = ph.focusables.find((f) => f.id === id);
    if (!target) return fail(`phone_no_focusable:${id} (have: ${ph.focusables.map((f) => f.id).join(' | ')})`);
    await d.tap(ph.origin[0] + target.x + target.w / 2, ph.origin[1] + target.y + target.h / 2);
    return null;
  };
  switch (step.action) {
    case 'open': return (await open()) ?? ok();
    case 'close': {
      if (!d.phone()) return ok();
      await press(d, 'P');
      return outcome(await until(d, ctx, () => d.phone() === null, Math.min(deadline, d.now() + 2000)), 'phone_did_not_close') ?? ok();
    }
    case 'back': { if (!d.phone()) return fail('phone_closed'); const [c, k, kc] = PHONE_KEYS.Back; await d.key(c, k, kc); return ok(); }
    case 'app': {
      const opened = await open(); if (opened) return opened;
      // Back to the home screen (a thread → chats → home; a reel → reels → home).
      for (let guard = 0; guard < 4 && d.phone() && d.phone()!.app !== 'home'; guard++) { const [c, k, kc] = PHONE_KEYS.Back; await d.key(c, k, kc); }
      if (!d.phone()) return fail('phone_closed');
      const t = await tapId(`app:${step.app ?? ''}`); if (t) return t;
      return outcome(await until(d, ctx, () => { const ph = d.phone(); return Boolean(ph && ph.app !== 'home') || (step.app === 'maps' && d.state().overlay === 'map'); }, Math.min(deadline, d.now() + 2000)), `phone_app_did_not_open:${step.app} (locked, or the tile did not take the tap)`) ?? ok();
    }
    case 'tap': {
      const t = await tapId(step.target ?? ''); if (t) return t;
      await d.frames(3);
      return ok();
    }
    case 'scroll': { if (!d.phone()) return fail('phone_closed'); for (let i = 0; i < (step.n ?? 1); i++) await press(d, 'Down'); return ok(); }
    default: return fail(`phone_action_unsupported:${String(step.action)}`);
  }
}

/** Walk to the district's bed (its `action: sleep` trigger zone) and wait for the night. */
async function sleep(d: MovieDriver, ctx: ActionContext, deadline: number): Promise<ActionResult> {
  const district = d.state().district;
  const bed = district ? DISTRICTS[district]?.triggers?.find((t) => t.action === 'sleep') : undefined;
  if (!bed) return fail(`no_bed_here:${district ?? 'nowhere'}`);
  let slept = false;
  const off = d.on('time:slept', () => { slept = true; });
  try {
    // The previous night's fade-in must finish before the next night: a bed fires on entry, and the world is not free yet.
    const awake = await until(d, ctx, () => d.state().free, Math.min(deadline, d.now() + 4000));
    if (awake !== 'ok') return outcome(awake, 'not_free') ?? ok();
    const already = d.route(`zone:${bed.zone}`);
    const feet0 = d.feet();
    const touching = (z: { x: number; y: number; w: number; h: number }, f: [number, number]) => f[0] + 10 > z.x && f[0] - 10 < z.x + z.w && f[1] + 6 > z.y && f[1] - 6 < z.y + z.h;
    if (already.ok && already.zone && feet0 && touching(already.zone, feet0)) {
      // Still touching the bed from the last night (the watcher only sees a fresh entry once the body has left the
      // zone entirely): find the nearest spot whose feet box clears it and walk there through the planner — the
      // bed sits in a furnished corner, a blind step would hit the almirah.
      const z = already.zone; const feet = feet0;
      const clear = (x: number, y: number) => !touching(z, [x, y]) && d.freeAt(x, y);
      let spot: [number, number] | null = null;
      for (let r = 20; r <= 60 && !spot; r += 8) for (let a = 0; a < 8 && !spot; a++) { const x = Math.round(feet[0] + r * Math.cos((a * Math.PI) / 4)), y = Math.round(feet[1] + r * Math.sin((a * Math.PI) / 4)); if (clear(x, y)) spot = [x, y]; }
      if (!spot) return fail(`no_room_to_step_off_the_bed near ${Math.round(feet[0])},${Math.round(feet[1])}`);
      const off = await goto(d, `px:${spot[0]},${spot[1]}`, ctx, 6000);
      if (off.status !== 'passed') return off.status === 'failed' ? fail(`step_off_failed: ${off.reason}`) : off;
    }
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
