/**
 * Movie Mode walkthrough generator (T-054, ADR-128).
 *
 *   node scripts/generate-walkthroughs.ts            → writes src/data/walkthroughs/<scene>.json for every built scene
 *   node scripts/generate-walkthroughs.ts act0_hotel → one scene
 *
 * Walkthroughs are data derived from data: a scene's quests (objectives in
 * order), its district (NPCs, triggers, exits), the dialogue graphs, the
 * negotiation definitions and the phone's reels, read against the Playground's
 * prerequisite state for that scene (flags of earlier scenes and of the beats
 * named in `entry.after`). Every objective becomes real-input steps — walk,
 * talk, choose, sleep, phone — or an `unresolved` step naming what could not be
 * derived. The generator never emits `set_flag`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrereqState, sceneOrder } from '../src/dev/prereq.ts';
import { HOTEL_NIGHTS, PG_NOTICE_DAYS, STARTING_WALLET } from '../src/utils/constants.ts';
import { planHaggle } from '../src/systems/negotiationMath.ts';
import type { NegotiationDef } from '../src/utils/types.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../src/data');
const readDir = (dir: string): Json[] => readdirSync(join(dataDir, dir)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dataDir, dir, f), 'utf8')));

const scenes: Json[] = readDir('scenes');
const quests = new Map<string, Json>(readDir('quests').map((q) => [q.id, q]));
const districts = new Map<string, Json>((JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8')) as Json[]).map((d) => [d.id, d]));
const npcs = new Map<string, Json>(readDir('npcs').flatMap((f) => (Array.isArray(f) ? f : [])).map((n) => [n.id, n]));
const dialogues = new Map<string, Json>(readDir('dialogue').map((d) => [d.id, d]));
const negotiations = new Map<string, Json>(readDir('negotiations').map((n) => [n.id, n]));
const minigames = new Map<string, Json>(readDir('minigames').map((m) => [m.id, m]));
const reels: Json[] = JSON.parse(readFileSync(join(dataDir, 'phone/reels.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(here, '../src/assets/maps.manifest.json'), 'utf8'));
const mapObjects = (districtId: string): Set<string> => {
  const d = districts.get(districtId); const def = d ? manifest.maps[d.map] : null;
  if (!def) return new Set();
  const path = resolve(here, '../src/assets/tilemaps', def.file);
  if (!existsSync(path)) return new Set();
  const tmj = JSON.parse(readFileSync(path, 'utf8'));
  const layer = (tmj.layers ?? []).find((l: Json) => l.name === def.spawnLayer);
  return new Set(((layer?.objects ?? []) as Json[]).map((o) => o.name));
};

/** Flags a sleep-driven behaviour sets after N nights (hotelNightTimer, pgNoticeTimer). */
const SLEEP_FLAGS: Record<string, number> = { hotel_slept_once: 1, hotel_nights_done: HOTEL_NIGHTS, pg_notice_due: PG_NOTICE_DAYS };

interface Step extends Json { do: string }

class Gen {
  steps: Step[] = [];
  notes: string[] = [];
  known: Set<string>;
  wallet: number;
  district: string;
  /** A conversation left open at a node with choices (the next objective may continue it). */
  open: { dialogue: string; node: string } | null = null;
  /** A rhythm session has been played since the last sleep (one a night, ADR-131). */
  playedTonight = false;
  private counter = 0;
  private optional = false;
  /** The objective's `destination`: where to look first when the flag is set elsewhere. */
  private prefer: string | null = null;
  private beat: string | undefined;

  readonly scene: Json;
  /** Quests the prereq state already marks complete (an earlier scene's) — their on_complete never fires again. */
  completed: Set<string>;

  constructor(scene: Json) {
    this.scene = scene;
    const state = buildPrereqState(scene.id, scenes as never, { stats: { health: 100, wallet: STARTING_WALLET, social: 0, stamina: 3, food: 100, stress: 0, battery: 100 } as never, clock: { day: 1, minute: 370 } });
    this.known = new Set(Object.keys(state.flags).filter((f) => state.flags[f]));
    this.completed = new Set(state.questsCompleted);
    this.wallet = state.stats.wallet;
    this.district = scene.district;
  }

