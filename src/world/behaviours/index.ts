import type Phaser from 'phaser';
import type { Player } from '../../entities/Player';
import type { DistrictDef } from '../../utils/types';

/** What a behaviour gets to work with. */
export interface BehaviourContext {
  scene: Phaser.Scene;
  district: DistrictDef;
  map: Phaser.Tilemaps.Tilemap;
  player: Player;
  /** Everyone drawn as a character right now: player, placed NPCs, crowd. */
  characters(): Phaser.GameObjects.Sprite[];
  /** The OS "reduce motion" setting (platform.display) — collapse motion, never hide. */
  reducedMotion: boolean;
  /** True while the player can act: no conversation, no fade, no overlay (a ride's clock holds otherwise). */
  playerFree(): boolean;
  /** Leave the district through one of its exits, by zone name (the bus ride ending). */
  leave(exitZone: string): void;
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

import { hotelNightTimer } from './hotelNightTimer';
import { beh_breathing } from './breathing';
import { beh_carousel } from './carousel';
import { officeClockIn } from './officeClockIn';
import { pgNoticeTimer } from './pgNoticeTimer';
import { signalZones } from './signalZones';
import { salaryCountdown } from './salaryCountdown';
import { busSchedule } from './busSchedule';
import { busRide } from './busRide';
import { photoSpots } from './photoSpots';
import { companion } from './companion';
import { emi } from './emi';
import { fuelSpots } from './fuelSpots';
import { metroOpening } from './metroOpening';

/** Registry by name — add here AND in names.ts (a test keeps them equal). */
export const BEHAVIOURS: Record<string, Behaviour> = {
  hotelNightTimer,
  beh_breathing,
  beh_carousel,
  officeClockIn,
  pgNoticeTimer,
  signalZones,
  salaryCountdown,
  busSchedule,
  busRide,
  photoSpots,
  companion,
  emi,
  fuelSpots,
  metroOpening,
};

/**
 * Molecules every district gets without listing them.
 * `beh_breathing` is OFF (user, 2026-10-12: "switch the breathing off for now
 * and proceed; we can come back to this") — the baked-frame pipeline stays
 * (ADR-107, T-029). Re-enable by adding it back here.
 */
export const CORE_BEHAVIOURS: readonly string[] = [];
