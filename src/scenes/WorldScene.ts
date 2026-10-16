import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { SaveManager } from '../systems/SaveManager';
import { QuestManager } from '../systems/QuestManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { TILESET_URLS } from '../assets';
import { MAPS, LAYER_ORDER } from '../assets/maps';
import { getDistrict } from '../data';
import { gameEvents } from '../core/events';
import { characterZY, depthForZY } from '../core/depth';
import * as Populate from '../world/Populate';
import * as Exits from '../world/Exits';
import * as Triggers from '../world/Triggers';
import * as Shapes from '../world/Shapes';
import { findObject } from '../world/Zones';
import { BEHAVIOURS, CORE_BEHAVIOURS } from '../world/behaviours';
import { platform } from '../platform';
import {
  CAMERA_DEADZONE_X,
  CAMERA_DEADZONE_Y,
  FADE_MS,
  INTERACT_RANGE_PX,
  LAYER_DEPTH,
  SCENE_KEYS,
  TILE_SIZE,
} from '../utils/constants';
import type { DistrictDef, DistrictExit } from '../utils/types';
import type { HudScene, HudSceneData } from './HudScene';

export interface WorldSceneData {
  districtId: string;
  /** Spawn object to appear at; the district's defaultSpawn when absent. */
  spawnId?: string;
  fromDistrict?: string;
  /** Exact pixel position, used when resuming a save. Wins over spawnId. */
  x?: number;
  y?: number;
}

export interface TransitSceneData {
  exit: DistrictExit;
  fromDistrict: string;
}

/**
 * WorldScene — the ONE scene every place renders through.
 *
 * It takes a district id and reads everything else from districts.json and
 * maps.manifest.json: the map, its layers (in manifest order, never named
 * here), who stands where, what the crowd looks like, which zones lead out and
 * which ones quests listen for. Adding a district is adding an entry and a
 * map. There is deliberately no district-specific branch in this file; a
 * place that needs more than data lists a behaviour (src/world/behaviours).
 */