  push(step: Step): void {
    if (step.do === 'sleep') this.playedTonight = false;
    const id = step.id ?? `${step.do}_${++this.counter}`;
    this.steps.push({ id, ...(this.beat ? { beat: this.beat } : {}), ...step, ...(this.optional ? { optional: true } : {}) });
  }
  note(text: string): void { this.notes.push(text); }

  /** The beat an objective belongs to: the first beat whose flag list names the objective's flag. */
  beatFor(flag: string | undefined): string | undefined {
    if (!flag) return undefined;
    for (const b of (this.scene.beats ?? []) as Json[]) if (typeof b === 'object' && typeof b.flag === 'string' && b.flag.split(/[,|]/).map((x: string) => x.trim()).includes(flag)) return b.id;
    return undefined;
  }

  run(): void {
    this.push({ do: 'wait_for', ready: 'scene_loaded', scene: this.district, timeout: 15000 });
    this.push({ do: 'wait', ms: 400 });
    for (const questId of this.scene.quests ?? []) {
      const quest = quests.get(questId);
      if (!quest) { this.note(`quest "${questId}" does not exist`); continue; }
      const objectives: Json[] = quest.objectives ?? [];
      // Objectives before the entry: those listed before the first objective in the scene's own district (their flags, if any, are prerequisite state).
      const firstHere = objectives.findIndex((o) => !o.destination || o.destination === this.scene.district);
      let allRequiredDone = true;
      objectives.forEach((o, i) => {
        this.optional = Boolean(o.optional);
        this.beat = this.beatFor(o.type === 'flag' ? o.target : undefined);
        const preEntry = i < firstHere && o.destination && o.destination !== this.scene.district;
        if (preEntry && !(o.type === 'flag' && this.known.has(o.target))) {
          this.note(`${questId}/${o.id} (${o.type} ${o.target} in ${o.destination}) lies before the scene's entry — skipped`);
          if (!o.optional) allRequiredDone = false;
          return;
        }
        if (o.type === 'dialogue') {
          const later = objectives.slice(i + 1).find((n) => n.type === 'collect' && this.npcsIn(this.district).some((r) => npcs.get(r.id)?.dialogue === o.target && this.dialogueReaches(o.target, (_n, c) => c?.effect?.item_add === n.target).found));
          if (later) { this.note(`${questId}/${o.id}: satisfied by ${questId}/${later.id}'s conversation`); return; }
        }
        const done = this.objective(questId, o);
        if (!done && !o.optional) allRequiredDone = false;
      });
      this.optional = false; this.beat = undefined;
      this.closeConversation();
      if (this.completed.has(questId)) this.note(`${questId} is already complete in this scene's prerequisite state (an earlier scene's quest) — its on_complete flags are not expected`);
      else if (allRequiredDone) for (const flag of quest.on_complete?.set_flags ?? []) this.push({ do: 'expect', flag, timeout: 3000 });
      else this.note(`${questId} cannot complete inside this scene — its on_complete flags are not expected`);
    }
    this.closeConversation();
  }

  objective(questId: string, o: Json): boolean {
    this.prefer = typeof o.destination === 'string' && o.destination ? o.destination : null;
    switch (o.type) {
      case 'flag': return this.flag(o.target, `${questId}/${o.id}`);
      case 'reach': return this.reach(o.target, `${questId}/${o.id}`);
      case 'dialogue': return this.dialogueObjective(o.target, `${questId}/${o.id}`);
      case 'collect': return this.collect(o.target, `${questId}/${o.id}`);
      default: this.push({ do: 'unresolved', reason: `${questId}/${o.id}: objective type "${o.type}" is not generated` }); return false;
    }
  }

