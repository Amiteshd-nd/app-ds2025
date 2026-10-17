/**
 * The game's dev API (ADR-104): the ONLY door the Test Playground uses into the
 * running game. Installed by PhaserGame when `import.meta.env.DEV`, so the
 * production build tree-shakes it away (scripts/check-dist.mjs verifies).
 *
 *   window.__nqDev.loadNode({ kind: 'scene', sceneId: 'act0_pg_hunt', beatId: 'F4' })
 *
 * It drives real systems only — the store, SaveManager, the scene manager —
 * so a scene that works here works identically in the game.
 */
import type Phaser from 'phaser';
import { OVERLAY_URLS } from '../assets';
import { MAPS } from '../assets/maps';
import { zYForDepth } from '../core/depth';
import { DISTRICTS, SCENES } from '../data';
import { SaveManager } from '../systems/SaveManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { DEPTH, LAYERS, SCENE_KEYS } from '../utils/constants';
import { applyOverride, buildPrereqState, type PlaygroundState, type StateOverride } from './prereq';

export type DevNode =
  | { kind: 'intro'; scene: 'BootScene' | 'TitleScene' | 'CharacterSelectScene' }
  | { kind: 'scene'; sceneId: string; beatId?: string }
  | { kind: 'district'; districtId: string; spawnId?: string };

/** Playground saves live here — never in the player's real slot. */
export const PLAYGROUND_SAVE_NAMESPACE = 'playground';

export interface DevApi {
  /** The auto-built prerequisite state for a scene/beat, before overrides. */
  prereq(sceneId: string, beatId?: string): PlaygroundState;
  /** Start a node with its prerequisite state + overrides. */
  loadNode(node: DevNode, override?: StateOverride): void;
  /** Change the running state live (stats, flags, wallet, clock…). */
  applyState(override: StateOverride): void;
  getState(): PlaygroundState & { activeScene: string | null };
  setSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  step(frames?: number): void;
  isPaused(): boolean;
  showCollision(on: boolean): void;
  showZones(on: boolean): void;
  fps(): number;
  /** The HUD's touch zones in game px (joystick, action button) for the thumb overlay; empty on a keyboard. */
  touchTargets(): Array<{ name: string; rect: { x: number; y: number; w: number; h: number } }>;
  // ── Locations / layer inspection (Part B, ADR-125) ──
  /** The running map's layers in render order, with visibility and counts. */
  mapLayers(): LayerInfo[];
  /** Hide or show one layer: tile layers, the sorted band (cut-outs, props, people), props_above, collision boxes, spawns. */
  setLayerVisible(name: string, on: boolean): void;
  /** Debug overlays: collision boxes (red), Y-sort lines (yellow), feet boxes (green), band tints (yellow sorted / blue above), zones. */
  setOverlay(kind: OverlayKind, on: boolean): void;
  overlays(): Record<OverlayKind, boolean>;
  /** What is under a game-pixel point of the canvas: layer, object, position, footprint, collision, depth, and a ref to paste. */
  inspectAt(gameX: number, gameY: number): Pick | null;
  /** The running map: key, district, size, spawns, exits. */
  mapInfo(): MapInfo | null;
}

export type OverlayKind = 'collision' | 'ysort' | 'feet' | 'tintSorted' | 'tintAbove' | 'zones' | 'audio';

export interface LayerInfo {
  name: string;
  kind: 'tile' | 'object';
  visible: boolean;
  /** Tiles painted / objects placed. */
  count: number;
}

export interface Pick {
  layer: string;
  kind: 'cutout' | 'above' | 'object' | 'npc' | 'player' | 'crowd' | 'collision' | 'footprint' | 'tile' | 'spawn' | 'zone';
  name: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  footprint?: { x: number; y: number; w: number; h: number } | null;
  collision: boolean;
  depth?: number;
  /** The feet line the depth encodes (sorted band). */
  feetY?: number;
  /** Paste-ready: `map_key@x,y layer:sorted cutout:lamp_12`. */
  ref: string;
}

