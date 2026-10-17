/**
 * Names a district may list under `behaviours: []`.
 *
 * Kept apart from the registry so the content validator (plain Node, no
 * Phaser) can import it. Adding a behaviour = implement it in index.ts AND
 * append its name here; a test keeps the two lists equal.
 */
export const BEHAVIOUR_NAMES: readonly string[] = ['hotelNightTimer', 'beh_breathing', 'beh_carousel', 'officeClockIn', 'pgNoticeTimer', 'signalZones', 'salaryCountdown', 'busSchedule', 'busRide', 'photoSpots', 'companion', 'emi', 'fuelSpots', 'metroOpening', 'guitarNights'];
