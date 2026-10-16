import manifest from './maps.manifest.json';
import { TILEMAP_FILE_URLS } from './index';

/**
 * A map's contract with the game code: which Tiled layers must exist, which one
 * is the collision stencil, and which spawn objects the scenes rely on.
 */
export interface MapDefinition {
  /** Phaser cache key, e.g. "airport_map". */
  key: string;
  /** Tiled export filename, relative to src/assets/tilemaps/. */
  file: string;
  /** Bundled URL for the .tmj. */
  url: string;
  /** The invisible collision layer: a tile stencil, or an object layer of pixel rects (generated maps). */
  collisionLayer?: string;
  /** Object layer holding spawn points and zones. */
  spawnLayer?: string;
  /** The Y-sort band (ADR-125): placed objects typed by ObjectDef id, `cutout` images with a footprint, `above` images. */
  sortedLayer?: string;
  /** Object layer of City Pulse slots: named, typed anchors events switch on. */
  pulseLayer?: string;
  /** Spawn object names the scene code depends on. */
  requiredSpawns: string[];
  /** Migrated to the render model: the validator is strict about footprints and legacy shapes. */
  sop?: boolean;
}

interface ManifestMap {
  file: string;
  collisionLayer?: string;
  spawnLayer?: string;
  sortedLayer?: string;
  pulseLayer?: string;
  requiredSpawns?: string[];
  sop?: boolean;
}

export const TILE_SIZE_FROM_MANIFEST: number = manifest.tileSize;

/**
 * Canonical tile-layer draw order, back to front. WorldScene walks this list
 * and creates whichever layers a map has — it never names a layer itself.
 */
export const LAYER_ORDER: readonly string[] = manifest.layerOrder;

const build = (): Record<string, MapDefinition> => {
  const entries = Object.entries(manifest.maps as Record<string, ManifestMap>);

  return Object.fromEntries(
    entries.map(([key, def]) => {
      const basename = def.file.replace(/\.[^.]+$/, '');
      const url = TILEMAP_FILE_URLS[basename];

      // A manifest entry with no matching file is a build-time mistake, but the
      // validator only runs in CI/build — fail loudly here too rather than
      // handing Phaser `undefined` and debugging a blank screen.
      if (!url) {
        throw new Error(
          `Map "${key}" references ${def.file}, which is not in src/assets/tilemaps/`,
        );
      }

      return [
        key,
        {
          key,
          file: def.file,
          url,
          collisionLayer: def.collisionLayer,
          spawnLayer: def.spawnLayer,
          sortedLayer: def.sortedLayer,
          pulseLayer: def.pulseLayer,
          requiredSpawns: def.requiredSpawns ?? [],
          sop: def.sop,
        } satisfies MapDefinition,
      ];
    }),
  );
};

/** Every map the game knows about, keyed by Phaser cache key. */
export const MAPS: Record<string, MapDefinition> = build();
