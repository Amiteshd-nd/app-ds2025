import type { MapScene } from '../../scenes/MapScene';
import type { RhythmScene } from '../../scenes/RhythmScene';
import Phaser from 'phaser';
import { DIALOGUE, DISTRICTS, NPCS } from '../../data';
import { gameEvents, type GameEvents } from '../../core/events';
import type { DevApi } from '../../dev/devApi';
import { pressInteract, setAxis } from '../../input/InputMap';
import { DialogueManager } from '../../systems/DialogueManager';
import { useSettings } from '../../systems/SettingsManager';
import { useGameStore } from '../../store';
import { INTERACT_RANGE_PX, LAYERS, SCENE_KEYS } from '../../utils/constants';
import { PHONE } from '../../ui/phone/layout';
import { MOVIE_OVERLAY_KEY, MovieOverlayScene } from './MovieOverlayScene';
import type { DriverState, MovieDriver, Target } from './types';
import { threat, threatDebug } from '../../systems/threat';
import { astar, buildGrid, cellAt, cellCentre, corners, FEET_DY, nearestFree, overlapsZone, smooth, zoneOf, type Grid, type Rect } from './walkgrid';

/** The bot's planning grid: the validator's feet box on 2 px cells, so any gap the body fits through stays open. */
const BOT_CELL = 2;
const BOT_FEET = Object.freeze({ w: 20, h: 12 });
/** Half the box of room the bot keeps from an infected (px). */
const THREAT_MARGIN = 40;

/** Frames a synthetic key is held (Phaser clears JustDown on keyup; the box reads keydown). */
const KEY_HOLD_FRAMES = 5;

type World = Phaser.Scene & {
  player: Phaser.GameObjects.Sprite & { body: Phaser.Physics.Arcade.Body };
  npcs: Phaser.GameObjects.Sprite[];
  crowd: { citizens: Phaser.GameObjects.Sprite[] };
  map: Phaser.Tilemaps.Tilemap;
  canOpenOverlay(): boolean;
};
type Hud = Phaser.Scene & { dialogueOpen: boolean; dialogue: { isOpen: boolean; selected: number; typing: boolean } };

/** mulberry32 — a tiny seeded PRNG so a run's crowd wanders the same way every time. */
export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * The real game behind the MovieDriver interface (Test Playground, dev only).
 * Input goes through the touch path (setAxis / pressInteract) and real
 * KeyboardEvents on window — the same two paths a human uses. Nothing here
 * teleports or sets state except `setFlag`, which the runner logs as a cheat.
 */
export class PhaserDriver implements MovieDriver {
  private gameMs = 0;
  private paused = false;
  private speed = 1;
  private waiters: Array<{ left: number; resolve: () => void; reject: (e: Error) => void }> = [];
  private overlayScene: MovieOverlayScene | null = null;
  private realRandom: (() => number) | null = null;
  private savedDialogueSpeed: string | null = null;
  private readonly onStep = (_t: number, delta: number) => {
    if (this.paused) return;
    this.gameMs += delta * this.speed;
    if (!this.waiters.length) return;
    const due: typeof this.waiters = [];
    this.waiters = this.waiters.filter((w) => { w.left -= 1; if (w.left <= 0) { due.push(w); return false; } return true; });
    for (const w of due) w.resolve();
  };

  constructor(private readonly game: Phaser.Game, private readonly api: DevApi) {
    game.events.on('step', this.onStep);
  }

  dispose(): void {
    this.game.events.off('step', this.onStep);
    this.abort();
    this.unseed();
  }