export class WorldScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.WORLD;

  private district!: DistrictDef;
  private map!: Phaser.Tilemaps.Tilemap;
  private player!: Player;
  private npcs: Phaser.GameObjects.Sprite[] = [];
  private crowd!: Populate.Crowd;
  private exits!: Exits.BoundExits;
  private triggers!: Triggers.BoundTriggers;
  private teardowns: Array<() => void> = [];
  private leaving = false;
  private sleeping = false;
  /** A conversation is up on the HUD's dialogue card; the player is frozen. */
  private talking = false;

  constructor() {
    super(WorldScene.KEY);
  }

  create(data: WorldSceneData): void {
    this.npcs = [];
    this.teardowns = [];
    this.leaving = false;
    this.sleeping = false;
    this.talking = false;

    // getDistrict throws on an unknown id — a content bug, not a soft state.
    this.district = getDistrict(data.districtId);
    const def = MAPS[this.district.map];
    if (!def) throw new Error(`District "${this.district.id}" names map "${this.district.map}", which is not in maps.manifest.json`);

    const store = useGameStore.getState();
    store.setActiveScene(WorldScene.KEY);
    store.setActiveDistrict(this.district.id);

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.fadeIn(this.district.fadeMs ?? FADE_MS, 0, 0, 0);

    this.map = this.make.tilemap({ key: def.key });
    const tilesets = this.registerTilesets();
    const collisionLayer = this.createLayers(def.collisionLayer, tilesets);

    // Spawn: a saved pixel position wins; otherwise the named spawn; otherwise
    // the map centre, reported, so a typo never strands the player off-map.
    const spawn = findObject(this.map, def.spawnLayer, data.spawnId ?? this.district.defaultSpawn);
    if (data.x === undefined && !spawn) {
      console.error(`[WorldScene] district "${this.district.id}" has no spawn "${data.spawnId ?? this.district.defaultSpawn}"`);
    }
    const x = data.x ?? spawn?.x ?? this.map.widthInPixels / 2;
    const y = data.y ?? spawn?.y ?? this.map.heightInPixels / 2;

    this.player = new Player(this, x, y, store.appearance.sheet);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setBounce(0);
    body.setCollideWorldBounds(true);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(CAMERA_DEADZONE_X, CAMERA_DEADZONE_Y);
    this.frameCamera();
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    const colliders: Phaser.Types.Physics.Arcade.ArcadeColliderType[] = [];
    if (collisionLayer) {
      this.physics.add.collider(this.player, collisionLayer);
      colliders.push(collisionLayer);
    }

    const { solids } = Populate.objects(this, this.district, this.map, def);
    this.physics.add.collider(this.player, solids);
    colliders.push(solids);

    // Generated maps: pixel-precise blocks + occluder cut-outs (AUDIT_LOG P5).
    const shapes = Shapes.bind(this, this.map, def.shapeLayer);
    this.physics.add.collider(this.player, shapes.blocks);
    colliders.push(shapes.blocks);

    const npcBodies = this.physics.add.staticGroup();
    this.npcs = Populate.npcs(this, this.district, this.map, def.spawnLayer, npcBodies);
    this.physics.add.collider(this.player, npcBodies);
    colliders.push(npcBodies);
    this.crowd = Populate.wander(this, this.district, this.map, def.spawnLayer, colliders);
    this.physics.add.collider(this.player, this.crowd.citizens);

    this.player.onInteract(() => this.tryInteract());

    // Quests this place begins. start() refuses if already active or done, so
    // re-entering a district cannot restart a finished quest.
    for (const questId of this.district.quests ?? []) QuestManager.getInstance().start(questId);

    this.exits = Exits.bind(this, this.district, this.map, def.spawnLayer, this.player, (exit) =>
      this.leaveVia(exit),
    );
    this.triggers = Triggers.bind(this, this.district, this.map, def.spawnLayer, this.player, {
      openDialogue: (id) => this.openDialogue(id),
      sleep: () => this.sleep(),
    });

    const behaviourNames = [...new Set([...CORE_BEHAVIOURS, ...(this.district.behaviours ?? [])])];
    const reducedMotion = platform.display.prefersReducedMotion();
    for (const name of behaviourNames) {
      const behaviour = BEHAVIOURS[name];
      if (!behaviour) {
        console.error(`[WorldScene] district "${this.district.id}" lists unknown behaviour "${name}"`);
        continue;
      }
      const teardown = behaviour.attach({
        scene: this, district: this.district, map: this.map, player: this.player,
        characters: () => [this.player, ...this.npcs, ...this.crowd.citizens],
        reducedMotion,
      });
      if (teardown) this.teardowns.push(teardown);
    }

    // First time here? Read before MapManager marks the visit on district:entered — the HUD's location card wears NEW.
    const firstVisit = !store.flags[`visited:${this.district.id}`];
    gameEvents.emit('district:entered', {
      districtId: this.district.id,
      fromDistrict: data.fromDistrict,
    });

    // Autosave also on a purchase and on a quest step (settings_and_saveload §2),
    // batched: a burst of events (pay → objective → quest done) writes once.
    let pending: Phaser.Time.TimerEvent | null = null;
    const soon = () => {
      pending?.remove();
      pending = this.time.delayedCall(400, () => { pending = null; if (!this.leaving) this.persist(); });
    };
    this.teardowns.push(
      gameEvents.on('wallet:spent', soon),
      gameEvents.on('quest:objective', soon),
      gameEvents.on('quest:completed', soon),
    );

    // Autosave on arrival as well as on leaving (ADR-63: area transition).
    // Without this, closing the game during a transit card would resume the
    // player standing on the exit zone they just used.
    this.persist();

    // Above the world, in this order: the HUD (ADR-118), the phone (ADR-114), the fullscreen map (ADR-113),
    // and the rotate-your-phone panel over everything.
    this.scene.launch(SCENE_KEYS.HUD, { firstVisit } satisfies HudSceneData);
    this.scene.bringToTop(SCENE_KEYS.HUD);
    this.scene.launch(SCENE_KEYS.PHONE);
    this.scene.bringToTop(SCENE_KEYS.PHONE);
    this.scene.launch(SCENE_KEYS.MAP);
    this.scene.bringToTop(SCENE_KEYS.MAP);
    this.scene.bringToTop(SCENE_KEYS.MENU);
    this.scene.bringToTop(SCENE_KEYS.ORIENTATION);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.game.events.once(Phaser.Core.Events.DESTROY, this.persist, this);
  }

  /**
   * Follow inside the map — and when a room is smaller than the screen, centre
   * it on black, like a LeafGreen interior (AUDIT_LOG P5): the room is drawn at
   * the characters' scale and nothing else exists around it.
   */
  private frameCamera(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    const mapW = this.map.widthInPixels, mapH = this.map.heightInPixels;
    const x = mapW < cam.width ? (mapW - cam.width) / 2 : 0;
    const y = mapH < cam.height ? (mapH - cam.height) / 2 : 0;
    cam.setBounds(x, y, Math.max(mapW, cam.width), Math.max(mapH, cam.height));
  }

  /**
   * Register the tilesets this map declares, rather than everything loaded.
   * Two failure modes, both reported: no image was loaded under the name, or
   * Phaser refused the registration. Either one silently renders an empty
   * layer otherwise.
   */
  private registerTilesets(): Phaser.Tilemaps.Tileset[] {
    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const declared of this.map.tilesets) {
      const name = declared.name;
      if (!(name in TILESET_URLS)) {
        console.error(`[WorldScene] tileset "${name}" has no image loaded`);
        continue;
      }
      const tileset = this.map.addTilesetImage(name, name);
      if (tileset) tilesets.push(tileset);
      else console.error(`[WorldScene] tileset "${name}" failed to register`);
    }
    return tilesets;
  }

  /**
   * Create every tile layer the map has, in manifest order, at the depth the
   * taxonomy assigns. No layer name is written in this scene: renaming the
   * taxonomy is a manifest + constants edit.
   */
  private createLayers(
    collisionName: string | undefined,
    tilesets: Phaser.Tilemaps.Tileset[],
  ): Phaser.Tilemaps.TilemapLayer | null {
    let collision: Phaser.Tilemaps.TilemapLayer | null = null;
    const present = new Set(this.map.layers.map((l) => l.name));

    for (const name of LAYER_ORDER) {
      if (!present.has(name)) continue;
      const layer = this.map.createLayer(name, tilesets);
      if (!layer) continue;
      layer.setDepth(LAYER_DEPTH[name] ?? 0);

      if (name === collisionName) {
        // The collision layer is a hidden stencil: any non-empty tile is solid.
        layer.setVisible(false);
        layer.setCollisionByExclusion([-1, 0]);
        collision = layer;
      }
    }
    return collision;
  }

  /** The nearest NPC within talking reach, or null. */
  private nearestNpc(): Phaser.GameObjects.Sprite | null {
    let nearest: Phaser.GameObjects.Sprite | null = null;
    let nearestDist = INTERACT_RANGE_PX;
    for (const npc of this.npcs) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  /**
   * What the HUD's prompt bubble points at: the NPC in reach who has something
   * to say, with the top of their head in world px and the verb. Null while
   * talking, leaving or asleep, or when nobody is near.
   */
  nearestInteractable(): { x: number; y: number; verb: string } | null {
    if (this.talking || this.leaving || this.sleeping) return null;
    const npc = this.nearestNpc();
    if (!npc || !npc.getData('dialogueId')) return null;
    return { x: npc.x, y: npc.y - npc.displayHeight / 2, verb: 'TALK' };
  }

  /** E pressed in the world: talk to the nearest NPC within reach. */
  private tryInteract(): void {
    if (this.talking) return;
    const nearest = this.nearestNpc();
    if (!nearest) return;

    // Reported either way: an ambient NPC with no dialogue can still satisfy an
    // `interact` objective.
    const npcId = nearest.getData('npcId') as string;
    gameEvents.emit('entity:interacted', { entityId: npcId });
    // A named NPC (tier 2+) met for the first time: social +1. The crowd never counts.
    if ((nearest.getData('tier') as number) >= 2) StatsManager.getInstance().meet(npcId);

    const dialogueId = nearest.getData('dialogueId') as string | undefined;
    if (!dialogueId) return; // tier 1 ambient — atmosphere only
    this.openDialogue(dialogueId);
  }

  /**
   * NPCs placed with `unlessFlag` leave once their flag is set — after the
   * conversation that set it, so nobody vanishes mid-sentence (ADR-96).
   */
  private dismissLeavers(): void {
    const { flags } = useGameStore.getState();
    this.npcs = this.npcs.filter((npc) => {
      const flag = npc.getData('unlessFlag') as string | undefined;
      if (!flag || !flags[flag]) return true;
      this.tweens.add({ targets: npc, alpha: 0, duration: 600, onComplete: () => npc.destroy() });
      return false;
    });
  }

  private hud(): HudScene {
    return this.scene.get(SCENE_KEYS.HUD) as HudScene;
  }

  /**
   * Freeze the player and run a conversation on the HUD's dialogue card — from
   * an NPC or a trigger (a phone call). Closing unfreezes on a short delay so
   * the closing keystroke cannot double as movement/interact.
   */
  private openDialogue(dialogueId: string): void {
    if (this.talking) return;
    this.talking = true;
    this.player.setInteractionEnabled(false);
    this.hud().openDialogue(dialogueId, {
      onClose: () => {
        this.talking = false;
        this.time.delayedCall(80, () => { if (!this.talking && !this.leaving && !this.sleeping) this.player.setInteractionEnabled(true); });
        this.dismissLeavers();
      },
    });
  }

  /**
   * A bed: fade to black, the night passes (TimeManager restores health and
   * food, the hotel timer counts), fade back in. Autosave on waking — sleep is
   * an ADR-63 autosave trigger.
   */
  private sleep(): void {
    if (this.leaving || this.sleeping || this.talking) return;
    this.sleeping = true;
    this.player.setInteractionEnabled(false);
    // Reset any fade still running (the previous night's fade-in): Phaser
    // silently refuses a new fade while one is active, and the player would
    // stay frozen on the bed forever.
    this.cameras.main.fadeEffect.reset();
    this.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      TimeManager.getInstance().sleep();
      this.persist();
      this.cameras.main.fadeEffect.reset();
      this.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.sleeping = false;
        this.player.setInteractionEnabled(true);
      });
    });
  }

  /** Hand over to TransitScene, which fades, shows the ride card and lands us. */
  private leaveVia(exit: DistrictExit): void {
    if (this.leaving) return;
    this.leaving = true;
    this.player.setInteractionEnabled(false);
    this.scene.start(SCENE_KEYS.TRANSIT, {
      exit,
      fromDistrict: this.district.id,
    } satisfies TransitSceneData);
  }

  /** Where a save should put the player back: this district, these pixels. */
  savePosition(): { districtId: string; x: number; y: number } {
    return { districtId: this.district.id, x: this.player.x, y: this.player.y };
  }

  /** Autosave now (the pause menu opening, the app going to the background). */
  saveNow(): void {
    this.persist();
  }

  private persist(): void {
    SaveManager.getInstance().save(this.savePosition());
  }

  /** The phone (and later the map / pause menu) may open only while the player is free to act. */
  canOpenOverlay(): boolean {
    return !this.talking && !this.leaving && !this.sleeping && useGameStore.getState().overlay === null;
  }

  /** Where the player stands, in tiles (feet), and which way they face — for the map's Area view (ADR-117). */
  playerPosition(): { districtId: string; tile: [number, number]; facing: 'up' | 'down' | 'left' | 'right' } {
    return { districtId: this.district.id, tile: [this.player.x / TILE_SIZE, this.player.y / TILE_SIZE], facing: this.player.facing };
  }

  /**
   * Fast travel from the map (ADR-115): ride straight to a district's default
   * spawn. The fare is already paid by the caller.
   */
  travelTo(districtId: string, transit: DistrictExit['transit']): void {
    this.scene.resume();
    this.leaveVia({ zone: '', to: districtId, spawn: getDistrict(districtId).defaultSpawn, transit });
  }

  /**
   * An overlay closed: resume, and hold interaction for a beat so the closing
   * keystroke (E / Enter) cannot double as an interact — same as the dialogue box.
   */
  overlayClosed(): void {
    this.player.setInteractionEnabled(false);
    this.scene.resume();
    this.time.delayedCall(80, () => { if (!this.leaving && !this.sleeping) this.player.setInteractionEnabled(true); });
  }

  private shutdown(): void {
    this.hud().closeDialogue();
    this.talking = false;
    this.scene.stop(SCENE_KEYS.HUD);
    this.scene.stop(SCENE_KEYS.PHONE);
    this.scene.stop(SCENE_KEYS.MAP);
    for (const teardown of this.teardowns) teardown();
    this.teardowns = [];
    this.persist();
    useGameStore.getState().setActiveDistrict(null);
  }

  update(time: number, delta: number): void {
    this.player.update();
    this.crowd.update(time);
    // The day only ages while the player is in the world and free to act.
    if (!this.talking && !this.leaving && !this.sleeping) TimeManager.getInstance().tick(delta);
    SaveManager.getInstance().tick(delta);
    // Zones are not checked while asleep: the fade must finish before the bed
    // (or a door) can fire again.
    if (!this.leaving && !this.sleeping) {
      this.exits.update();
      this.triggers.update();
    }

    // Depth is computed from each drawable's bottom edge, never authored.
    // Placed objects set theirs once at construction; characters move, so
    // theirs is recomputed each frame.
    this.player.setDepth(depthForZY(characterZY(this.player)));
    for (const npc of this.npcs) npc.setDepth(depthForZY(characterZY(npc)));
    for (const citizen of this.crowd.citizens) citizen.setDepth(depthForZY(characterZY(citizen)));
  }
}

export default WorldScene;
