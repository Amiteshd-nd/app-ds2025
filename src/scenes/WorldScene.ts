import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { SaveManager } from '../systems/SaveManager';
import { QuestManager } from '../systems/QuestManager';
import { useGameStore } from '../store';
import { TILESET_URLS } from '../assets';
import { MAPS, LAYER_ORDER } from '../assets/maps';
import { getDistrict } from '../data';
import { gameEvents } from '../core/events';
import { characterZY, depthForZY } from '../core/depth';
import { DialogueBox } from '../ui/DialogueBox';
import * as Populate from '../world/Populate';
import * as Exits from '../world/Exits';
import * as Triggers from '../world/Triggers';
import { findObject } from '../world/Zones';
import { BEHAVIOURS } from '../world/behaviours';
import {
  CAMERA_DEADZONE_X,
  CAMERA_DEADZONE_Y,
  FADE_MS,
  INTERACT_RANGE_PX,
  LAYER_DEPTH,
  SCENE_KEYS,
} from '../utils/constants';
import type { DistrictDef, DistrictExit } from '../utils/types';

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
  private dialogueBox!: DialogueBox;
  private teardowns: Array<() => void> = [];
  private leaving = false;

  constructor() {
    super(WorldScene.KEY);
  }

  create(data: WorldSceneData): void {
    this.npcs = [];
    this.teardowns = [];
    this.leaving = false;

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
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    const colliders: Phaser.Types.Physics.Arcade.ArcadeColliderType[] = [];
    if (collisionLayer) {
      this.physics.add.collider(this.player, collisionLayer);
      colliders.push(collisionLayer);
    }

    const { solids } = Populate.objects(this, this.district, this.map, def);
    this.physics.add.collider(this.player, solids);
    colliders.push(solids);

    this.npcs = Populate.npcs(this, this.district, this.map, def.spawnLayer);
    this.crowd = Populate.wander(this, this.district, this.map, def.spawnLayer, colliders);

    // The dialogue box freezes the player while open; closing unfreezes on a
    // short delay so the closing keystroke cannot double as movement/interact.
    this.dialogueBox = new DialogueBox(this, {
      onClose: () => {
        this.time.delayedCall(80, () => this.player.setInteractionEnabled(true));
      },
    });
    this.player.onInteract(() => this.tryInteract());

    // Quests this place begins. start() refuses if already active or done, so
    // re-entering a district cannot restart a finished quest.
    for (const questId of this.district.quests ?? []) QuestManager.getInstance().start(questId);

    this.exits = Exits.bind(this, this.district, this.map, def.spawnLayer, this.player, (exit) =>
      this.leaveVia(exit),
    );
    this.triggers = Triggers.bind(this, this.district, this.map, def.spawnLayer, this.player);

    for (const name of this.district.behaviours ?? []) {
      const behaviour = BEHAVIOURS[name];
      if (!behaviour) {
        console.error(`[WorldScene] district "${this.district.id}" lists unknown behaviour "${name}"`);
        continue;
      }
      const teardown = behaviour.attach({
        scene: this, district: this.district, map: this.map, player: this.player,
      });
      if (teardown) this.teardowns.push(teardown);
    }

    gameEvents.emit('district:entered', {
      districtId: this.district.id,
      fromDistrict: data.fromDistrict,
    });

    // Autosave on arrival as well as on leaving (ADR-63: area transition).
    // Without this, closing the game during a transit card would resume the
    // player standing on the exit zone they just used.
    this.persist();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.game.events.once(Phaser.Core.Events.DESTROY, this.persist, this);
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

  /** E pressed in the world: talk to the nearest NPC within reach. */
  private tryInteract(): void {
    if (this.dialogueBox.isOpen) return;

    let nearest: Phaser.GameObjects.Sprite | null = null;
    let nearestDist = INTERACT_RANGE_PX;
    for (const npc of this.npcs) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }
    if (!nearest) return;

    // Reported either way: an ambient NPC with no dialogue can still satisfy an
    // `interact` objective.
    gameEvents.emit('entity:interacted', { entityId: nearest.getData('npcId') as string });

    const dialogueId = nearest.getData('dialogueId') as string | undefined;
    if (!dialogueId) return; // tier 1 ambient — atmosphere only

    this.player.setInteractionEnabled(false);
    this.dialogueBox.open(dialogueId);
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

  private persist(): void {
    SaveManager.getInstance().save({
      districtId: this.district.id,
      x: this.player.x,
      y: this.player.y,
    });
  }

  private shutdown(): void {
    this.dialogueBox.forceClose();
    for (const teardown of this.teardowns) teardown();
    this.teardowns = [];
    this.persist();
    useGameStore.getState().setActiveDistrict(null);
  }

  update(time: number): void {
    this.player.update();
    this.crowd.update(time);
    if (!this.leaving) {
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