  // ── Run control ──────────────────────────────────────────────────────────
  setSpeed(speed: number): void { this.speed = speed; this.api.setSpeed(speed); }
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.api.pause(); else this.api.resume();
  }
  /** Reject every pending frame wait (stop / skip). */
  abort(): void {
    const pending = this.waiters; this.waiters = [];
    for (const w of pending) w.reject(new Error('aborted'));
  }
  /** Seeded crowd + fixed dialogue speed for a deterministic run; `unseed` restores both. */
  seed(seed: number): void {
    Phaser.Math.RND.sow([String(seed)]);
    if (!this.realRandom) this.realRandom = Math.random;
    Math.random = mulberry32(seed);
    const settings = useSettings.getState();
    if (this.savedDialogueSpeed === null) this.savedDialogueSpeed = settings.settings.gameplay.dialogueSpeed as string;
    settings.set('gameplay', 'dialogueSpeed', 'normal');
  }
  unseed(): void {
    if (this.realRandom) { Math.random = this.realRandom; this.realRandom = null; }
    if (this.savedDialogueSpeed !== null) { useSettings.getState().set('gameplay', 'dialogueSpeed', this.savedDialogueSpeed); this.savedDialogueSpeed = null; }
  }

  // ── MovieDriver ──────────────────────────────────────────────────────────
  loadScene(sceneId: string, beatId?: string): void {
    this.api.loadNode({ kind: 'scene', sceneId, beatId });
  }

  frames(n: number): Promise<void> {
    return new Promise((resolve, reject) => this.waiters.push({ left: Math.max(1, n), resolve, reject }));
  }

  now(): number { return this.gameMs; }

  state(): DriverState {
    const s = useGameStore.getState();
    const w = this.world();
    return {
      activeScene: s.activeScene,
      district: s.activeDistrict,
      overlay: s.overlay,
      free: Boolean(w && this.game.scene.isActive(SCENE_KEYS.WORLD) && w.canOpenOverlay()),
      dialogueOpen: Boolean(this.hud()?.dialogueOpen),
      flags: s.flags,
      wallet: s.stats.wallet,
    };
  }

  walk(dx: number, dy: number): void { setAxis(dx, dy); }
  interact(): void { pressInteract(); }

  /** A tap on the canvas at game coordinates — the touch path (Phaser's mouse manager listens on the canvas). */
  async tap(gameX: number, gameY: number): Promise<void> {
    const canvas = this.game.canvas;
    // Phaser caches the canvas bounds; inside the Playground's scaled frame they go stale between layouts.
    (this.game.scale as unknown as { updateBounds?: () => void }).updateBounds?.();
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (gameX / this.game.scale.width) * rect.width;
    const clientY = rect.top + (gameY / this.game.scale.height) * rect.height;
    const init = { clientX, clientY, button: 0, buttons: 1, bubbles: true, cancelable: true };
    canvas.dispatchEvent(new MouseEvent('mousemove', init));
    canvas.dispatchEvent(new MouseEvent('mousedown', init));
    await this.frames(3);
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    await this.frames(2);
  }

  async key(code: string, key: string, keyCode: number): Promise<void> {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key, keyCode, bubbles: true }));
    await this.frames(KEY_HOLD_FRAMES);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key, keyCode, bubbles: true }));
    await this.frames(2);
  }

  /** Clear of walls, exits and action zones (the crowd aside) — where a sidestep may land. */
  freeAt(x: number, y: number): boolean {
    const w = this.world(); if (!w || !w.map) return false;
    const grid = this.grid(w, undefined, true, false);
    const i = cellAt(grid, x, y);
    return i >= 0 && !grid.blocked[i];
  }

  hunted(): boolean { return threat.chasing || threatDebug.modes.some((m) => m === 'search'); }

  feet(): [number, number] | null {
    const w = this.world();
    return w?.player ? [w.player.x, w.player.y + FEET_DY] : null;
  }

  route(target: Target): { ok: true; corners: Array<[number, number]>; px: number; zone?: { x: number; y: number; w: number; h: number; avoid?: Array<{ x: number; y: number; w: number; h: number }> } } | { ok: false; reason: string } {
    const w = this.world();
    if (!w || !w.map || !w.player) return { ok: false, reason: 'no_world' };
    // Plan around exits and action zones first; when that seals the way (the hotel's bed under its room zone,
    // the lane's mouth beside its pavement), plan again without them and take the risk a thumb would.
    const feet = this.feet()!;
    let grid = this.grid(w, target, true);
    let goal = this.resolve(w, grid, target);
    if (!goal) return { ok: false, reason: `unknown_target:${target}` };
    if (goal.here && goal.here(feet)) return { ok: true, corners: [], px: 0, zone: goal.zone };
    const startCell = cellAt(grid, feet[0], feet[1]);
    if (startCell < 0) return { ok: false, reason: `player_off_grid at ${Math.round(feet[0])},${Math.round(feet[1])}` };
    let path: number[] | null = null, start = -1;
    // Goal variants in order (a cell with its centre inside the zone, then any overlap); the exits avoided first,
    // the crowd treated as walls first (three citizens around the spawn can seal a road for a while — then the
    // walk sidesteps whoever is still in the way).
    for (const [avoid, crowd] of [[true, true], [true, false], [false, true], [false, false]] as Array<[boolean, boolean]>) {
      if (!(avoid && crowd)) { grid = this.grid(w, target, avoid, crowd); goal = this.resolve(w, grid, target)!; }
      start = nearestFree(grid, startCell, Math.ceil(24 / grid.cell));
      if (start < 0) continue;
      for (const test of goal.tests) { path = astar(grid, start, test, goal.point); if (path) break; }
      if (path) break;
    }
    if (!path) return { ok: false, reason: start < 0 ? `player_boxed_in at ${Math.round(feet[0])},${Math.round(feet[1])}` : `unreachable_target:${target}` };
    // The first waypoint is the start cell itself: the player's own cell can be dilated shut (a citizen
    // standing on them), so the route begins on the nearest free cell — walk there before following
    // the 4-connected corners, otherwise the first leg cuts diagonally through whatever blocked it.
    const pts = smooth(grid, [cellCentre(grid, start), ...corners(grid, path)]);
    return { ok: true, corners: pts, px: path.length * grid.cell, zone: goal.zone };
  }

  dialogue() {
    const hud = this.hud();
    if (!hud || !hud.dialogue) return null;
    const box = hud.dialogue;
    const dm = DialogueManager.getInstance();
    const view = box.isOpen ? dm.view() : null;
    if (!view) return { open: false, typing: false, selected: 0, choices: [], text: '' };
    const node = DIALOGUE[view.dialogueId]?.nodes?.[view.nodeId];
    const choices = view.choices.map((c, i) => {
      const raw = node?.choices?.[i];
      const wallet = raw?.effect?.wallet ?? 0;
      return { text: c.text, enabled: c.enabled, next: raw?.next, cost: wallet < 0 ? -wallet : 0 };
    });
    return { open: true, typing: Boolean(box.typing), selected: box.selected, choices, text: view.text };
  }

  map() {
    const scene = this.game.scene.getScene(SCENE_KEYS.MAP) as MapScene | null;
    if (!scene || useGameStore.getState().overlay !== 'map') return null;
    return scene.inspect();
  }

  rhythm() {
    const scene = this.game.scene.getScene(SCENE_KEYS.RHYTHM) as RhythmScene | null;
    return scene && this.game.scene.isActive(SCENE_KEYS.RHYTHM) ? scene.view() : null;
  }

  talkingTo(): string | null {
    const hud = this.hud(); if (!hud?.dialogue?.isOpen) return null;
    const view = DialogueManager.getInstance().view(); if (!view) return null;
    const w = this.world();
    const npc = w?.npcs.find((n) => NPCS[n.getData('npcId') as string]?.dialogue === view.dialogueId);
    return npc ? (npc.getData('npcId') as string) : null;
  }

  phone() {
    const scene = this.game.scene.getScene(SCENE_KEYS.PHONE) as (Phaser.Scene & { phase: string; route: { app: string }; focusId: string | null; focusables: Array<{ id: string; x: number; y: number; w: number; h: number }> }) | null;
    if (!scene || !this.game.scene.isActive(SCENE_KEYS.PHONE) || scene.phase !== 'open') return null;
    const root = (scene as unknown as { root?: { x: number; y: number } }).root;
    return { app: scene.route?.app ?? 'home', focusId: scene.focusId ?? null, origin: [PHONE.x + PHONE.screen.x, (root?.y ?? PHONE.y) + PHONE.screen.y] as [number, number], focusables: (scene.focusables ?? []).map((f) => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h })) };
  }

  on(event: string, cb: (payload: unknown) => void): () => void {
    return gameEvents.on(event as keyof GameEvents, cb as never);
  }

  setFlag(flag: string, value: boolean): void { useGameStore.getState().setFlag(flag, value); }

  screenshot(): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: string | null) => { if (!done) { done = true; resolve(v); } };
      try {
        this.game.renderer.snapshot((img) => finish((img as HTMLImageElement).src ?? null));
      } catch { finish(null); }
      window.setTimeout(() => finish(null), 1500);
    });
  }

  get overlay() {
    const scene = this.ensureOverlay();
    return {
      title: (text: string) => { if (scene.scene.isActive()) scene.title(text); },
      pill: (text: string | null) => { if (scene.scene.isActive()) scene.pill(text); },
      clear: () => { if (scene.scene.isActive()) scene.clear(); },
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────
  private world(): World | null {
    const s = this.game.scene.getScene(SCENE_KEYS.WORLD) as World | null;
    return s && this.game.scene.isActive(SCENE_KEYS.WORLD) ? s : null;
  }
  private hud(): Hud | null {
    const s = this.game.scene.getScene(SCENE_KEYS.HUD) as Hud | null;
    return s && this.game.scene.isActive(SCENE_KEYS.HUD) ? s : null;
  }
  private ensureOverlay(): MovieOverlayScene {
    if (this.overlayScene) { this.game.scene.bringToTop(MOVIE_OVERLAY_KEY); return this.overlayScene; }
    const existing = this.game.scene.getScene(MOVIE_OVERLAY_KEY) as MovieOverlayScene | null;
    this.overlayScene = existing ?? (this.game.scene.add(MOVIE_OVERLAY_KEY, MovieOverlayScene, true) as MovieOverlayScene);
    this.game.scene.bringToTop(MOVIE_OVERLAY_KEY);
    return this.overlayScene;
  }

  /**
   * Every rect the player collides with right now, read off the player's own
   * colliders (the collision stencil, placed objects, collision rects and
   * footprints, NPC bodies, the crowd). Trigger and exit zones are physics
   * zones too, but nothing collides with them — so they never block a route.
   */
  private grid(w: World, target?: Target, avoidZones = true, withCrowd = true): Grid {
    const rects: Rect[] = [];
    // Exits and zones that take the world over (a bed, the office door) are walls unless they are the target:
    // a route that brushes the lane's mouth would otherwise leave the district on the way to the shop.
    const districtId = useGameStore.getState().activeDistrict;
    const district = districtId ? DISTRICTS[districtId] : undefined;
    const targetName = target ? target.slice(target.indexOf(':') + 1) : '';
    // Exits are soft (dropped when they seal the only way); a live zone that takes the world over (a bed, the office
    // door's workday, the guitar lane) is hard — never walked through by accident, crowd or no crowd (ADR-135).
    const flags = useGameStore.getState().flags;
    const live = (t: { requiresFlag?: string; unlessFlag?: string }) => (!t.requiresFlag || flags[t.requiresFlag]) && !(t.unlessFlag && flags[t.unlessFlag]);
    // ...unless it overlaps the target (the hotel's guest-room zone lies under its bed zone).
    const rectOf = (name: string) => { const o = w.map.getObjectLayer(LAYERS.spawns)?.objects.find((x) => x.name === name); return o && o.width && o.height ? { x: o.x ?? 0, y: o.y ?? 0, w: o.width, h: o.height } : null; };
    const tr = target?.startsWith('zone:') ? rectOf(targetName) : null;
    const overlapsTarget = (name: string) => { const r = rectOf(name); return Boolean(tr && r && r.x < tr.x + tr.w && tr.x < r.x + r.w && r.y < tr.y + tr.h && tr.y < r.y + r.h); };
    const hard = (district?.triggers ?? []).filter((t) => t.action && live(t)).map((t) => t.zone).filter((z) => z !== targetName && !overlapsTarget(z));
    // A repeating conversation spot (the base's bench and stock shelf) reopens whenever you step on it, and a container asks what to take: walk round them unless they are the target (ADR-150).
    const repeating = (district?.triggers ?? []).filter((t) => t.dialogue && (t.once === false || /^(search|craft|base|trade):/.test(t.dialogue)) && live(t)).map((t) => t.zone);
    const soft = [...(district?.exits ?? []).map((e) => e.zone), ...(district?.triggers ?? []).filter((t) => t.action && !live(t)).map((t) => t.zone), ...repeating].filter((z) => z !== targetName);
    const tabooRects: Rect[] = [];
    for (const name of [...hard, ...(avoidZones ? soft : [])]) {
      const obj = w.map.getObjectLayer(LAYERS.spawns)?.objects.find((o) => o.name === name);
      if (obj && obj.width && obj.height) tabooRects.push([obj.x ?? 0, obj.y ?? 0, obj.width, obj.height]);
    }
    const push = (b: { x: number; y: number; width: number; height: number } | null | undefined) => { if (b && b.width > 0 && b.height > 0) rects.push([b.x, b.y, b.width, b.height]); };
    for (const c of w.physics.world.colliders.getActive()) {
      const other = (c.object1 === w.player ? c.object2 : c.object2 === w.player ? c.object1 : null) as unknown;
      if (!other) continue;
      const layer = other as Phaser.Tilemaps.TilemapLayer;
      if (layer.layer?.data) {
        for (const row of layer.layer.data) for (const t of row) if (t && t.index > 0 && t.collides) push({ x: t.pixelX, y: t.pixelY, width: t.width, height: t.height });
        continue;
      }
      const group = other as Phaser.GameObjects.Group;
      if (typeof group.getChildren === 'function') {
        for (const child of group.getChildren()) push((child as Phaser.GameObjects.GameObject & { body?: Phaser.Physics.Arcade.Body }).body ?? null);
        continue;
      }
      // The crowd is a plain array of sprites (WorldScene collides the player with `crowd.citizens`).
      if (Array.isArray(other)) { if (withCrowd) for (const child of other as Array<{ body?: Phaser.Physics.Arcade.Body }>) push(child.body ?? null); continue; }
      push((other as { body?: Phaser.Physics.Arcade.Body }).body ?? null);
    }
    // 2 px cells: the validator's 8 px grid seals gaps the body squeezes through (between two parked autos,
    // a scooter and a wall, a shop front and its pavement), and the bot would plan the long way or not at all.
    // Act 4 (ADR-145): the infected are walls with a margin — a route never runs through one.
    for (const [ix, iy] of threat.positions) rects.push([ix - THREAT_MARGIN, iy - THREAT_MARGIN, THREAT_MARGIN * 2, THREAT_MARGIN * 2]);
    const grid = buildGrid(rects, w.map.widthInPixels, w.map.heightInPixels, BOT_CELL, BOT_FEET);
    // Zones fire on any overlap and the stick drifts a few px off the planned line, so they get a wider margin
    // than walls; when that seals the only way, route() plans again without them.
    if (tabooRects.length) { const slack = 2 * (3 + 2 * this.speed); const zones = buildGrid(tabooRects, w.map.widthInPixels, w.map.heightInPixels, BOT_CELL, { w: BOT_FEET.w + slack, h: BOT_FEET.h + slack }); for (let i = 0; i < grid.blocked.length; i++) if (zones.blocked[i]) grid.blocked[i] = 1; }
    return grid;
  }

  /** "npc:<id>" | "zone:<name>" | "spawn:<name>" | "exit:<zone>" | "tile:x,y" | "px:x,y" (a feet point) | bare name (npc, then zone/spawn). */
  private resolve(w: World, grid: Grid, target: Target): { tests: Array<(i: number) => boolean>; point: [number, number]; here?: (feet: [number, number]) => boolean; zone?: { x: number; y: number; w: number; h: number; avoid?: Array<{ x: number; y: number; w: number; h: number }> } } | null {
    const [prefix, rest] = target.includes(':') ? [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)] : ['', target];
    const npc = (id: string) => w.npcs.find((n) => n.getData('npcId') === id && n.active);
    const object = (name: string) => w.map.getObjectLayer(LAYERS.spawns)?.objects.find((o) => o.name === name);
    if (prefix === 'npc' || (!prefix && npc(rest))) {
      const n = npc(rest); if (!n) return null;
      // Standing in talking reach (WorldScene.nearestNpc measures sprite centres) and nearer to this NPC than to any other,
      // so E talks to the right one; a small margin for the stick stopping short of a cell centre.
      const reach = INTERACT_RANGE_PX - 6;
      const others = w.npcs.filter((o) => o !== n && o.active);
      const good = (px: number, py: number) => { const dn = Math.hypot(px - n.x, py - n.y); return dn < reach && others.every((o) => Math.hypot(px - o.x, py - o.y) > dn + 4); };
      return { point: [n.x, n.y + FEET_DY], tests: [(i) => { const [x, y] = cellCentre(grid, i); return good(x, y - FEET_DY); }], here: (feet) => good(feet[0], feet[1] - FEET_DY) };
    }
    if (prefix === 'tile' || prefix === 'px') {
      const [a, b] = rest.split(',').map(Number);
      const point: [number, number] = prefix === 'tile' ? [a * 32 + 16, b * 32 + 16] : [a, b];
      const goal = nearestFree(grid, cellAt(grid, point[0], point[1]), Math.ceil(12 / grid.cell));
      return goal < 0 ? null : { point, tests: [(i) => i === goal], here: (feet) => Math.hypot(feet[0] - point[0], feet[1] - point[1]) <= 3 };
    }
    const obj = object(rest);
    if (!obj) return null;
    if (obj.width && obj.height) {
      const zone = zoneOf(obj);
      // Aim inside the zone, not at its edge: the stick stops a few px short of a cell centre, and a
      // one-pixel overlap on the grid can be no overlap for the physics body. Thin zones keep a third.
      const m = Math.min(6, zone.w / 3, zone.h / 3);
      const inner = { x: zone.x + m, y: zone.y + m, w: zone.w - 2 * m, h: zone.h - 2 * m };
      // Prefer standing with the feet centre inside the zone (signal rooms and photo spots read the body centre);
      // a zone drawn over something solid (the bed, an arrival zone around a parked auto) is reachable at its edge only.
      const centreIn = (x: number, y: number) => x >= zone.x + 1 && x <= zone.x + zone.w - 1 && y >= zone.y + 1 && y <= zone.y + zone.h - 1;
      // Photo spots and signal rooms are read "first zone wins": stand where no sibling zone also claims the spot
      // (the dog's zone shares a corner with the bandstand's).
      const districtId = useGameStore.getState().activeDistrict;
      const district = districtId ? DISTRICTS[districtId] : undefined;
      const siblings = [...(district?.photoSpots ?? []).map((p) => p.zone), ...(district?.signalZones ?? []).map((z) => z.zone)].filter((n) => n !== rest && [...(district?.photoSpots ?? []).map((p) => p.zone), ...(district?.signalZones ?? []).map((z) => z.zone)].includes(rest));
      const others = siblings.map((n) => object(n)).filter((o): o is NonNullable<typeof o> => Boolean(o && o.width && o.height)).map((o) => zoneOf(o));
      const exclusive = (x: number, y: number) => centreIn(x, y) && !others.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
      const tests = [(i: number) => { const [x, y] = cellCentre(grid, i); return exclusive(x, y); }, (i: number) => { const [x, y] = cellCentre(grid, i); return centreIn(x, y); }, (i: number) => overlapsZone(grid, i, inner), (i: number) => overlapsZone(grid, i, zone)];
      const inside = (feet: [number, number]) => exclusive(feet[0], feet[1]);
      return { point: [zone.x + zone.w / 2, zone.y + zone.h / 2], tests, here: inside, zone: others.length ? { ...zone, avoid: others } : zone };
    }
    // A point spawn: stand within 12 px of it.
    const point: [number, number] = [obj.x ?? 0, (obj.y ?? 0) + FEET_DY];
    return { point, tests: [(i) => { const [x, y] = cellCentre(grid, i); return Math.hypot(x - point[0], y - point[1]) < 12; }] };
  }
}
