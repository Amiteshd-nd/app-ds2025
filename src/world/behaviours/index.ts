import type Phaser from 'phaser';
import type { Player } from '../../entities/Player';
import type { DistrictDef } from '../../utils/types';

/** What a behaviour gets to work with. */
export interface BehaviourContext {
  scene: Phaser.Scene;
  district: DistrictDef;
  map: Phaser.Tilemaps.Tilemap;
  player: Player;
}

/**
 * A behaviour molecule: a named, reusable mechanic a district opts into by
 * listing it (`hotelNightTimer`, `signalStrengthMeter`, `fuelGauge`…). The
 * rule from the technical architecture: no district-specific `if` inside
 * WorldScene — anything a place needs that is not plain data lives here.
 *
 * `attach` may return a teardown that runs on scene shutdown.
 */
export interface Behaviour {
  attach(ctx: BehaviourContext): (() => void) | void;
}

/** Registry by name. Empty until P4 (hotel timer) adds the first molecule. */
export const BEHAVIOURS: Record<string, Behaviour> = {};