  // ── Flags ────────────────────────────────────────────────────────────────
  flag(f: string, who: string, depth = 0): boolean {
    if (this.known.has(f)) { this.push({ do: 'expect', flag: f, timeout: 3000 }); return true; }
    if (depth > 6) { this.push({ do: 'unresolved', reason: `${who}: resolving ${f} loops` }); return false; }
    // 1. a trigger here
    const trig = this.triggerSetting(this.district, f);
    if (trig) {
      if (trig.needs && !this.flag(trig.needs, `${who} (so zone ${trig.trigger.zone}'s conversation opens at the right line)`, depth + 1)) return false;
      return this.viaTrigger(trig.trigger, f, who, depth);
    }
    // 1b. a rhythm lesson on a trigger here (the flat's guitar)
    const lesson = this.rhythmSetting(this.district, f);
    if (lesson) return this.viaRhythm(lesson.trigger, lesson.set, lesson.index, who, depth);
    // 2. a sleep-driven timer
    if (SLEEP_FLAGS[f] !== undefined) return this.viaSleep(f, SLEEP_FLAGS[f], who, depth);
    // 3. the phone: a room's signal check, a reel, the camera set
    const signal = (districts.get(this.district)?.signalZones ?? []).find((z: Json) => z.flag === f);
    if (signal) return this.viaSignalZone(signal, f);
    const reelMatch = /^reels_(.+)_seen$/.exec(f);
    if (reelMatch) return this.viaReel(reelMatch[1], f, who);
    if (f.endsWith('_photos_done') && districts.get(this.district)?.photoSpots?.length) return this.viaPhotos(f);
    // 4. a conversation here (the open one first)
    const talk = this.dialogueSetting(this.district, f, depth, who);
    if (talk === 'done') return true;
    if (talk === 'blocked') return false;
    // 5. somewhere else, through exits
    const elsewhere = this.findDistrictFor(f);
    if (elsewhere) {
      if (!this.travelTo(elsewhere, who)) return false;
      return this.flag(f, who, depth + 1);
    }
    this.push({ do: 'unresolved', reason: `${who}: nothing in ${this.district} (trigger, conversation, sleep, phone) or reachable through its exits sets ${f} — set by code or by a system the generator does not model` });
    return false;
  }

  triggerSetting(districtId: string, f: string): { trigger: Json; needs: string | null } | null {
    const d = districts.get(districtId);
    const live = ((d?.triggers ?? []) as Json[]).filter((t) => !(t.unlessFlag && this.known.has(t.unlessFlag)));
    for (const t of live) if ((t.setFlags ?? []).includes(f)) return { trigger: t, needs: null };
    for (const t of live) if (t.dialogue && this.dialogueReaches(t.dialogue, (node, choice) => this.setsFlag(node, choice, f)).found) return { trigger: t, needs: null };
    // A conversation shared by several zones (Ananya's three stops): the line that sets f opens from an enter
    // branch; take the zone whose own requirement is that branch's flag, so the walk visits the stops in order.
    let fallback: { trigger: Json; needs: string } | null = null;
    for (const t of live) {
      if (!t.dialogue) continue;
      for (const b of dialogues.get(t.dialogue)?.enter ?? []) {
        if (this.known.has(b.flag) || !this.dialogueReaches(t.dialogue, (node, choice) => this.setsFlag(node, choice, f), b.node).found) continue;
        if (t.requiresFlag === b.flag) return { trigger: t, needs: b.flag };
        fallback ??= { trigger: t, needs: b.flag };
      }
    }
    return fallback;
  }

  viaTrigger(t: Json, f: string, who: string, depth: number): boolean {
    if (t.requiresFlag && !this.known.has(t.requiresFlag)) {
      if (!this.flag(t.requiresFlag, `${who} (needs ${t.requiresFlag} for zone ${t.zone})`, depth + 1)) return false;
    }
    if (t.unlessFlag && this.known.has(t.unlessFlag)) { this.push({ do: 'unresolved', reason: `${who}: the only trigger for ${f} (zone ${t.zone}) is spent by ${t.unlessFlag}` }); return false; }
    this.closeConversation();
    if (t.action === 'sleep' && !t.dialogue) { this.push({ do: 'sleep' }); }
    else this.push({ do: 'goto', target: `zone:${t.zone}` });
    for (const g of t.setFlags ?? []) this.known.add(g);
    if (t.dialogue) {
      const path = this.dialogueReaches(t.dialogue, (node, choice) => this.setsFlag(node, choice, f));
      if (!path.found) { this.push({ do: 'unresolved', reason: `${who}: zone ${t.zone} opens ${t.dialogue}, which cannot reach ${f} from its entry` }); return false; }
      this.emitPath(t.dialogue, path);
    }
    this.known.add(f);
    this.push({ do: 'wait_for', ready: 'flag', flag: f, timeout: 6000 });
    return true;
  }