export interface MapInfo {
  key: string;
  districtId: string | null;
  widthPx: number;
  heightPx: number;
  tiles: [number, number];
  spawns: Array<{ name: string; x: number; y: number; w: number; h: number; point: boolean }>;
  exits: Array<{ zone: string; to: string; transit: string }>;
}

const defaults = () => {
  const s = useGameStore.getState();
  return { stats: { ...s.stats }, clock: { ...s.clock } };
};

const worldScene = (game: Phaser.Game): Phaser.Scene | null => {
  const scene = game.scene.getScene(SCENE_KEYS.WORLD);
  return scene && game.scene.isActive(SCENE_KEYS.WORLD) ? scene : null;
};

/** Put a PlaygroundState into the real store (after a reset). */
function writeState(state: PlaygroundState): void {
  const store = useGameStore.getState();
  store.hydrate({
    stats: { ...state.stats },
    inventory: [...state.inventory],
    counters: { ...state.counters },
    clock: { ...state.clock },
    reputation: { total: state.reputation, byDistrict: {} },
    quests: { active: {}, completed: [...state.questsCompleted] },
    flags: { ...state.flags },
  });
}

export function installDevApi(game: Phaser.Game): DevApi {
  SaveManager.useNamespace(PLAYGROUND_SAVE_NAMESPACE);
  let paused = false;
  let speed = 1;
  let collision = false;
  let zones = false;
  let zoneGraphics: Phaser.GameObjects.Graphics | null = null;

  const applyVisuals = () => {
    const scene = worldScene(game);
    if (!scene) return;
    // Every running scene follows the speed (Movie Mode 1×/2×/4×): the HUD's typewriter, the transit card's timer, the phone.
    for (const s of game.scene.getScenes(true)) { s.time.timeScale = speed; s.tweens.timeScale = speed; }
    scene.anims.globalTimeScale = speed;
    const world = scene.physics?.world;
    if (world) {
      world.timeScale = 1 / speed;
      if (collision && !world.debugGraphic) world.createDebugGraphic();
      world.drawDebug = collision;
      if (!collision) world.debugGraphic?.clear();
    }
    // The hidden collision stencil of tile-based maps.
    for (const layer of scene.children.list) {
      const l = layer as Phaser.Tilemaps.TilemapLayer;
      if (l.layer?.name === LAYERS.collision) l.setVisible(collision).setAlpha(0.45);
    }
    zoneGraphics?.destroy();
    zoneGraphics = null;
    if (zones) {
      const map = (scene as unknown as { map?: Phaser.Tilemaps.Tilemap }).map;
      const g = scene.add.graphics().setDepth(10_000);
      for (const layerName of [LAYERS.spawns, LAYERS.sorted, LAYERS.collision]) {
        for (const obj of map?.getObjectLayer(layerName)?.objects ?? []) {
          const x = obj.x ?? 0, y = obj.y ?? 0, w = obj.width ?? 0, h = obj.height ?? 0;
          if (obj.point || (!w && !h)) g.fillStyle(0x44ff88, 0.9).fillCircle(x, y, 2);
          else if (layerName === LAYERS.collision) g.lineStyle(1, 0xff44aa, 0.8).strokeRect(x, y, w, h);
          else if (obj.type === 'cutout' || obj.type === 'above') g.lineStyle(1, obj.type === 'above' ? 0x44aaff : 0xffaa22, 0.6).strokeRect(x, y, w, h);
          else g.lineStyle(1, 0x44ccff, 0.9).strokeRect(x, y, w, h);
        }
      }
      zoneGraphics = g;
    }
  };

  // ── Part B: layer inspection (ADR-125) ──────────────────────────────────
  const overlayState: Record<OverlayKind, boolean> = { collision: false, ysort: false, feet: false, tintSorted: false, tintAbove: false, zones: false, audio: false };
  let overlayGfx: Phaser.GameObjects.Graphics | null = null;
  let overlayLabels: Phaser.GameObjects.Text[] = [];
  const hidden = new Set<string>();
  type W = Phaser.Scene & { map: Phaser.Tilemaps.Tilemap; player: Phaser.GameObjects.Sprite; npcs: Phaser.GameObjects.Sprite[]; crowd: { citizens: Phaser.GameObjects.Sprite[] } };
  const world = (): W | null => worldScene(game) as W | null;
  const isCutoutKey = (key: string) => key in OVERLAY_URLS;
  /** The manifest key of the running map (a Tilemap does not carry its cache key): from the active district. */
  const mapKeyOf = (w: W): string => { const id = useGameStore.getState().activeDistrict; return (id && DISTRICTS[id]?.map) || w.map.tilesets[0]?.name || 'map'; };
  /** Sorted-band drawables: cut-out images (above ones too), placed-object containers, people. */
  const bandItems = (w: W) => {
    const cut: Phaser.GameObjects.Image[] = [], above: Phaser.GameObjects.Image[] = [], props: Phaser.GameObjects.Container[] = [];
    for (const o of w.children.list) {
      if (o.type === 'Image' && isCutoutKey((o as Phaser.GameObjects.Image).texture.key)) ((o as Phaser.GameObjects.Image).depth >= DEPTH.ABOVE_PLAYER ? above : cut).push(o as Phaser.GameObjects.Image);
      else if (o.type === 'Container' && (o as Phaser.GameObjects.Container).depth >= DEPTH.ENTITIES && (o as Phaser.GameObjects.Container).depth < DEPTH.ENTITIES + 1) props.push(o as Phaser.GameObjects.Container);
    }
    const people = [w.player, ...(w.npcs ?? []), ...(w.crowd?.citizens ?? [])].filter(Boolean);
    return { cut, above, props, people };
  };
  const applyLayerVisibility = (w: W) => {
    for (const l of w.map.layers) l.tilemapLayer?.setVisible(!hidden.has(l.name) && l.name !== LAYERS.collision ? true : l.name === LAYERS.collision ? collision : false);
    const { cut, above, props, people } = bandItems(w);
    const showSorted = !hidden.has(LAYERS.sorted), showAbove = !hidden.has(LAYERS.propsAbove);
    for (const o of cut) o.setVisible(showSorted);
    for (const o of props) o.setVisible(showSorted);
    for (const o of people) o.setVisible(showSorted);
    for (const o of above) o.setVisible(showAbove);
    for (const o of cut) o.setTint(overlayState.tintSorted ? 0xffdd44 : 0xffffff);
    for (const o of props) o.each((c: Phaser.GameObjects.GameObject) => { const sp = c as Phaser.GameObjects.Sprite; if (sp.setTint) sp.setTint(overlayState.tintSorted ? 0xffdd44 : 0xffffff); });
    for (const o of above) o.setTint(overlayState.tintAbove ? 0x4488ff : 0xffffff);
  };
  /** Audio (ADR-140): footstep surface rects tinted by kind, each sound source as a speaker with its hearing radius. */
  const SURFACE_TINT: Record<string, number> = { concrete: 0x9a9a9a, asphalt: 0x444455, gravel: 0xc0602f, grass: 0x44aa44, mud: 0x6b4a2b, puddle: 0x3388ff, metal: 0xb0c4de, tile: 0xeeeeee, wood: 0xa0702f };
  const drawAudio = (w: W, g: Phaser.GameObjects.Graphics) => {
    const layer = w.map.getObjectLayer(MAPS[DISTRICTS[useGameStore.getState().activeDistrict ?? '']?.map ?? '']?.spawnLayer ?? '');
    for (const o of layer?.objects ?? []) {
      if (o.type !== 'surface') continue;
      const kind = (o.name ?? '').split('_')[1] ?? '';
      g.fillStyle(SURFACE_TINT[kind] ?? 0xffffff, 0.22).fillRect(o.x ?? 0, o.y ?? 0, o.width ?? 0, o.height ?? 0);
    }
    const audio = (window as unknown as { __nqAudio?: { sourcesView(): Array<{ token: string; x: number; y: number; radius: number; kind?: string; loop: boolean }> } }).__nqAudio;
    for (const s of audio?.sourcesView() ?? []) {
      const tint = s.kind === 'human' ? 0xffaa33 : 0x33ccff;
      g.lineStyle(1, tint, 0.7).strokeCircle(s.x, s.y, s.radius);
      g.fillStyle(tint, 1).fillRect(s.x - 3, s.y - 2, 3, 4).fillTriangle(s.x, s.y - 4, s.x, s.y + 4, s.x + 4, s.y);
      const t = w.add.text(s.x + 6, s.y - 4, s.token.replace(/^a\.(sfx\.)?/, ''), { fontSize: '7px', color: s.kind === 'human' ? '#ffaa33' : '#33ccff' }).setDepth(10_002);
      overlayLabels.push(t);
    }
  };

  const drawOverlays = (w: W) => {
    if (!overlayGfx || overlayGfx.scene !== w) { overlayGfx?.destroy(); overlayGfx = w.add.graphics().setDepth(10_001); }
    for (const t of overlayLabels) t.destroy();
    overlayLabels = [];
    const g = overlayGfx; g.clear();
    if (overlayState.audio) drawAudio(w, g);
    if (!overlayState.collision && !overlayState.ysort && !overlayState.feet) return;
    const bodies = w.physics.world;
    if (overlayState.collision) { g.lineStyle(1, 0xff3344, 0.9); for (const b of bodies.staticBodies.entries as Phaser.Physics.Arcade.StaticBody[]) g.strokeRect(b.x, b.y, b.width, b.height); }
    if (overlayState.feet) { g.lineStyle(1, 0x33ff66, 1); for (const b of bodies.bodies.entries as Phaser.Physics.Arcade.Body[]) g.strokeRect(b.x, b.y, b.width, b.height); }
    if (overlayState.ysort) {
      const { cut, props, people } = bandItems(w);
      g.lineStyle(1, 0xffdd00, 0.9);
      const line = (x0: number, x1: number, y: number, depth: number) => { g.lineBetween(x0, y, x1, y); const t = w.add.text(x1 + 2, y - 5, String(zYForDepth(depth)), { fontSize: '8px', color: '#ffdd00' }).setDepth(10_002); overlayLabels.push(t); };
      for (const o of cut) { const y = zYForDepth(o.depth); line(o.x, o.x + o.displayWidth, y, o.depth); }
      for (const o of props) { const y = zYForDepth(o.depth); line(o.x, o.x + o.width, y, o.depth); }
      for (const o of people) { const y = zYForDepth(o.depth); line(o.x - 12, o.x + 12, y, o.depth); }
    }
  };

  // Re-apply speed and overlays whenever a node (re)starts the world.
  game.events.on('step', () => {
    const scene = worldScene(game);
    if (scene && scene.time.timeScale !== speed) applyVisuals();
    if (scene && zones && (!zoneGraphics || zoneGraphics.scene !== scene)) applyVisuals();
    const w = world();
    if (w && w.map) { if (hidden.size || overlayState.tintSorted || overlayState.tintAbove) applyLayerVisibility(w); drawOverlays(w); }
  });

  // A node must not start while BootScene is still loading assets (a deep
  // link arrives that early): the map would build with no tileset images.
  const booted = () => {
    const active = useGameStore.getState().activeScene;
    return active !== null && active !== SCENE_KEYS.BOOT;
  };
  const whenBooted = (run: () => void) => {
    if (booted()) { run(); return; }
    const timer = window.setInterval(() => { if (booted()) { window.clearInterval(timer); run(); } }, 50);
  };

  const startScene = (key: string, data?: object) => {
    // Orientation and the menu are global; Movie Mode's overlay (if added) rides across node loads too.
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== SCENE_KEYS.ORIENTATION && s.scene.key !== SCENE_KEYS.MENU && s.scene.key !== 'MovieOverlayScene') game.scene.stop(s.scene.key);
    game.scene.start(key, data);
  };

  const api: DevApi = {
    prereq: (sceneId, beatId) => buildPrereqState(sceneId, Object.values(SCENES), defaults(), beatId),

    loadNode(node, override) {
      if (!booted()) { whenBooted(() => api.loadNode(node, override)); return; }
      if (node.kind === 'intro') {
        if (node.scene !== 'BootScene') useGameStore.getState().reset();
        startScene(node.scene);
        return;
      }
      useGameStore.getState().reset();
      TimeManager.resetInstance();
      if (node.kind === 'district') {
        // A bench can ask for a little state (the Act 4 test bench needs `act4`, ADR-145); free-roam passes none.
        const store = useGameStore.getState();
        for (const [flag, value] of Object.entries(override?.flags ?? {})) store.setFlag(flag, Boolean(value));
        for (const [k, v] of Object.entries(override?.counters ?? {})) store.setCounter(k, v);
        if (override?.clock) store.setClock({ ...store.clock, ...override.clock });
        if (override?.inventory) store.setInventory([...override.inventory]);
        startScene(SCENE_KEYS.WORLD, { districtId: node.districtId, spawnId: node.spawnId });
        return;
      }
      const state = applyOverride(api.prereq(node.sceneId, node.beatId), override);
      writeState(state);
      startScene(SCENE_KEYS.WORLD, { districtId: state.position.districtId, spawnId: state.position.spawnId || undefined });
    },

    applyState(override) {
      const store = useGameStore.getState();
      const current = api.getState();
      const next = applyOverride(current, override);
      store.hydrate({
        stats: next.stats, inventory: next.inventory, counters: next.counters, clock: next.clock,
        reputation: { ...store.reputation, total: next.reputation },
      });
      // Flags through setFlag, so quests react exactly as in play.
      for (const [flag, value] of Object.entries(override.flags ?? {})) store.setFlag(flag, Boolean(value));
    },

    getState() {
      const s = useGameStore.getState();
      return {
        flags: { ...s.flags },
        questsCompleted: [...s.quests.completed],
        stats: { ...s.stats },
        inventory: [...s.inventory],
        counters: { ...s.counters },
        clock: { ...s.clock },
        reputation: s.reputation.total,
        position: { districtId: s.activeDistrict ?? '', spawnId: '' },
        activeScene: s.activeScene,
      };
    },

    setSpeed(multiplier) {
      speed = multiplier;
      applyVisuals();
    },
    pause() {
      paused = true;
      game.loop.sleep();
    },
    resume() {
      paused = false;
      game.loop.wake();
    },
    step(frames = 1) {
      for (let i = 0; i < frames; i++) game.step(performance.now(), 1000 / 60);
    },
    isPaused: () => paused,
    touchTargets() {
      const hud = game.scene.getScene(SCENE_KEYS.HUD) as (Phaser.Scene & { touchTargets?: () => Array<{ name: string; rect: { x: number; y: number; w: number; h: number } }> }) | null;
      return hud && game.scene.isActive(SCENE_KEYS.HUD) && hud.touchTargets ? hud.touchTargets() : [];
    },
    showCollision(on) {
      collision = on;
      applyVisuals();
    },
    showZones(on) {
      zones = on;
      applyVisuals();
    },
    fps: () => game.loop.actualFps,

    mapLayers() {
      const w = world(); if (!w || !w.map) return [];
      const out: LayerInfo[] = [];
      for (const name of w.map.layers.map((l) => l.name).concat(w.map.objects.map((l) => l.name))) {
        const tile = w.map.getLayer(name);
        if (tile) out.push({ name, kind: 'tile', visible: !hidden.has(name), count: tile.data.flat().filter((t) => t && t.index > 0).length });
        else { const obj = w.map.getObjectLayer(name); if (obj) out.push({ name, kind: 'object', visible: !hidden.has(name), count: obj.objects.length }); }
      }
      // manifest order: tiles and object layers interleave by LAYER_ORDER, spawns last
      const order: string[] = [LAYERS.ground, LAYERS.groundDetail, LAYERS.buildings, LAYERS.sorted, LAYERS.propsAbove, LAYERS.collision, LAYERS.fx, LAYERS.spawns];
      return out.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    },
    setLayerVisible(name, on) {
      if (on) hidden.delete(name); else hidden.add(name);
      if (name === LAYERS.collision) { collision = on; applyVisuals(); }
      if (name === LAYERS.spawns) { zones = on; applyVisuals(); }
      const w = world(); if (w && w.map) applyLayerVisibility(w);
    },
    setOverlay(kind, on) {
      overlayState[kind] = on;
      if (kind === 'collision') { collision = on; applyVisuals(); }
      if (kind === 'zones') { zones = on; applyVisuals(); }
      const w = world(); if (w && w.map) { applyLayerVisibility(w); drawOverlays(w); }
    },
    overlays: () => ({ ...overlayState }),
    inspectAt(gameX, gameY) {
      const w = world(); if (!w || !w.map) return null;
      const cam = w.cameras.main; const pt = cam.getWorldPoint(gameX, gameY); const wx = pt.x, wy = pt.y;
      const mapKey = mapKeyOf(w);
      const key = mapKey.replace(/_map$/, '');
      const ref = (layer: string, kind: string, name: string) => `${mapKey}@${Math.round(wx)},${Math.round(wy)} layer:${layer} ${kind}:${name}`;
      const inRect = (x: number, y: number, ww: number, hh: number) => wx >= x && wx < x + ww && wy >= y && wy < y + hh;
      const { cut, above, props, people } = bandItems(w);
      const sortedL = w.map.getObjectLayer(LAYERS.sorted);
      const propOf = (o: Phaser.Types.Tilemaps.TiledObject, n: string) => (o.properties as Array<{ name: string; value: unknown }> | undefined)?.find((p) => p.name === n)?.value;
      const objFor = (img: Phaser.GameObjects.Image) => (sortedL?.objects ?? []).find((o) => propOf(o, 'image') === img.texture.key);
      for (const o of above) if (inRect(o.x, o.y, o.displayWidth, o.displayHeight)) return { layer: LAYERS.propsAbove, kind: 'above', name: objFor(o)?.name ?? o.texture.key, x: o.x, y: o.y, w: o.displayWidth, h: o.displayHeight, collision: false, depth: o.depth, ref: ref(LAYERS.sorted, 'above', objFor(o)?.name ?? key) };
      for (const p of people) if (inRect(p.x - 16, p.y - 24, 32, 48)) { const id = (p.getData('npcId') as string | undefined); const kind = p === w.player ? 'player' : id ? 'npc' : 'crowd'; const b = p.body as Phaser.Physics.Arcade.Body | null; return { layer: LAYERS.sorted, kind, name: id ?? p.texture.key, x: p.x, y: p.y, footprint: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null, collision: Boolean(b), depth: p.depth, feetY: zYForDepth(p.depth), ref: ref(LAYERS.sorted, kind, id ?? p.texture.key) }; }
      for (const o of cut) if (inRect(o.x, o.y, o.displayWidth, o.displayHeight)) { const t = objFor(o); const fx = t && propOf(t, 'footX'); const fp = typeof fx === 'number' ? { x: fx, y: propOf(t!, 'footY') as number, w: propOf(t!, 'footW') as number, h: propOf(t!, 'footH') as number } : null; return { layer: LAYERS.sorted, kind: 'cutout', name: t?.name ?? o.texture.key, x: o.x, y: o.y, w: o.displayWidth, h: o.displayHeight, footprint: fp, collision: Boolean(fp), depth: o.depth, feetY: zYForDepth(o.depth), ref: ref(LAYERS.sorted, 'cutout', t?.name ?? o.texture.key) }; }
      for (const c of props) if (inRect(c.x, c.y, c.width, c.height)) { const t = (sortedL?.objects ?? []).find((o) => Math.round((o.x ?? 0) / 32) * 32 === c.x && Math.round((o.y ?? 0) / 32) * 32 === c.y); return { layer: LAYERS.sorted, kind: 'object', name: t?.type ?? 'placed object', x: c.x, y: c.y, w: c.width, h: c.height, collision: true, depth: c.depth, feetY: zYForDepth(c.depth), ref: ref(LAYERS.sorted, 'object', t?.type ?? 'placed') }; }
      for (const b of w.physics.world.staticBodies.entries as Phaser.Physics.Arcade.StaticBody[]) if (inRect(b.x, b.y, b.width, b.height)) return { layer: LAYERS.collision, kind: 'collision', name: `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`, x: b.x, y: b.y, w: b.width, h: b.height, collision: true, ref: ref(LAYERS.collision, 'rect', `${Math.round(b.x)},${Math.round(b.y)}`) };
      const spawnsL = w.map.getObjectLayer(LAYERS.spawns);
      // Spawns and zones — but not the big area zones (crowd bounds) that would swallow every click.
      const mapArea = w.map.widthInPixels * w.map.heightInPixels;
      for (const o of spawnsL?.objects ?? []) { const ww = o.width || 0, hh = o.height || 0; if (ww * hh > mapArea / 6) continue; if (ww && hh ? inRect(o.x ?? 0, o.y ?? 0, ww, hh) : Math.abs((o.x ?? 0) - wx) < 8 && Math.abs((o.y ?? 0) - wy) < 8) return { layer: LAYERS.spawns, kind: ww && hh ? 'zone' : 'spawn', name: o.name, x: o.x ?? 0, y: o.y ?? 0, w: ww, h: hh, collision: false, ref: ref(LAYERS.spawns, ww && hh ? 'zone' : 'spawn', o.name) }; }
      for (const name of [LAYERS.propsAbove, LAYERS.buildings, LAYERS.groundDetail, LAYERS.ground]) {
        const tile = w.map.getTileAtWorldXY(wx, wy, false, cam, name);
        if (tile && tile.index > 0) return { layer: name, kind: 'tile', name: `tile ${tile.index}`, x: tile.pixelX, y: tile.pixelY, w: 32, h: 32, collision: Boolean(w.map.getTileAtWorldXY(wx, wy, false, cam, LAYERS.collision)?.index), ref: ref(name, 'tile', `${tile.x},${tile.y}#${tile.index}`) };
      }
      return null;
    },
    mapInfo() {
      const w = world(); if (!w || !w.map) return null;
      const districtId = useGameStore.getState().activeDistrict;
      const d = districtId ? DISTRICTS[districtId] : undefined;
      const spawns = (w.map.getObjectLayer(LAYERS.spawns)?.objects ?? []).map((o) => ({ name: o.name, x: Math.round(o.x ?? 0), y: Math.round(o.y ?? 0), w: Math.round(o.width ?? 0), h: Math.round(o.height ?? 0), point: !(o.width && o.height) }));
      return { key: mapKeyOf(w), districtId, widthPx: w.map.widthInPixels, heightPx: w.map.heightInPixels, tiles: [w.map.width, w.map.height], spawns, exits: (d?.exits ?? []).map((e) => ({ zone: e.zone, to: e.to, transit: e.transit })) };
    },
  };

  (window as unknown as Record<string, unknown>).__nqDev = api;
  return api;
}
