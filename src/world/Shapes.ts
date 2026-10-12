import Phaser from 'phaser';
import { depthForZY } from '../core/depth';

export interface BoundShapes {
  /** Static bodies over every `solid` rect — collide characters with this. */
  blocks: Phaser.Physics.Arcade.StaticGroup;
  /** Cut-outs that draw above whoever stands behind them. */
  occluders: Phaser.GameObjects.Image[];
}

const prop = (obj: Phaser.Types.Tilemaps.TiledObject, name: string): unknown =>
  (obj.properties as Array<{ name: string; value: unknown }> | undefined)?.find((p) => p.name === name)?.value;

/**
 * A generated map's shapes (scripts/import-map.mjs, AUDIT_LOG P5):
 *
 * - `solid` rects are pixel-precise blocks drawn round the art — a gate, a
 *   pot, a pole's base, a trunk — so feet stop where the picture says they
 *   should, and nothing blocks the air above a pole.
 * - `occluder`s are transparent cut-outs of the render (pole, canopy, lamp,
 *   roof edge). Each is depth-sorted by its `baseY` — the line where it meets
 *   the ground — in the same band as characters, so a player whose feet are
 *   above that line is drawn behind it, and in front of it otherwise.
 */
export function bind(
  scene: Phaser.Scene,
  map: Phaser.Tilemaps.Tilemap,
  shapeLayer: string | undefined,
): BoundShapes {
  const blocks = scene.physics.add.staticGroup();
  const occluders: Phaser.GameObjects.Image[] = [];
  const layer = shapeLayer ? map.getObjectLayer(shapeLayer) : null;

  for (const obj of layer?.objects ?? []) {
    const x = obj.x ?? 0, y = obj.y ?? 0, w = obj.width ?? 0, h = obj.height ?? 0;
    if (obj.type === 'solid') {
      const zone = scene.add.zone(x + w / 2, y + h / 2, w, h);
      scene.physics.add.existing(zone, true);
      blocks.add(zone);
    } else if (obj.type === 'occluder') {
      const key = prop(obj, 'image') as string | undefined;
      const baseY = prop(obj, 'baseY') as number | undefined;
      if (!key || !scene.textures.exists(key)) {
        console.error(`[Shapes] occluder "${obj.name}" image "${key}" is not loaded`);
        continue;
      }
      const image = scene.add.image(x, y, key).setOrigin(0, 0);
      image.setDepth(depthForZY(baseY ?? y + h));
      occluders.push(image);
    }
  }

  return { blocks, occluders };
}