  /** A `rhythm` trigger in a district whose mini-game has a lesson that sets f. */
  rhythmSetting(districtId: string, f: string): { trigger: Json; set: Json; index: number } | null {
    for (const t of (districts.get(districtId)?.triggers ?? []) as Json[]) {
      if (t.action !== 'rhythm') continue;
      const set = minigames.get(t.minigame);
      const index = (set?.lessons ?? []).findIndex((l: Json) => (l.setFlags ?? []).includes(f));
      if (set && index >= 0) return { trigger: t, set, index };
    }
    return null;
  }

  /**
   * A lesson (ADR-131): earlier lessons first, one session a night (sleep in
   * this district's bed between them), step into the trigger's zone, play the
   * lane. After the last lesson the set's follow-up conversation is open.
   */
  viaRhythm(t: Json, set: Json, index: number, who: string, depth: number): boolean {
    const lesson = set.lessons[index];
    for (let i = 0; i < index; i++) {
      for (const g of set.lessons[i].setFlags) if (!this.known.has(g) && !this.flag(g, `${who} (lesson ${i + 1} comes first)`, depth + 1)) return false;
    }
    if (t.requiresFlag && !this.known.has(t.requiresFlag) && !this.flag(t.requiresFlag, `${who} (the ${t.zone} lane needs ${t.requiresFlag})`, depth + 1)) return false;
    this.closeConversation();
    if (this.playedTonight || this.known.has(set.nightFlag)) {
      const bed = ((districts.get(this.district)?.triggers ?? []) as Json[]).find((b) => b.action === 'sleep');
      if (!bed) { this.push({ do: 'unresolved', reason: `${who}: lesson ${index + 1} needs a night's sleep and ${this.district} has no bed` }); return false; }
      this.push({ do: 'sleep' });
      this.known.delete(set.nightFlag);
    }
    this.push({ do: 'goto', target: `zone:${t.zone}` });
    this.push({ do: 'rhythm' });
    for (const g of lesson.setFlags) this.known.add(g);
    this.playedTonight = true;
    this.push({ do: 'wait_for', ready: 'flag', flag: lesson.setFlags[0], timeout: 6000 });
    if (index === set.lessons.length - 1 && set.afterLast && !(set.afterLast.unlessFlag && this.known.has(set.afterLast.unlessFlag))) {
      this.open = { dialogue: set.afterLast.dialogue, node: this.entryNode(dialogues.get(set.afterLast.dialogue)) };
    }
    return true;
  }

  viaSleep(f: string, nights: number, who: string, depth: number): boolean {
    const bedHere = (districts.get(this.district)?.triggers ?? []).some((t: Json) => t.action === 'sleep');
    if (!bedHere) {
      const beds = [...districts.keys()].filter((id) => (districts.get(id)!.triggers ?? []).some((t: Json) => t.action === 'sleep') && this.pathBetween(this.district, id));
      const withBed = this.prefer && beds.includes(this.prefer) ? this.prefer : beds[0];
      if (!withBed || !this.travelTo(withBed, who)) { this.push({ do: 'unresolved', reason: `${who}: ${f} needs ${nights} night${nights > 1 ? 's' : ''} of sleep and no bed is reachable from ${this.district}` }); return false; }
    }
    const bed = (districts.get(this.district)!.triggers as Json[]).find((t) => t.action === 'sleep')!;
    if (bed.requiresFlag && !this.known.has(bed.requiresFlag) && !this.flag(bed.requiresFlag, `${who} (the bed needs it)`, depth + 1)) return false;
    this.closeConversation();
    for (let i = 0; i < nights; i++) this.push({ do: 'sleep' });
    this.known.add(f);
    this.push({ do: 'wait_for', ready: 'flag', flag: f, timeout: 6000 });
    return true;
  }

  firstVisibleReel(): string | null {
    const clip = reels.find((r) => !r.after || this.known.has(r.after));
    return clip ? clip.id : null;
  }

  viaSignalZone(z: Json, f: string): boolean {
    const clip = this.firstVisibleReel();
    if (!clip) { this.push({ do: 'unresolved', reason: `no reel is visible yet to test the signal at ${z.zone}` }); return false; }
    this.closeConversation();
    this.push({ do: 'goto', target: `zone:${z.zone}` });
    this.push({ do: 'phone', action: 'app', app: 'reels' });
    this.push({ do: 'phone', action: 'tap', target: `reel:${clip}` });
    this.push({ do: 'wait_for', ready: 'flag', flag: f, timeout: 8000 });
    this.push({ do: 'phone', action: 'close' });
    this.known.add(f);
    return true;
  }

