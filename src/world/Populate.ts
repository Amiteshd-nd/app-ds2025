import Phaser from 'phaser';
import { DIALOGUE, NPCS, OBJECTS } from '../data';
import { PlacedObject } from '../entities/PlacedObject';
import { InventoryManager } from '../systems/InventoryManager';
import { useGameStore } from '../store';
import type { MapDefinition } from '../assets/maps';
import {
  BOT_SPEED_MAX,
  BOT_SPEED_MIN,
  BOT_TURN_INTERVAL_MAX,
  BOT_TURN_INTERVAL_MIN,
  DEPTH,
} from '../utils/constants';
import type { Direction, DistrictDef } from '../utils/types';
import { findObject } from './Zones';

/** Texture every NPC without art is drawn with — the BootScene silhouette. */
const NPC_PLACEHOLDER = 'npc_placeholder';

/**
 * NPCs: one sprite per district reference, placed at its named spawn. The
 * definition (dialogue, tier, art) lives once in npcs/*.json; the district only
 * says who stands where.
 */
export function npcs(
  scene: Phaser.Scene,
  district: DistrictDef,
  map: Phaser.Tilemaps.Tilemap,
  spawnLayer: string | undefined,
  /** Static group the NPCs' feet join: people are solid (AUDIT_LOG P5). */
  bodies?: Phaser.Physics.Arcade.StaticGroup,
  /** Place only these refs — WorldScene adds late arrivals (requiresFlag) after the workday. */
  only?: (ref: DistrictDef['npcs'] extends (infer R)[] | undefined ? R : never) => boolean,
): Phaser.GameObjects.Sprite[] {
  const sprites: Phaser.GameObjects.Sprite[] = [];

  const { flags } = useGameStore.getState();
  for (const ref of district.npcs ?? []) {
    if (only && !only(ref)) continue;
    // Gone for good once their flag is set (ADR-96) — the token man does not come back.
    if (ref.unlessFlag && flags[ref.unlessFlag]) continue;
    // Not here until their flag is set (ADR-121) — Sameer and Ravi appear at the gate after the workday.
    if (ref.requiresFlag && !flags[ref.requiresFlag]) continue;
    const npc = NPCS[ref.id];
    const obj = findObject(map, spawnLayer, ref.spawn);

    // Each of these is caught by the validator at build time; a miss here means
    // the data and the build have diverged, which is worth saying out loud.
    if (!npc) {
      console.error(`[Populate] district "${district.id}" places unknown NPC "${ref.id}"`);
      continue;
    }
    if (!obj) {
      console.error(`[Populate] NPC "${ref.id}" wants spawn "${ref.spawn}", which is not in the map`);
      continue;
    }
    if (npc.dialogue && !DIALOGUE[npc.dialogue]) {
      console.error(`[Populate] NPC "${npc.id}" wants dialogue "${npc.dialogue}", which does not exist`);
      continue;
    }

    const sheet = npc.sheet && scene.textures.exists(npc.sheet) ? npc.sheet : NPC_PLACEHOLDER;
    const sprite = scene.add.sprite(obj.x ?? 0, obj.y ?? 0, sheet);
    sprite.setDepth(DEPTH.ENTITIES);
    if (npc.tint !== undefined) sprite.setTint(npc.tint);
    if (scene.anims.exists(`${sheet}-idle-down`)) sprite.play(`${sheet}-idle-down`);

    sprite.setData('npcId', npc.id);
    sprite.setData('dialogueId', npc.dialogue);
    sprite.setData('tier', npc.tier);
    if (npc.breathing === false) sprite.setData('breathing', false);
    if (ref.unlessFlag) sprite.setData('unlessFlag', ref.unlessFlag);
    if (bodies) {
      // Same feet box as the player (20×12 at 6,35): you bump into a person
      // at their feet, and can still stand close enough to talk.
      bodies.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(20, 12, false);
      body.setOffset(6, 35);
    }
    sprites.push(sprite);
  }

  return sprites;
}

export interface PlacedObjects {
  placed: PlacedObject[];
  /** Static bodies over every solid footprint — collide the player with this. */
  solids: Phaser.Physics.Arcade.StaticGroup;
}

/**
 * Placed objects from two sources: the map's object layer (authored in Tiled,
 * typed by ObjectDef id) and the district's `objects` list (authored in data,
 * positioned at a named spawn, optionally gated on an item the player holds —
 * the table that only exists once it has been delivered).
 *
 * Solid objects get a static body over their footprint, which is why maps no
 * longer paint props into the collision stencil: the manifest is the single
 * source of truth for what blocks movement.
 */
export function objects(
  scene: Phaser.Scene,
  district: DistrictDef,
  map: Phaser.Tilemaps.Tilemap,
  def: MapDefinition,
): PlacedObjects {
  const solids = scene.physics.add.staticGroup();
  const tile = map.tileWidth;
  const placed: PlacedObject[] = [];

  const add = (id: string, tileX: number, tileY: number, hueShift?: number): void => {
    const objectDef = OBJECTS[id];
    if (!objectDef) {
      console.error(`[Populate] placed object "${id}" has no manifest`);
      return;
    }
    const item = new PlacedObject(scene, objectDef, tileX, tileY, tile, { hueShift });
    item.addCollision(scene, solids, tile);
    placed.push(item);
  };

  const layer = def.objectLayer ? map.getObjectLayer(def.objectLayer) : null;
  for (const obj of layer?.objects ?? []) {
    if (!obj.type) continue; // validator rejects this; nothing sensible to draw
    const hueProp = obj.properties?.find(
      (p: { name: string; value: unknown }) => p.name === 'hueShift',
    );
    add(
      obj.type,
      Math.round((obj.x ?? 0) / tile),
      Math.round((obj.y ?? 0) / tile),
      typeof hueProp?.value === 'number' ? hueProp.value : undefined,
    );
  }

  for (const ref of district.objects ?? []) {
    if (ref.requires && !InventoryManager.getInstance().has(ref.requires)) continue;
    const at = findObject(map, def.spawnLayer, ref.at);
    if (!at) {
      console.error(`[Populate] object "${ref.id}" wants spawn "${ref.at}", which is not in the map`);
      continue;
    }
    add(ref.id, Math.round((at.x ?? 0) / tile), Math.round((at.y ?? 0) / tile));
  }

  return { placed, solids };
}

