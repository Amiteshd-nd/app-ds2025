import Phaser from 'phaser';
import { AREAS, CITY_MAP, DISTRICTS } from '../data';
import { MAPS } from '../assets/maps';
import { platform } from '../platform';
import { useGameStore } from '../store';
import { anchorOf, MapManager, type MapNode } from '../systems/MapManager';
import { StatsManager } from '../systems/StatsManager';
import { hex, motion, type TokenName } from '../ui/tokens';
import { hudPlate, labelCard, MIN_TAP, type UiState } from '../ui/kit/molecules';
import { bitmap, bitmapWidth, rect, ring, roundRect, type PixelCtx } from '../ui/kit/pixel';
import { bake, pxText } from '../ui/kit/phaser';
import { measure, truncate } from '../ui/kit/text';
import { nextFocus } from '../ui/kit/focus';
import { ARROWS, PADLOCK, POI_GLYPHS } from '../ui/map/glyphs';
import { paintBase, runOf, stroke } from '../ui/map/paint';
import { orthogonal, project, walk, type Projection, type Pt } from '../ui/map/projection';
import { areaProjection, paintArea, paintPocket, placeLabels, pocketOutline, pocketToLatLng, type AreaProjection } from '../ui/map/area';
import { cardFor, clampPan, LEGEND, nodeAt, panFor, toScreen, zoomAbout, type Zoom } from '../ui/map/view';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import type { AreaData, LatLng, PocketPlacement } from '../utils/types';
import type { WorldScene } from './WorldScene';

const SCREEN = { w: GAME_WIDTH, h: GAME_HEIGHT } as const;
/** Nothing tappable in the bottom 19px (home indicator), same as the phone. */
const BOTTOM = GAME_HEIGHT - 20;
const PILL_H = 19;
const REVEAL_STEPS = 4;
const REVEAL_MS = 600;
const BLINK_MS = 500;
const PAN_STEP = 16;
const DRAG_SLOP = 6;

interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  run: () => void;
}

/**
 * MapScene — the fullscreen map (P6b, ADR-113/115). Opened with M, from the
 * phone's Maps app, or (P6d) Pause → Map. There is no minimap.
 *
 * Black ground, glyph-field regions, white paths on an 8px grid (dotted until
 * travelled; the first look after a journey fills them in, 600 ms stepped),
 * metro lines with their colour, nodes (hollow known · filled visited ·
 * padlock locked), the player's blinking heading arrow, the objective's ★ and
 * pinned label card, and the route as a dashed line. Integer zoom only (1×,
 * 2×). Opening pauses the world and fades in over 400 ms in steps.
 *
 * Keys: arrows pick a node · WASD pan · Enter set/clear destination · F fast
 * travel · Z zoom · C centre on me · L legend · M / Esc close.
 * Touch: tap a node, drag to pan, pinch or the 1×/2× pill to zoom.
 */