  viaReel(clipId: string, f: string, who: string): boolean {
    const clip = reels.find((r) => r.id === clipId);
    if (!clip) { this.push({ do: 'unresolved', reason: `${who}: reel ${clipId} does not exist` }); return false; }
    if (clip.after && !this.known.has(clip.after)) { this.push({ do: 'unresolved', reason: `${who}: reel ${clipId} appears only after ${clip.after}` }); return false; }
    this.closeConversation();
    this.push({ do: 'phone', action: 'app', app: 'reels' });
    this.push({ do: 'phone', action: 'tap', target: `reel:${clipId}` });
    this.push({ do: 'wait_for', ready: 'flag', flag: f, timeout: 8000 });
    this.push({ do: 'phone', action: 'close' });
    this.known.add(f);
    return true;
  }

  viaPhotos(f: string): boolean {
    this.closeConversation();
    for (const spot of districts.get(this.district)!.photoSpots as Json[]) {
      this.push({ do: 'goto', target: `zone:${spot.zone}` });
      this.push({ do: 'phone', action: 'app', app: 'camera' });
      this.push({ do: 'phone', action: 'tap', target: 'camera:snap' });
      this.push({ do: 'phone', action: 'close' });
      this.known.add(`photo_${spot.photo}`);
    }
    this.known.add(f);
    this.push({ do: 'wait_for', ready: 'flag', flag: f, timeout: 3000 });
    return true;
  }

  // ── Conversations ────────────────────────────────────────────────────────
  setsFlag(node: Json | null, choice: Json | null, f: string): boolean {
    return Boolean(node?.effect?.flags?.[f] === true || choice?.effect?.flags?.[f] === true);
  }

  /** NPC refs standing in a district right now (requiresFlag / unlessFlag against known). */
  npcsIn(districtId: string): Json[] {
    return ((districts.get(districtId)?.npcs ?? []) as Json[]).filter((r) => (!r.requiresFlag || this.known.has(r.requiresFlag)) && !(r.unlessFlag && this.known.has(r.unlessFlag)));
  }

  entryNode(dialogue: Json): string {
    for (const b of dialogue.enter ?? []) if (this.known.has(b.flag)) return b.node;
    return 'start';
  }

  /**
   * Breadth-first through a dialogue from its entry (or `from`): the shortest
   * sequence of decisions to a node/choice the goal accepts. Choices with a
   * skill requirement or an unaffordable cost are not taken; a negotiation is
   * haggled down with `planHaggle` and agreed when affordable (the `deal` branch), else walked.
   */
  dialogueReaches(dialogueId: string, goal: (node: Json | null, choice: Json | null, nodeId: string) => boolean, from?: string): { found: boolean; decisions: Array<{ node: string; option: string; cost: number; flags: string[] }>; end: string } {
    const dlg = dialogues.get(dialogueId);
    if (!dlg) return { found: false, decisions: [], end: '' };
    const start = from ?? this.entryNode(dlg);
    type State = { node: string; decisions: Array<{ node: string; option: string; cost: number; flags: string[] }>; wallet: number; flags: string[] };
    const seen = new Set<string>([start]);
    const queue: State[] = [{ node: start, decisions: [], wallet: this.wallet, flags: [] }];
    const flagsOf = (e: Json | undefined) => Object.entries(e?.flags ?? {}).filter(([, v]) => v === true).map(([k]) => k);
    while (queue.length) {
      const cur = queue.shift()!;
      const node = dlg.nodes[cur.node];
      if (!node) continue;
      const nodeFlags = flagsOf(node.effect);
      if (goal(node, null, cur.node)) return { found: true, decisions: cur.decisions, end: cur.node };
      const nexts: Array<{ to: string; option: string; cost: number; flags: string[]; pre?: string[] }> = [];
      if (node.negotiate) {
        const neg = negotiations.get(node.negotiate.id);
        const accept = String(neg?.acceptText ?? 'Agree — pay {total}').split('—')[0].split('{')[0].trim();
        const walk = String(neg?.walkText ?? 'Walk away');
        // Haggle like a careful player: the cheapest counters the rules allow (same arithmetic as the game), then agree.
        const flags = Object.fromEntries([...this.known, ...cur.flags].map((f) => [f, true]));
        const plan = neg ? planHaggle(neg as NegotiationDef, { flags, wallet: cur.wallet }) : null;
        if (plan) nexts.push({ to: node.negotiate.deal, option: accept, cost: plan.total, flags: [...(neg?.on_deal?.flags ?? [])], pre: [...plan.counters.map((c) => c.text), ...(plan.walkFirst ? [walk] : [])] });
        nexts.push({ to: node.negotiate.walk, option: walk, cost: 0, flags: [] });
      } else if (node.choices?.length) {
        for (const c of node.choices as Json[]) {
          const cost = c.effect?.wallet < 0 ? -c.effect.wallet : 0;
          if (c.requires || cost > cur.wallet) continue;
          if (goal(null, c, cur.node)) return { found: true, decisions: [...cur.decisions, { node: cur.node, option: c.next, cost, flags: flagsOf(c.effect) }], end: c.next };
          nexts.push({ to: c.next, option: c.next, cost, flags: flagsOf(c.effect) });
        }
      } else if (node.next) nexts.push({ to: node.next, option: '', cost: 0, flags: [] });
      for (const n of nexts) {
        const decision = n.option ? [...(n.pre ?? []).map((o) => ({ node: cur.node, option: o, cost: 0, flags: [] as string[] })), { node: cur.node, option: n.option, cost: n.cost, flags: n.flags }] : [];
        if (n.option && n.flags.length && goal(null, { effect: { flags: Object.fromEntries(n.flags.map((f) => [f, true])) } }, cur.node)) return { found: true, decisions: [...cur.decisions, ...decision], end: n.to };
        if (seen.has(n.to)) continue;
        seen.add(n.to);
        queue.push({ node: n.to, decisions: [...cur.decisions, ...decision], wallet: cur.wallet - n.cost, flags: [...cur.flags, ...nodeFlags, ...n.flags] });
      }
    }
    return { found: false, decisions: [], end: '' };
  }