/** Ambient citizen: a sprite that walks and knows which way it is facing. */
type Citizen = Phaser.GameObjects.Sprite & {
  nextTurn: number;
  sheet: string;
  facing: Direction;
};

export interface Crowd {
  citizens: Phaser.GameObjects.Sprite[];
  update(time: number): void;
}

/**
 * Ambient crowd on a random walk — the local-simulation illusion in miniature.
 * Citizens stay inside the district's `area` rectangle (the walkable band) so
 * none of them start inside a building. Sheets come from `ambient.base`, so a
 * district can be a mixed street or a corridor of identical office shirts.
 */
export function wander(
  scene: Phaser.Scene,
  district: DistrictDef,
  map: Phaser.Tilemaps.Tilemap,
  spawnLayer: string | undefined,
  colliders: Phaser.Types.Physics.Arcade.ArcadeColliderType[],
): Crowd {
  const citizens: Citizen[] = [];
  const ambient = district.ambient;
  if (!ambient) {
    useGameStore.getState().setBotCount(0);
    return { citizens, update: () => {} };
  }

  const sheets = ambient.base.filter((sheet) => {
    const ok = scene.textures.exists(sheet);
    if (!ok) console.error(`[Populate] ambient sheet "${sheet}" is not loaded`);
    return ok;
  });
  if (sheets.length === 0) {
    useGameStore.getState().setBotCount(0);
    return { citizens, update: () => {} };
  }

  const tile = map.tileWidth;
  const area = ambient.area ? findObject(map, spawnLayer, ambient.area) : undefined;
  if (ambient.area && !area) {
    console.error(`[Populate] ambient area "${ambient.area}" is not in the map; using the whole map`);
  }
  const bounds = area?.width && area.height
    ? new Phaser.Geom.Rectangle(area.x ?? 0, area.y ?? 0, area.width, area.height)
    : new Phaser.Geom.Rectangle(0, 0, map.widthInPixels, map.heightInPixels);

  for (let i = 0; i < ambient.count; i++) {
    // Stride the index so neighbouring spawns do not share a look.
    const sheet = sheets[(i * 3) % sheets.length];

    const citizen = scene.add.sprite(
      Phaser.Math.Between(bounds.left + tile, bounds.right - tile),
      Phaser.Math.Between(bounds.top + tile / 2, bounds.bottom - tile / 2),
      sheet,
    ) as Citizen;

    scene.physics.add.existing(citizen);
    const body = citizen.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 12);
    body.setOffset(6, 35);
    body.setCollideWorldBounds(true);
    // Citizens hold their ground: the player stops against them, as against an NPC.
    body.pushable = false;
    for (const collider of colliders) scene.physics.add.collider(citizen, collider);

    citizen.setDepth(DEPTH.ENTITIES);
    citizen.nextTurn = 0;
    citizen.sheet = sheet;
    citizen.facing = 'down';
    if (scene.anims.exists(`${sheet}-idle-down`)) citizen.play(`${sheet}-idle-down`);
    citizens.push(citizen);
  }

  useGameStore.getState().setBotCount(citizens.length);

  const update = (time: number): void => {
    for (const citizen of citizens) {
      const body = citizen.body as Phaser.Physics.Arcade.Body;

      if (time > citizen.nextTurn) {
        // Cardinal headings only: a diagonal walk has no matching animation
        // row, so the sprite would face a direction it is not moving in.
        const dir = Phaser.Math.RND.pick(['down', 'left', 'right', 'up'] as Direction[]);
        const speed = Phaser.Math.Between(BOT_SPEED_MIN, BOT_SPEED_MAX);
        const idle = Phaser.Math.FloatBetween(0, 1) < 0.25;

        body.setVelocity(
          idle ? 0 : dir === 'left' ? -speed : dir === 'right' ? speed : 0,
          idle ? 0 : dir === 'up' ? -speed : dir === 'down' ? speed : 0,
        );

        citizen.facing = dir;
        citizen.play(`${citizen.sheet}-${idle ? 'idle' : 'walk'}-${dir}`, true);
        citizen.nextTurn =
          time + Phaser.Math.Between(BOT_TURN_INTERVAL_MIN, BOT_TURN_INTERVAL_MAX);
      }

      // A citizen stopped by a wall should not keep playing a walk cycle.
      const stopped = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down
        || body.touching.left || body.touching.right || body.touching.up || body.touching.down;
      if (stopped && !body.velocity.equals(Phaser.Math.Vector2.ZERO)) {
        body.setVelocity(0);
        citizen.play(`${citizen.sheet}-idle-${citizen.facing}`, true);
        citizen.nextTurn = Math.min(citizen.nextTurn, time + 200);
      }
    }
  };

  return { citizens, update };
}
