/**
 * What the infected are doing to you right now (ADR-145), for whoever needs
 * the summary without the infected themselves: the audio state machine
 * (chase → relief, the heartbeat by distance, ADR-29) and the HUD. Written by
 * the `act4Threat` behaviour every frame; pure state.
 */
export interface ThreatState {
  /** Any infected is chasing you. */
  chasing: boolean;
  /** Tiles to the nearest infected that can see or is hunting you, or null. */
  nearestTiles: number | null;
  /** How many infected are in this place. */
  count: number;
  /** Their feet, for the playthrough bot's routes (it plans around them, ADR-145). */
  positions: Array<[number, number]>;
}

export const threat: ThreatState = { chasing: false, nearestTiles: null, count: 0, positions: [] };

export function resetThreat(): void { threat.chasing = false; threat.nearestTiles = null; threat.count = 0; threat.positions = []; }

/** The Playground's Act 4 view (ADR-145): draw zones, cover, hide spots, each infected's state and path, and your detection ring. */
export const threatDebug: { draw: boolean; modes: string[] } = { draw: false, modes: [] };