  /** Emit the decisions of a path; the conversation stays open if it ends on a node with choices. */
  emitPath(dialogueId: string, path: { decisions: Array<{ node: string; option: string; cost: number; flags: string[] }>; end: string }): void {
    const dlg = dialogues.get(dialogueId)!;
    const collect = (nodeId: string) => { for (const [k, v] of Object.entries(dlg.nodes[nodeId]?.effect?.flags ?? {})) if (v === true) this.known.add(k); };
    collect(this.open?.node ?? this.entryNode(dlg));
    const endsOpen = (id: string) => Boolean(dlg.nodes[id]?.choices?.length || dlg.nodes[id]?.negotiate);
    if (!path.decisions.length && !endsOpen(path.end)) this.push({ do: 'advance' });
    for (const d of path.decisions) {
      this.push({ do: 'choose', option: d.option });
      this.wallet -= d.cost;
      for (const f of d.flags) this.known.add(f);
      collect(d.option);
    }
    // Walk the auto-advancing tail: the drain in `choose` follows `next` until a choice or the end.
    let node = path.end;
    for (let guard = 0; guard < 20 && dlg.nodes[node]?.next && !dlg.nodes[node]?.choices?.length && !dlg.nodes[node]?.negotiate; guard++) { node = dlg.nodes[node].next; collect(node); }
    this.open = dlg.nodes[node]?.choices?.length || dlg.nodes[node]?.negotiate ? { dialogue: dialogueId, node } : null;
  }

  closeConversation(): void {
    if (!this.open) return;
    const { dialogue, node } = this.open;
    const dlg = dialogues.get(dialogue)!;
    const path = this.dialogueReaches(dialogue, (n, _c, id) => Boolean(n) && !dlg.nodes[id]?.choices?.length && !dlg.nodes[id]?.negotiate && !dlg.nodes[id]?.next, node);
    this.open = null;
    if (path.found) this.emitPath(dialogue, path); else this.push({ do: 'advance' });
    this.open = null;
  }

