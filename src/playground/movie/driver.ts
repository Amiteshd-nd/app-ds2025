import Phaser from 'phaser';
import { DIALOGUE } from '../../data';
import { gameEvents, type GameEvents } from '../../core/events';
import type { DevApi } from '../../dev/devApi';
import { pressInteract, setAxis } from '../../input/InputMap';
import { DialogueManager } from '../../systems/DialogueManager';
import { useSettings } from '../../systems/SettingsManager';
import { useGameStore } from '../../store';
import { INTERACT_RANGE_PX, LAYERS, SCENE_KEYS } from '../../utils/constants';
import { MOVIE_OVERLAY_KEY, MovieOverlayScene } from './MovieOverlayScene';
import type { DriverState, MovieDriver, Target } from './types';
import { astar, buildGrid, cellAt, cellCentre, corners, FEET_DY, nearestFree, overlapsZone, zoneOf, type Grid, type Rect } from './walkgrid';

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

  async key(code: string, key: string, keyCode: number): Promise<void> {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key, keyCode, bubbles: true }));
    await this.frames(KEY_HOLD_FRAMES);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key, keyCode, bubbles: true }));
    await this.frames(2);
  }

  feet(): [number, number] | null {
    const w = this.world();
    return w?.player ? [w.player.x, w.player.y + FEET_DY] : null;
  }

  route(target: Target): { ok: true; corners: Array<[number, number]>; px: number } | { ok: false; reason: string } {
    const w = this.world();
    if (!w || !w.map || !w.player) return { ok: false, reason: 'no_world' };
    const grid = this.grid(w);
    const goal = this.resolve(w, grid, target);
    if (!goal) return { ok: false, reason: `unknown_target:${target}` };
    const feet = this.feet()!;
    const start = nearestFree(grid, cellAt(grid, feet[0], feet[1]));
    if (start < 0) return { ok: false, reason: 'player_off_grid' };
    const path = astar(grid, start, goal.test, goal.point);
    if (!path) return { ok: false, reason: `unreachable_target:${target}` };
    // The first waypoint is the start cell itself: the player's own cell can be dilated shut (a citizen
    // standing on them), so the route begins on the nearest free cell — walk there before following
    // the 4-connected corners, otherwise the first leg cuts diagonally through whatever blocked it.
    const pts = [cellCentre(grid, start), ...corners(grid, path)];
    return { ok: true, corners: pts, px: path.length * grid.cell };
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
  private grid(w: World): Grid {
    const rects: Rect[] = [];
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
      if (Array.isArray(other)) { for (const child of other as Array<{ body?: Phaser.Physics.Arcade.Body }>) push(child.body ?? null); continue; }
      push((other as { body?: Phaser.Physics.Arcade.Body }).body ?? null);
    }
    return buildGrid(rects, w.map.widthInPixels, w.map.heightInPixels);
  }

  /** "npc:<id>" | "zone:<name>" | "spawn:<name>" | "exit:<zone>" | "tile:x,y" | bare name (npc, then zone/spawn). */
  private resolve(w: World, grid: Grid, target: Target): { test: (i: number) => boolean; point: [number, number] } | null {
    const [prefix, rest] = target.includes(':') ? [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)] : ['', target];
    const npc = (id: string) => w.npcs.find((n) => n.getData('npcId') === id && n.active);
    const object = (name: string) => w.map.getObjectLayer(LAYERS.spawns)?.objects.find((o) => o.name === name);
    if (prefix === 'npc' || (!prefix && npc(rest))) {
      const n = npc(rest); if (!n) return null;
      // Standing anywhere in talking reach (WorldScene.nearestNpc measures sprite centres), with a margin for a wide feet box.
      const reach = INTERACT_RANGE_PX - 14;
      return { point: [n.x, n.y + FEET_DY], test: (i) => { const [x, y] = cellCentre(grid, i); return Math.hypot(x - n.x, y - FEET_DY - n.y) < reach; } };
    }
    if (prefix === 'tile') {
      const [tx, ty] = rest.split(',').map(Number);
      const point: [number, number] = [tx * 32 + 16, ty * 32 + 16];
      const goal = nearestFree(grid, cellAt(grid, point[0], point[1]));
      return goal < 0 ? null : { point, test: (i) => i === goal };
    }
    const obj = object(rest);
    if (!obj) return null;
    if (obj.width && obj.height) {
      const zone = zoneOf(obj);
      // Aim inside the zone, not at its edge: the stick stops a few px short of a cell centre, and a
      // one-pixel overlap on the grid can be no overlap for the physics body. Thin zones keep a third.
      const m = Math.min(6, zone.w / 3, zone.h / 3);
      const inner = { x: zone.x + m, y: zone.y + m, w: zone.w - 2 * m, h: zone.h - 2 * m };
      return { point: [zone.x + zone.w / 2, zone.y + zone.h / 2], test: (i) => overlapsZone(grid, i, inner) };
    }
    // A point spawn: stand within 12 px of it.
    const point: [number, number] = [obj.x ?? 0, (obj.y ?? 0) + FEET_DY];
    return { point, test: (i) => { const [x, y] = cellCentre(grid, i); return Math.hypot(x - point[0], y - point[1]) < 12; } };
  }
}