export class MapScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.MAP;

  private phase: 'closed' | 'opening' | 'open' = 'closed';
  private proj!: Projection;
  /** 'area' = the close-up real neighbourhood (ADR-117); 'city' = the symbolic city. */
  private view: 'city' | 'area' = 'city';
  private saved: Record<'city' | 'area', { zoom: Zoom; pan: Pt }> = { city: { zoom: 1, pan: [0, 0] }, area: { zoom: 2, pan: [0, 0] } };
  private area: { data: AreaData; proj: AreaProjection; pocket?: PocketPlacement; district: string; label: string } | null = null;
  private player: { at: LatLng; facing: 'n' | 'e' | 's' | 'w' } | null = null;
  private areaImage: Phaser.GameObjects.Image | null = null;
  private zoom: Zoom = 1;
  private pan: Pt = [0, 0];
  private selected: string | null = null;
  private legend = false;
  private focusButton: string | null = null;
  private hint: string | null = null;
  private reveal: { ids: string[]; step: number } | null = null;
  private drag: { start: Pt; pan: Pt; moved: boolean } | null = null;
  private pinch: number | null = null;
  private pressedButton: string | null = null;
  private buttons: Button[] = [];

  private bg!: Phaser.GameObjects.Rectangle;
  private mapLayer!: Phaser.GameObjects.Container;
  private base!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Image;
  private arrow!: Phaser.GameObjects.Image;
  private ui!: Phaser.GameObjects.Container;
  private root!: Phaser.GameObjects.Container;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super(MapScene.KEY);
  }

  create(): void {
    this.phase = 'closed';
    this.cameras.main.setRoundPixels(true);
    this.proj = project(CITY_MAP);
    this.bg = this.add.rectangle(0, 0, SCREEN.w, SCREEN.h, Phaser.Display.Color.HexStringToColor(hex('map.bg')).color).setOrigin(0);
    this.mapLayer = this.add.container(0, 0);
    this.ui = this.add.container(0, 0);
    this.root = this.add.container(0, 0, [this.bg, this.mapLayer, this.ui]).setVisible(false);

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.addPointer(1); // pinch
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (this.phase === 'open') this.setZoom(dy < 0 ? 2 : 1, [SCREEN.w / 2, SCREEN.h / 2]); });
    const offBack = platform.lifecycle.onBackButton(() => { if (this.phase === 'open') this.close(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offBack();
      this.input.keyboard?.off('keydown', this.onKey, this);
      if (this.phase !== 'closed') this.finishClose();
    });
  }

  // ── Open / close ─────────────────────────────────────────────────────────

  private world(): WorldScene | null {
    return this.scene.isActive(SCENE_KEYS.WORLD) || this.scene.isPaused(SCENE_KEYS.WORLD) ? (this.scene.get(SCENE_KEYS.WORLD) as WorldScene) : null;
  }

  /** `fromOverlay`: another overlay (the phone) already paused the world and handed over. */
  open(fromOverlay = false): void {
    const world = this.world();
    if (this.phase !== 'closed' || !world) return;
    if (!fromOverlay && !world.canOpenOverlay()) return;
    this.phase = 'opening';
    if (!this.scene.isPaused(SCENE_KEYS.WORLD)) this.scene.pause(SCENE_KEYS.WORLD);
    useGameStore.getState().setOverlay('map');
    const mm = MapManager.getInstance();
    mm.noteRouteShown();
    this.selected = null;
    this.legend = false;
    this.hint = null;
    this.zoom = 1;
    this.view = 'city';
    this.centreOn(mm.here());
    this.saved.city = { zoom: this.zoom, pan: this.pan };
    this.loadArea(world);
    // Inside a pocket with real streets, open close up: that is where the player can relate.
    if (this.area) this.switchView('area');
    const reveal = CITY_MAP.paths.map((p) => p.id).filter((id) => mm.pathState(id) === 'reveal');
    this.reveal = reveal.length ? { ids: reveal, step: 0 } : null;
    this.bakeBase();
    this.render();
    this.root.setVisible(true);

    // Fade in, 400 ms in 4 steps (motion token m.fade); reduced motion = at once.
    const reduced = platform.display.prefersReducedMotion();
    const steps = reduced ? 1 : 4, stepMs = motion('m.fade') / steps;
    this.root.setAlpha(reduced ? 1 : 1 / steps);
    for (let i = 2; i <= steps; i++) this.later(stepMs * (i - 1), () => this.root.setAlpha(i / steps));
    this.later(reduced ? 0 : motion('m.fade'), () => {
      this.phase = 'open';
      this.startReveal(reduced);
    });
    // The player's arrow blinks every 500 ms.
    if (!reduced) this.timers.push(this.time.addEvent({ delay: BLINK_MS, loop: true, callback: () => this.arrow?.setVisible(!this.arrow.visible) }));
  }

  close(): void {
    if (this.phase !== 'open') return;
    this.finishClose();
  }

  private finishClose(): void {
    this.phase = 'closed';
    this.timers.forEach((t) => t.remove());
    this.timers = [];
    this.root.setVisible(false);
    useGameStore.getState().setOverlay(null);
    const world = this.world();
    if (world && this.scene.isPaused(SCENE_KEYS.WORLD)) world.overlayClosed();
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(this.time.delayedCall(ms, fn));
  }

  /** Dotted → solid on the first look after travelling: 600 ms, 4 steps, then remembered. */
  private startReveal(reduced: boolean): void {
    if (!this.reveal) return;
    const ids = this.reveal.ids;
    const finish = () => { MapManager.getInstance().markRevealed(ids); this.reveal = null; this.bakeBase(); this.render(); };
    if (reduced) { finish(); return; }
    for (let s = 1; s <= REVEAL_STEPS; s++) {
      this.later((REVEAL_MS / REVEAL_STEPS) * s, () => {
        if (s === REVEAL_STEPS) finish();
        else if (this.reveal) { this.reveal.step = s; this.render(); }
      });
    }
  }

  // ── View ─────────────────────────────────────────────────────────────────

  private nodePt(node: MapNode): Pt {
    return this.proj.at(node.at);
  }

  private centreOn(nodeId: string | null): void {
    const node = MapManager.getInstance().nodes().find((n) => n.id === nodeId);
    const m: Pt = node ? this.nodePt(node) : [this.proj.w / 2, this.proj.h / 2];
    this.pan = clampPan(panFor(m, [SCREEN.w / 2, SCREEN.h / 2], this.zoom), this.zoom, this.proj, SCREEN);
  }

  private dims(): { w: number; h: number } {
    return this.view === 'area' && this.area ? this.area.proj : this.proj;
  }

  /** Area view: centre on the player's real position (or the pocket). */
  private centreOnPlayer(): void {
    if (this.view !== 'area' || !this.area) { this.centreOn(MapManager.getInstance().here()); return; }
    const at = this.player?.at ?? (this.area.pocket ? pocketToLatLng(this.area.pocket, [this.area.pocket.tiles[0] / 2, this.area.pocket.tiles[1] / 2]) : this.area.data.centre);
    this.pan = clampPan(panFor(this.area.proj.at(at), [SCREEN.w / 2, SCREEN.h / 2], this.zoom), this.zoom, this.area.proj, SCREEN);
  }

  private switchView(v: 'city' | 'area'): void {
    if (v === 'area' && !this.area) return;
    this.saved[this.view] = { zoom: this.zoom, pan: this.pan };
    this.view = v;
    this.selected = null;
    this.hint = null;
    if (v === 'area') { this.zoom = this.saved.area.zoom; this.centreOnPlayer(); }
    else { this.zoom = this.saved.city.zoom; this.pan = this.saved.city.pan; }
    this.render();
  }

  /**
   * The real neighbourhood of where the player stands (ADR-117), and their
   * real position: their tile mapped through the pocket placement, or — in an
   * interior — the door they went in by.
   */
  private loadArea(world: WorldScene): void {
    this.area = null;
    this.player = null;
    const pos = world.playerPosition();
    const anchor = anchorOf(pos.districtId);
    const data = anchor ? AREAS[anchor.id] : undefined;
    if (!anchor || !data) return;
    const rw = anchor.realworld as { label?: string; area?: { pocket?: PocketPlacement } };
    const pocket = rw.area?.pocket;
    this.area = { data, proj: areaProjection(data), pocket, district: anchor.id, label: rw.label ?? anchor.name };
    if (!pocket) return;
    let tile: [number, number] | null = pos.districtId === anchor.id ? pos.tile : this.doorTile(anchor.id, pos.districtId);
    if (!tile) tile = [pocket.tiles[0] / 2, pocket.tiles[1] / 2];
    // Facing → compass: the map's +x runs along the pocket bearing.
    const turn = { right: 0, down: 90, left: 180, up: 270 }[pos.facing];
    const deg = (((pocket.bearing + turn) % 360) + 360) % 360;
    const facing = (['n', 'e', 's', 'w'] as const)[Math.round(deg / 90) % 4];
    this.player = { at: pocketToLatLng(pocket, tile), facing };
  }

  /** Tile of the exit zone in `outdoorId` that leads into `interiorId`. */
  private doorTile(outdoorId: string, interiorId: string): [number, number] | null {
    const exit = DISTRICTS[outdoorId]?.exits?.find((e) => e.to === interiorId);
    const def = MAPS[DISTRICTS[outdoorId]?.map ?? ''];
    const json = def ? (this.cache.tilemap.get(def.key)?.data as { layers?: Array<{ objects?: Array<{ name: string; x: number; y: number; width?: number; height?: number }> }> } | undefined) : undefined;
    const zone = exit && json?.layers?.flatMap((l) => l.objects ?? []).find((o) => o.name === exit.zone);
    return zone ? [(zone.x + (zone.width ?? 0) / 2) / 32, (zone.y + (zone.height ?? 0)) / 32] : null;
  }

  private setZoom(z: Zoom, focus: Pt): void {
    if (z === this.zoom) return;
    this.pan = clampPan(zoomAbout(this.pan, this.zoom, z, focus), z, this.dims(), SCREEN);
    this.zoom = z;
    this.render();
  }

  private panBy(dx: number, dy: number): void {
    this.pan = clampPan([this.pan[0] + dx, this.pan[1] + dy], this.zoom, this.dims(), SCREEN);
    this.render();
  }

  private bakeBase(): void {
    const mm = MapManager.getInstance();
    const key = bake(this, 'map:base', this.proj.w, this.proj.h, (g) => paintBase(g, CITY_MAP, this.proj, {
      path: (id) => mm.pathState(id),
      line: (id) => mm.lineState(id),
    }), true);
    if (!this.base) { this.base = this.add.image(0, 0, key).setOrigin(0); this.mapLayer.add(this.base); }
    else this.base.setTexture(key);
  }

  /** Everything above the base: route, reveals, nodes, icons (map space) + cards, buttons (screen space). */
  private render(): void {
    if (this.view === 'area' && this.area) { this.renderArea(); return; }
    this.areaImage?.setVisible(false);
    this.base?.setVisible(true);
    this.overlay?.setVisible(true);
    const mm = MapManager.getInstance();
    const nodes = mm.nodes();
    const here = mm.here();
    const dest = mm.destination();
    const route = mm.currentRoute();
    const pois = mm.pois();

    const key = bake(this, 'map:overlay', this.proj.w, this.proj.h, (g) => {
      const white = hex('map.path');
      // The route: dashed, in the objective's yellow — white dashes vanish over a travelled (solid white) path.
      for (const e of route?.edges ?? []) {
        const path = CITY_MAP.paths.find((p) => p.id === e.path);
        const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
        const run = path ? runOf(this.proj, path.points) : a && b ? orthogonal([this.nodePt(a), this.nodePt(b)]) : [];
        stroke(g, run, hex('map.star'), 'dashed');
      }
      // Paths being revealed fill in from their start.
      for (const id of this.reveal?.ids ?? []) {
        const path = CITY_MAP.paths.find((p) => p.id === id);
        if (!path) continue;
        const pts = walk(runOf(this.proj, path.points));
        const upTo = Math.ceil((pts.length * (this.reveal!.step)) / REVEAL_STEPS);
        g.fillStyle = white;
        for (const [x, y] of pts.slice(0, upTo)) g.fillRect(x - 1, y - 1, 2, 2);
      }
      for (const n of nodes) this.paintNode(g, n, n.id === this.selected);
      // Icons beside nodes; the objective's ★ above its node.
      const slots = new Map<string, number>();
      for (const p of pois) {
        const n = nodes.find((x) => x.id === p.node);
        if (!n) continue;
        const [x, y] = this.nodePt(n);
        const k = slots.get(n.id) ?? 0;
        slots.set(n.id, k + 1);
        const glyph = POI_GLYPHS[p.kind];
        bitmap(g, glyph.rows, x - 12 - k * 9, y + 6, hex(glyph.tint));
      }
      if (dest) {
        const n = nodes.find((x) => x.id === dest.districtId);
        if (n) { const [x, y] = this.nodePt(n); bitmap(g, POI_GLYPHS.star.rows, x + 6, y - 12, hex('map.star')); }
      }
    }, true);
    if (!this.overlay) { this.overlay = this.add.image(0, 0, key).setOrigin(0); this.mapLayer.add(this.overlay); }
    else this.overlay.setTexture(key);

    // The player: a white heading arrow above "here", blinking.
    const hereNode = nodes.find((n) => n.id === here);
    const dir = this.headingDir();
    const arrowKey = bake(this, `map:arrow:${dir}`, 7, 7, (g) => bitmap(g, ARROWS[dir], 0, 0, hex('map.path')));
    if (!this.arrow) { this.arrow = this.add.image(0, 0, arrowKey).setOrigin(0); this.mapLayer.add(this.arrow); }
    this.arrow.setTexture(arrowKey).setVisible(Boolean(hereNode) && this.arrow.visible !== false);
    if (hereNode) { const [x, y] = this.nodePt(hereNode); this.arrow.setPosition(x - 3, y - 15); }

    this.mapLayer.setPosition(this.pan[0], this.pan[1]).setScale(this.zoom);
    this.renderUi(nodes, dest);
  }

  /** The Area view: OSM streets, the pocket outline, the player at their real spot. */
  private renderArea(): void {
    const area = this.area!;
    const key = bake(this, `map:area:${area.district}`, area.proj.w, area.proj.h, (g) => {
      paintArea(g, area.data, area.proj);
      if (area.pocket) paintPocket(g, pocketOutline(area.pocket).map((p) => area.proj.at(p)));
    });
    if (!this.areaImage) { this.areaImage = this.add.image(0, 0, key).setOrigin(0); this.mapLayer.addAt(this.areaImage, 0); }
    this.areaImage.setTexture(key).setVisible(true);
    this.base?.setVisible(false);
    this.overlay?.setVisible(false);
    if (this.player) {
      const k = `map:arrow:${this.player.facing}`;
      bake(this, k, 7, 7, (g) => bitmap(g, ARROWS[this.player!.facing], 0, 0, hex('map.path')));
      if (!this.arrow) { this.arrow = this.add.image(0, 0, k).setOrigin(0); this.mapLayer.add(this.arrow); }
      const [x, y] = area.proj.at(this.player.at);
      this.arrow.setTexture(k).setPosition(x - 3, y - 3);
    } else this.arrow?.setVisible(false);
    this.mapLayer.setPosition(this.pan[0], this.pan[1]).setScale(this.zoom);
    this.renderAreaUi();
  }

  private renderAreaUi(): void {
    this.ui.removeAll(true);
    this.buttons = [];
    const area = this.area!;
    // Street names: screen text, never scaled; overlapping ones dropped.
    for (const l of placeLabels(area.data, area.proj, this.zoom, (s) => measure(s))) {
      const [sx, sy] = toScreen(l.at, this.pan, this.zoom);
      if (sx < -l.w || sx > SCREEN.w + l.w || sy < 0 || sy > SCREEN.h) continue;
      this.ui.add(pxText(this, Math.round(sx), Math.round(sy) - 3, l.name, { tint: 'hud.text', align: 'center' }));
    }
    this.compass();
    // The pocket's card: name, the real streets it is on, and that you can walk it.
    if (area.pocket) {
      const title = area.label.toUpperCase();
      const sub = (area.pocket.streets ?? []).join(' · ').toUpperCase();
      const w = Math.max(measure(title, true), measure(sub), measure('YOU CAN WALK HERE')) + 14, h = 41;
      const [cx, cy] = toScreen(area.proj.at(pocketOutline(area.pocket)[1]), this.pan, this.zoom);
      const x = Math.max(48, Math.min(SCREEN.w - w - 40, Math.round(cx + 8))), y = Math.max(46, Math.min(BOTTOM - PILL_H - h - 6, Math.round(cy - 20)));
      this.img(x, y, bake(this, `map:card:${w}x${h}`, w + 40, h, (g) => labelCard(g, 0, 0, w, h, 'default', 9)));
      this.text(x + 7, y + 6, title, 'hud.text', { bold: true });
      this.text(x + 7, y + 17, sub, 'hud.border');
      this.text(x + 7, y + 28, 'YOU CAN WALK HERE', 'map.star');
    }
    this.button('close', SCREEN.w - 8 - 54, 8, 'CLOSE', () => this.close());
    this.button('view', 8, BOTTOM - PILL_H, 'CITY', () => this.switchView('city'));
    this.button('zoom', SCREEN.w - 8 - 32, BOTTOM - PILL_H, this.zoom === 1 ? '2×' : '1×', () => this.setZoom(this.zoom === 1 ? 2 : 1, [SCREEN.w / 2, SCREEN.h / 2]));
    this.button('centre', SCREEN.w - 8 - 32 - 6 - 40, BOTTOM - PILL_H, 'ME', () => { this.centreOnPlayer(); this.render(); });
    // ODbL attribution, always on screen with the data.
    const credit = '© OpenStreetMap contributors', cw = measure(credit) + 12;
    this.img(Math.round(SCREEN.w / 2 - cw / 2), BOTTOM - 8, bake(this, `map:credit:${cw}`, cw, 15, (g) => hudPlate(g, 0, 0, cw, 14, 'default', 3)));
    this.text(SCREEN.w / 2, BOTTOM - 4, credit, 'hud.border', { align: 'center' });
  }

  private headingDir(): 'n' | 'e' | 's' | 'w' {
    const h = MapManager.getInstance().heading();
    if (!h) return 'n';
    const [a, b] = [this.proj.raw(h[0]), this.proj.raw(h[1])];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
  }

  private paintNode(g: PixelCtx, n: MapNode, selected: boolean): void {
    const [x, y] = this.nodePt(n);
    const white = hex('map.path'), grey = hex('hud.border');
    const big = n.kind === 'district';
    const s = big ? 8 : 6;
    const x0 = x - s / 2, y0 = y - s / 2;
    rect(g, x0 - 1, y0 - 1, s + 2, s + 2, hex('map.bg')); // a clear moat so the node reads over glyphs
    if (n.state === 'visited') roundRect(g, x0, y0, s, s, 2, white);
    else ring(g, x0, y0, s, s, 2, big ? 2 : 1, n.state === 'locked' ? grey : white);
    if (n.state === 'locked') bitmap(g, PADLOCK, x + s / 2 + 1, y - s / 2 - 5, grey);
    if (selected) ring(g, x0 - 3, y0 - 3, s + 6, s + 6, 3, 1, hex('map.star'));
  }

  // ── Screen-space UI ──────────────────────────────────────────────────────

  private renderUi(nodes: MapNode[], dest: ReturnType<MapManager['destination']>): void {
    this.ui.removeAll(true);
    this.buttons = [];
    const mm = MapManager.getInstance();

    this.compass();

    // Pinned card at the objective; the selected node's card on top.
    if (dest && dest.districtId !== this.selected) {
      const n = nodes.find((x) => x.id === dest.districtId);
      if (n) this.card(n, dest.objective);
    }
    const sel = nodes.find((x) => x.id === this.selected);
    if (sel) this.card(sel, dest?.districtId === sel.id ? dest.objective : undefined);

    // Buttons: close (top-right), legend (bottom-left), centre + zoom (bottom-right), actions (bottom-centre).
    this.button('close', SCREEN.w - 8 - 54, 8, 'CLOSE', () => this.close());
    const legendW = this.button('legend', 8, BOTTOM - PILL_H, this.legend ? 'HIDE KEY' : 'KEY', () => { this.legend = !this.legend; this.render(); });
    if (this.area) this.button('view', 8 + legendW + 6, BOTTOM - PILL_H, 'AREA', () => this.switchView('area'));
    this.button('zoom', SCREEN.w - 8 - 32, BOTTOM - PILL_H, this.zoom === 1 ? '2×' : '1×', () => this.setZoom(this.zoom === 1 ? 2 : 1, [SCREEN.w / 2, SCREEN.h / 2]));
    this.button('centre', SCREEN.w - 8 - 32 - 6 - 40, BOTTOM - PILL_H, 'ME', () => { this.centreOn(mm.here()); this.render(); });

    if (this.hint === 'No way there from here yet.') this.hint = null;
    const actions: Array<[string, string, () => void]> = [];
    if (sel?.kind === 'district' && sel.id !== mm.here()) {
      const chosen = useGameStore.getState().mapDestination === sel.id;
      const reachable = Boolean(mm.here() && mm.route(mm.here()!, sel.id));
      if (sel.state !== 'locked' && !reachable && !chosen) this.hint = 'No way there from here yet.';
      else if (sel.state !== 'locked') {
        actions.push(['dest', chosen ? 'CLEAR DESTINATION' : 'SET DESTINATION', () => {
          mm.setDestination(chosen ? null : sel.id);
          this.render();
        }]);
        const ft = mm.fastTravel(sel.id);
        if (ft) actions.push(['fast', `METRO · ₹${ft.fare}`, () => this.fastTravel(sel.id, ft.fare)]);
      }
    }
    let ax = Math.round(SCREEN.w / 2 - actions.reduce((w, [, l]) => w + measure(l, true) + 16 + 6, -6) / 2);
    for (const [id, label, run] of actions) { ax += this.button(id, ax, BOTTOM - PILL_H, label, run) + 6; }

    if (this.legend) this.legendPanel();
    if (this.hint) this.text(SCREEN.w / 2, BOTTOM - PILL_H - 14, this.hint, 'hud.text', { align: 'center' });
  }

  private img(x: number, y: number, key: string): void {
    this.ui.add(this.add.image(x, y, key).setOrigin(0));
  }

  private text(x: number, y: number, s: string, tint: TokenName, opts: { bold?: boolean; align?: 'left' | 'center' | 'right' } = {}): void {
    this.ui.add(pxText(this, x, y, s, { ...opts, tint }));
  }

  /** A HUD-plate pill; returns its width. Touch zone ≥ MIN_TAP. */
  private button(id: string, x: number, y: number, label: string, run: () => void): number {
    const w = measure(label, true) + 16;
    const state: UiState = this.pressedButton === id ? 'pressed' : this.focusButton === id ? 'focus' : 'default';
    this.img(x, y, bake(this, `map:pill:${w}:${state}`, w, PILL_H + 1, (g) => hudPlate(g, 0, 0, w, PILL_H, state, 4)));
    const ink: TokenName = state === 'focus' || state === 'pressed' ? 'hud.plate' : 'hud.text';
    this.text(x + w / 2, y + 6 + (state === 'pressed' ? 1 : 0), label, ink, { bold: true, align: 'center' });
    const tw = Math.max(w, MIN_TAP), th = Math.max(PILL_H, MIN_TAP);
    this.buttons.push({ id, x: x - (tw - w) / 2, y: y - (th - PILL_H) / 2, w: tw, h: th, label, run });
    return w;
  }

  private compass(): void {
    this.img(8, 8, bake(this, 'map:compass', 34, 34, (g) => {
      hudPlate(g, 0, 0, 34, 33, 'default', 4);
      const c = hex('hud.text');
      rect(g, 16, 8, 2, 18, c); rect(g, 8, 16, 18, 2, c);
      bitmap(g, ['..#..', '.###.', '#####'], 15, 6, c);
      roundRect(g, 14, 14, 6, 6, 2, c);
    }));
    this.text(17, 11, 'N', 'hud.text', { bold: true, align: 'center' });
  }

  /** Map-style label card beside a node: UPPERCASE name, ★ row, ☠ row (Act 4), a sub line. */
  private card(node: MapNode, objective?: string): void {
    const mm = MapManager.getInstance();
    const lines = Object.fromEntries(CITY_MAP.metro.map((l) => [l.id, l.label]));
    const c = cardFor(node, { familiarity: node.kind === 'district' ? mm.familiarity(node.id) : 0, danger: node.kind === 'district' ? mm.danger(node.id) : null, lines, isHere: node.id === mm.here(), objective });
    const title = truncate(c.title, 210, true);
    const sub = c.sub ? truncate(c.sub, 210) : null;
    const rows = (c.stars !== null ? 1 : 0) + (c.danger !== null ? 1 : 0) + (sub ? 1 : 0);
    const w = Math.max(measure(title, true), sub ? measure(sub) : 0, 5 * 9) + 14;
    const h = 19 + rows * 11;
    const [sx, sy] = toScreen(this.nodePt(node), this.pan, this.zoom);
    const x = Math.max(4, Math.min(SCREEN.w - w - 40, Math.round(sx + 12))), y = Math.max(46, Math.min(BOTTOM - PILL_H - h - 6, Math.round(sy - 10)));
    this.img(x, y, bake(this, `map:card:${w}x${h}`, w + 40, h, (g) => labelCard(g, 0, 0, w, h, 'default', 9)));
    this.text(x + 7, y + 6, title, 'hud.text', { bold: true });
    let ry = y + 17;
    if (c.stars !== null) {
      this.img(x + 7, ry, bake(this, `map:stars:${c.stars}`, 45, 7, (g) => {
        for (let i = 0; i < 5; i++) {
          if (i < c.stars!) bitmap(g, POI_GLYPHS.star.rows, i * 9, 0, hex('map.star'));
          else rect(g, i * 9 + 3, 3, 2, 2, hex('hud.border'));
        }
      }));
      ry += 11;
    }
    if (c.danger !== null) {
      this.img(x + 7, ry, bake(this, `map:danger:${c.danger}`, 45, 7, (g) => {
        for (let i = 0; i < 5; i++) {
          if (i < c.danger!) bitmap(g, POI_GLYPHS.skull.rows, i * 9, 0, hex('map.danger'));
          else rect(g, i * 9 + 3, 3, 2, 2, hex('hud.border'));
        }
      }));
      ry += 11;
    }
    if (sub) this.text(x + 7, ry, sub, 'hud.border');
  }

  private legendPanel(): void {
    const rowH = 12, w = 110, h = LEGEND.length * rowH + 10;
    const x = 8, y = BOTTOM - PILL_H - 6 - h;
    this.img(x, y, bake(this, `map:legend:${w}x${h}`, w, h + 1, (g) => hudPlate(g, 0, 0, w, h, 'default', 4)));
    LEGEND.forEach((row, i) => {
      const gy = y + 6 + i * rowH;
      const gw = bitmapWidth(row.glyph);
      this.img(x + 8, gy + Math.max(0, Math.floor((8 - row.glyph.length) / 2)), bake(this, `map:legend:g${i}`, gw, row.glyph.length, (g) => bitmap(g, row.glyph, 0, 0, hex(row.tint))));
      this.text(x + 22, gy + 1, row.label, 'hud.text');
    });
  }

  private fastTravel(districtId: string, fare: number): void {
    const world = this.world();
    if (!world) return;
    if (!StatsManager.getInstance().spend(fare, 'transit', 'Namma Metro')) { this.hint = `Needs ₹${fare}`; this.render(); return; }
    this.finishClose();
    world.travelTo(districtId, 'metro');
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onKey(ev: KeyboardEvent): void {
    if (this.phase === 'closed') {
      if (ev.code === 'KeyM' && useGameStore.getState().overlay === null) this.open();
      return;
    }
    if (this.phase !== 'open') return;
    const mm = MapManager.getInstance();
    switch (ev.code) {
      case 'KeyM': case 'Escape': case 'Backspace': this.close(); return;
      case 'KeyZ': this.setZoom(this.zoom === 1 ? 2 : 1, [SCREEN.w / 2, SCREEN.h / 2]); return;
      case 'KeyC': this.centreOnPlayer(); this.render(); return;
      case 'KeyV': this.switchView(this.view === 'area' ? 'city' : 'area'); return;
      case 'KeyL': this.legend = !this.legend; this.render(); return;
      case 'KeyW': this.panBy(0, PAN_STEP); return;
      case 'KeyS': this.panBy(0, -PAN_STEP); return;
      case 'KeyA': this.panBy(PAN_STEP, 0); return;
      case 'KeyD': this.panBy(-PAN_STEP, 0); return;
      case 'Enter': case 'Space': case 'KeyE': this.buttons.find((b) => b.id === 'dest')?.run(); return;
      case 'KeyF': this.buttons.find((b) => b.id === 'fast')?.run(); return;
    }
    const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const dir = dirs[ev.code];
    if (!dir) return;
    if (this.view === 'area') {
      const d = { up: [0, PAN_STEP], down: [0, -PAN_STEP], left: [PAN_STEP, 0], right: [-PAN_STEP, 0] }[dir];
      this.panBy(d[0], d[1]);
      return;
    }
    const nodes = mm.nodes();
    const boxes = nodes.map((n) => { const [x, y] = this.nodePt(n); return { x, y, w: 1, h: 1 }; });
    const from = Math.max(0, nodes.findIndex((n) => n.id === (this.selected ?? mm.here())));
    const next = nodes[nextFocus(boxes, from, dir)];
    this.select(next?.id ?? null, true);
  }

  private select(id: string | null, follow = false): void {
    this.selected = id;
    this.hint = null;
    if (id && follow) {
      const n = MapManager.getInstance().nodes().find((x) => x.id === id);
      if (n) {
        const [sx, sy] = toScreen(this.nodePt(n), this.pan, this.zoom);
        if (sx < 60 || sx > SCREEN.w - 60 || sy < 60 || sy > SCREEN.h - 60) this.centreOn(id);
      }
    }
    this.render();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'open') return;
    const ps = this.input.manager.pointers.filter((x) => x.isDown);
    if (ps.length >= 2) { this.pinch = Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y); this.drag = null; return; }
    const b = this.buttons.find((x) => p.x >= x.x && p.x < x.x + x.w && p.y >= x.y && p.y < x.y + x.h);
    if (b) { this.pressedButton = b.id; this.render(); return; }
    this.drag = { start: [p.x, p.y], pan: [...this.pan] as Pt, moved: false };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'open') return;
    if (this.pinch !== null) {
      const ps = this.input.manager.pointers.filter((x) => x.isDown);
      if (ps.length < 2) return;
      const d = Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y);
      const mid: Pt = [(ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2];
      // Pinch snaps to whole zoom levels.
      if (d / this.pinch > 1.3) { this.setZoom(2, mid); this.pinch = d; }
      else if (d / this.pinch < 0.77) { this.setZoom(1, mid); this.pinch = d; }
      return;
    }
    if (!this.drag || !p.isDown) return;
    const dx = p.x - this.drag.start[0], dy = p.y - this.drag.start[1];
    if (!this.drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    this.drag.moved = true;
    this.pan = clampPan([Math.round(this.drag.pan[0] + dx), Math.round(this.drag.pan[1] + dy)], this.zoom, this.dims(), SCREEN);
    this.mapLayer.setPosition(this.pan[0], this.pan[1]);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'open') return;
    if (this.pinch !== null) { if (!this.input.manager.pointers.some((x) => x.isDown)) this.pinch = null; return; }
    const pressed = this.pressedButton;
    this.pressedButton = null;
    if (pressed) {
      const b = this.buttons.find((x) => x.id === pressed);
      if (b && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) b.run();
      else this.render();
      return;
    }
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved || this.view === 'area') { this.render(); return; }
    const nodes = MapManager.getInstance().nodes().map((n) => ({ id: n.id, screen: toScreen(this.nodePt(n), this.pan, this.zoom) }));
    this.select(nodeAt(nodes, [p.x, p.y]));
  }
}

export default MapScene;