  /** Talk to whoever here can set f: 'done', 'blocked' (a step was emitted but it cannot work), or 'none'. */
  dialogueSetting(districtId: string, f: string, depth: number, who: string): 'done' | 'blocked' | 'none' {
    // The open conversation first.
    if (this.open) {
      const path = this.dialogueReaches(this.open.dialogue, (n, c) => this.setsFlag(n, c, f), this.open.node);
      if (path.found) { this.emitPath(this.open.dialogue, path); this.known.add(f); return 'done'; }
    }
    for (const ref of this.npcsIn(districtId)) {
      const npc = npcs.get(ref.id); const dialogueId = npc?.dialogue;
      if (!dialogueId) continue;
      const dlg = dialogues.get(dialogueId); if (!dlg) continue;
      const path = this.dialogueReaches(dialogueId, (n, c) => this.setsFlag(n, c, f));
      if (path.found) { this.talk(ref.id, dialogueId, path); this.known.add(f); return 'done'; }
      // Reachable only through an enter branch whose flag is not set yet: earn that flag first.
      for (const b of dlg.enter ?? []) {
        if (this.known.has(b.flag)) continue;
        const fromBranch = this.dialogueReaches(dialogueId, (n, c) => this.setsFlag(n, c, f), b.node);
        if (!fromBranch.found) continue;
        if (!this.flag(b.flag, `${who} (so ${ref.id} opens at "${b.node}")`, depth + 1)) return 'blocked';
        const again = this.dialogueReaches(dialogueId, (n, c) => this.setsFlag(n, c, f));
        if (again.found) { this.talk(ref.id, dialogueId, again); this.known.add(f); return 'done'; }
      }
    }
    return 'none';
  }

  talk(npcId: string, dialogueId: string, path: { decisions: Array<{ node: string; option: string; cost: number; flags: string[] }>; end: string }): void {
    this.closeConversation();
    this.push({ do: 'goto', target: `npc:${npcId}` });
    this.push({ do: 'interact', target: `npc:${npcId}` });
    this.emitPath(dialogueId, path);
  }

  dialogueObjective(dialogueId: string, who: string): boolean {
    const ref = this.npcsIn(this.district).find((r) => npcs.get(r.id)?.dialogue === dialogueId);
    if (!ref) { this.push({ do: 'unresolved', reason: `${who}: nobody in ${this.district} speaks ${dialogueId}` }); return false; }
    const dlg = dialogues.get(dialogueId)!;
    const terminal = (n: Json | null, _c: Json | null, id: string) => Boolean(n) && !dlg.nodes[id]?.choices?.length && !dlg.nodes[id]?.negotiate && !dlg.nodes[id]?.next;
    const path = this.dialogueReaches(dialogueId, terminal);
    if (!path.found) { this.push({ do: 'unresolved', reason: `${who}: ${dialogueId} has no affordable way to its end` }); return false; }
    this.talk(ref.id, dialogueId, path);
    return true;
  }

  collect(itemId: string, who: string): boolean {
    for (const ref of this.npcsIn(this.district)) {
      const dialogueId = npcs.get(ref.id)?.dialogue; if (!dialogueId) continue;
      const path = this.dialogueReaches(dialogueId, (_n, c) => c?.effect?.item_add === itemId);
      if (path.found) { this.talk(ref.id, dialogueId, path); return true; }
    }
    this.push({ do: 'unresolved', reason: `${who}: nobody in ${this.district} sells ${itemId}` });
    return false;
  }

  // ── Places ───────────────────────────────────────────────────────────────
  reach(zone: string, who: string): boolean {
    const home = mapObjects(this.district).has(zone) ? this.district : [...districts.keys()].find((id) => mapObjects(id).has(zone) && (districts.get(id)!.triggers ?? []).concat(districts.get(id)!.exits ?? []).some((t: Json) => t.zone === zone));
    if (!home) { this.push({ do: 'unresolved', reason: `${who}: no district has a zone "${zone}"` }); return false; }
    if (home !== this.district && !this.travelTo(home, who)) return false;
    this.closeConversation();
    const exit = (districts.get(this.district)!.exits ?? []).find((e: Json) => e.zone === zone);
    if (exit) return this.takeExit(exit, who);
    this.push({ do: 'goto', target: `zone:${zone}` });
    return true;
  }

  /** The districts whose data can set f. */
  findDistrictFor(f: string): string | null {
    const candidates = [...districts.keys()].filter((id) => id !== this.district && (
      this.triggerSetting(id, f)
      || this.npcsIn(id).some((r) => { const d = npcs.get(r.id)?.dialogue; return d && this.dialogueReaches(d, (n, c) => this.setsFlag(n, c, f)).found; })
      || (districts.get(id)!.signalZones ?? []).some((z: Json) => z.flag === f)
      || this.rhythmSetting(id, f)
      || (SLEEP_FLAGS[f] !== undefined && (districts.get(id)!.triggers ?? []).some((t: Json) => t.action === 'sleep'))
    ));
    const reachable = candidates.filter((id) => this.pathBetween(this.district, id));
    if (this.prefer && reachable.includes(this.prefer)) return this.prefer;
    return reachable[0] ?? null;
  }

