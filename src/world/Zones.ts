import Phaser from 'phaser';
import { ZONE_DEFAULT_TILES } from '../utils/constants';

export type TiledObject = Phaser.Types.Tilemaps.TiledObject;

/** Named object in a map's object layer, or undefined when the map lacks it. */
export const findObject = (
  map: Phaser.Tilemaps.Tilemap,
  layerName: string | undefined,
  name: string,
): TiledObject | undefined =>
  layerName ? map.getObjectLayer(layerName)?.objects.find((o) => o.name === name) : undefined;

/**
 * A static physics zone from a Tiled object. A rectangle uses its own bounds;
 * a point becomes a ZONE_DEFAULT_TILES square centred on it, which is how the
 * hand-authored airport exit was sized before it was data.
 */
export function zoneFromObject(
  scene: Phaser.Scene,
  obj: TiledObject,
  tileSize: number,
): Phaser.GameObjects.Zone {
  const w = obj.width || tileSize * ZONE_DEFAULT_TILES;
  const h = obj.height || tileSize * ZONE_DEFAULT_TILES;
  // Tiled anchors rectangles top-left and points at the point; Phaser zones
  // are centred, so only rectangles need the half-size shift.
  const x = (obj.x ?? 0) + (obj.width ? w / 2 : 0);
  const y = (obj.y ?? 0) + (obj.height ? h / 2 : 0);

  const zone = scene.add.zone(x, y, w, h);
  scene.physics.add.existing(zone, true);
  return zone;
}

/**
 * Fires once per entry and re-arms when the bodies separate. Polling the
 * overlap in update() is simpler and safer than an overlap collider, which
 * runs its callback every frame the bodies touch and has to be destroyed to
 * stop — the bug the old exit zone worked around by firing exactly once.
 */
export class EntryWatcher {
  private inside = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly body: Phaser.Types.Physics.Arcade.ArcadeColliderType,
    private readonly zone: Phaser.GameObjects.Zone,
    private readonly onEnter: () => void,
  ) {}

  update(): void {
    const now = this.scene.physics.overlap(this.body, this.zone);
    if (now && !this.inside) this.onEnter();
    this.inside = now;
  }
}
