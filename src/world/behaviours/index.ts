import type Phaser from 'phaser';
import type { Player } from '../../entities/Player';
import type { DistrictDef } from '../../utils/types';
import type { CardLanding } from '../../systems/cards';

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
  /** Play a card sequence over the world (ADR-136): the world holds until it ends. `landing` replaces its `then` (failing forward to your base, ADR-149). */
  playCard(cardId: string, landing?: CardLanding): void;
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
import { guitarNights } from './guitarNights';
import { sleepEvents } from './sleepEvents';
import { nightLook } from './nightLook';
import { countdown } from './countdown';
import { stabilityLook } from './stabilityLook';
import { act4Threat } from './act4Threat';
import { clockEvents } from './clockEvents';
import { act4Base } from './act4Base';

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
  guitarNights,
  sleepEvents,
  nightLook,
  countdown,
  stabilityLook,
  act4Threat,
  clockEvents,
  act4Base,
};

/**
 * Molecules every district gets without listing them.
 * `beh_breathing` is OFF (user, 2026-10-12: "switch the breathing off for now
 * and proceed; we can come back to this") — the baked-frame pipeline stays
 * (ADR-107, T-029). Re-enable by adding it back here.
 */
// nightLook (ADR-133): every district wears the night between 23:00 and 05:30.
// stabilityLook (ADR-144): every district wears its grade — colour, edges, a glitch.
// act4Threat (ADR-145): the infected, ambushes and UV lamps of any place whose data has them (a no-op elsewhere).
// act4Base (ADR-149): a base's nights — the stock, the lamp, home (a no-op without a base).
export const CORE_BEHAVIOURS: readonly string[] = ['nightLook', 'stabilityLook', 'act4Threat', 'act4Base'];