  /** Exits from district to district, honouring destination unlocks against known flags. */
  pathBetween(from: string, to: string): Json[] | null {
    const prev = new Map<string, { from: string; exit: Json }>();
    const queue = [from]; const seen = new Set([from]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === to) {
        const hops: Json[] = []; let at = to;
        while (at !== from) { const p = prev.get(at)!; hops.unshift({ from: p.from, exit: p.exit }); at = p.from; }
        return hops;
      }
      for (const exit of districts.get(cur)?.exits ?? []) {
        const dest = districts.get(exit.to); if (!dest || seen.has(exit.to)) continue;
        const unlock = dest.unlock;
        if (unlock?.flags?.some((fl: string) => !this.known.has(fl))) continue;
        seen.add(exit.to); prev.set(exit.to, { from: cur, exit }); queue.push(exit.to);
      }
    }
    return null;
  }

  travelTo(districtId: string, who: string): boolean {
    const hops = this.pathBetween(this.district, districtId);
    if (!hops) { this.push({ do: 'unresolved', reason: `${who}: no way from ${this.district} to ${districtId} through exits` }); return false; }
    this.closeConversation();
    for (const hop of hops) if (!this.takeExit(hop.exit, who)) return false;
    return true;
  }

  takeExit(exit: Json, who: string): boolean {
    const d = districts.get(this.district)!;
    if (exit.requiresFlag) {
      if (d.ride?.flag === exit.requiresFlag) {
        // A ride that ends on its own: the door opens at the destination.
        this.push({ do: 'wait_for', ready: 'scene_loaded', scene: exit.to, timeout: 90000 });
        this.district = exit.to; this.open = null; this.known.add(`visited:${exit.to}`);
        return true;
      }
      if (d.buses?.some((b: Json) => b.flag === exit.requiresFlag)) this.push({ do: 'wait_for', ready: 'flag', flag: exit.requiresFlag, timeout: 120000 });
      else if (!this.known.has(exit.requiresFlag) && !this.flag(exit.requiresFlag, `${who} (the ${exit.transit} needs it)`)) return false;
    }
    this.push({ do: 'goto', target: `exit:${exit.zone}` });
    this.push({ do: 'wait_for', ready: 'scene_loaded', scene: exit.to, timeout: exit.transit === 'walk' ? 20000 : 60000 });
    if (exit.fare) this.wallet -= exit.fare;
    this.district = exit.to; this.open = null; this.known.add(`visited:${exit.to}`);
    for (const t of districts.get(exit.to)?.triggers ?? []) if (!t.requiresFlag || this.known.has(t.requiresFlag)) { /* arrival triggers fire where the spawn sits; the flag steps wait for them */ }
    return true;
  }
}

const outDir = join(dataDir, 'walkthroughs');
mkdirSync(outDir, { recursive: true });
const only = process.argv[2];
const built = sceneOrder(scenes as never).filter((s: Json) => s.status !== 'STUB' && (!only || s.id === only));
for (const scene of built as Json[]) {
  const gen = new Gen(scene);
  gen.run();
  const unresolved = gen.steps.filter((s) => s.do === 'unresolved').length;
  const file = { scene: scene.id, generated: `generated ${new Date().toISOString().slice(0, 10)} by scripts/generate-walkthroughs.ts from ${(scene.quests ?? []).join(', ')} + ${scene.district} + ${scene.entry?.after?.length ? `entry.after ${scene.entry.after.join('/')}` : 'the prereq state'}`, seed: 7, ...(gen.notes.length ? { notes: gen.notes } : {}), steps: gen.steps };
  writeFileSync(join(outDir, `${scene.id}.json`), `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${unresolved ? '⚠' : '✓'} ${scene.id}: ${gen.steps.length} steps${unresolved ? `, ${unresolved} unresolved` : ''}${gen.notes.length ? ` — ${gen.notes.length} note${gen.notes.length > 1 ? 's' : ''}` : ''}`);
}
