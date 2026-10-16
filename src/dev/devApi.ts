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
import { SCENES } from '../data';
import { SaveManager } from '../systems/SaveManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { SCENE_KEYS } from '../utils/constants';
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
    scene.time.timeScale = speed;
    scene.tweens.timeScale = speed;
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
      if (l.layer?.name === 'Collision') l.setVisible(collision).setAlpha(0.45);
    }
    zoneGraphics?.destroy();
    zoneGraphics = null;
    if (zones) {
      const map = (scene as unknown as { map?: Phaser.Tilemaps.Tilemap }).map;
      const g = scene.add.graphics().setDepth(10_000);
      for (const layerName of ['Spawns', 'Shapes']) {
        for (const obj of map?.getObjectLayer(layerName)?.objects ?? []) {
          const x = obj.x ?? 0, y = obj.y ?? 0, w = obj.width ?? 0, h = obj.height ?? 0;
          if (obj.point || (!w && !h)) g.fillStyle(0x44ff88, 0.9).fillCircle(x, y, 2);
          else if (obj.type === 'solid') g.lineStyle(1, 0xff44aa, 0.8).strokeRect(x, y, w, h);
          else if (obj.type === 'occluder') g.lineStyle(1, 0xffaa22, 0.6).strokeRect(x, y, w, h);
          else g.lineStyle(1, 0x44ccff, 0.9).strokeRect(x, y, w, h);
        }
      }
      zoneGraphics = g;
    }
  };

  // Re-apply speed and overlays whenever a node (re)starts the world.
  game.events.on('step', () => {
    const scene = worldScene(game);
    if (scene && scene.time.timeScale !== speed) applyVisuals();
    if (scene && zones && (!zoneGraphics || zoneGraphics.scene !== scene)) applyVisuals();
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
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== SCENE_KEYS.ORIENTATION && s.scene.key !== SCENE_KEYS.MENU) game.scene.stop(s.scene.key);
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
  };

  (window as unknown as Record<string, unknown>).__nqDev = api;
  return api;
}
