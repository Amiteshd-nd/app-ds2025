import Phaser from 'phaser';
import { depthForZY } from '../core/depth';
import { DEPTH } from '../utils/constants';

export interface BoundShapes {
  /** Static bodies over every collision rect and every cut-out footprint — collide characters with this. */
  blocks: Phaser.Physics.Arcade.StaticGroup;
  /** Cut-outs in the sorted band (depth = baseY) and overhead cut-outs (props_above depth). */
  cutouts: Phaser.GameObjects.Image[];
}

const prop = (obj: Phaser.Types.Tilemaps.TiledObject, name: string): unknown =>
  (obj.properties as Array<{ name: string; value: unknown }> | undefined)?.find((p) => p.name === name)?.value;

/**
 * A generated map's shapes under the render model (ADR-125, scripts/import-map.mjs):
 *
 * - the `collision` object layer: pixel-precise rects (property `kind`:
 *   building | prop) drawn round the art — a wall, a gate, a pot — so feet
 *   stop where the picture says, and nothing blocks the air above a pole;
 * - `cutout` objects in the `sorted` layer: transparent cut-outs of the render
 *   (pole, tree, counter, bench) depth-sorted by `baseY`, the line where they
 *   meet the ground, with a `footprint` rect that becomes a static body;
 * - `above` objects: cut-outs that hang over the street (wires, canopies,
 *   gate headers), drawn at the props_above depth, never colliding.
 */
export function bind(
  scene: Phaser.Scene,
  map: Phaser.Tilemaps.Tilemap,
  sortedLayer: string | undefined,
  collisionLayer: string | undefined,
): BoundShapes {
  const blocks = scene.physics.add.staticGroup();
  const cutouts: Phaser.GameObjects.Image[] = [];
  const solid = (x: number, y: number, w: number, h: number) => {
    const zone = scene.add.zone(x + w / 2, y + h / 2, w, h);
    scene.physics.add.existing(zone, true);
    blocks.add(zone);
  };

  const collision = collisionLayer ? map.getObjectLayer(collisionLayer) : null;
  for (const obj of collision?.objects ?? []) solid(obj.x ?? 0, obj.y ?? 0, obj.width ?? 0, obj.height ?? 0);

  const sorted = sortedLayer ? map.getObjectLayer(sortedLayer) : null;
  for (const obj of sorted?.objects ?? []) {
    if (obj.type !== 'cutout' && obj.type !== 'above') continue;
    const x = obj.x ?? 0, y = obj.y ?? 0, h = obj.height ?? 0;
    const key = prop(obj, 'image') as string | undefined;
    if (!key || !scene.textures.exists(key)) {
      console.error(`[Shapes] ${obj.type} "${obj.name}" image "${key}" is not loaded`);
      continue;
    }
    const image = scene.add.image(x, y, key).setOrigin(0, 0);
    if (obj.type === 'above') {
      image.setDepth(DEPTH.ABOVE_PLAYER);
    } else {
      const baseY = prop(obj, 'baseY') as number | undefined;
      image.setDepth(depthForZY(baseY ?? y + h));
      const fx = prop(obj, 'footX') as number | undefined, fy = prop(obj, 'footY') as number | undefined;
      const fw = prop(obj, 'footW') as number | undefined, fh = prop(obj, 'footH') as number | undefined;
      if ([fx, fy, fw, fh].every((v) => typeof v === 'number')) solid(fx!, fy!, fw!, fh!);
    }
    cutouts.push(image);
  }

  return { blocks, cutouts };
}
