/**
 * Flags the metro's opening sets (story 2.2, ADR-127). Kept apart from the
 * behaviour so MapManager (no Phaser) can import them without the registry.
 */
/** The Purple Line's Whitefield stretch is open: the barricades go, the station mouth appears, Maps offers METRO. */
export const FLAG_METRO_OPEN = 'metro_open';
/** Opening day: every ride is free until the next sleep. */
export const FLAG_METRO_FREE_DAY = 'metro_free_day';
/** The scooter decision (bought, EMI or walked away) — the sleep after it opens the line. */
export const FLAG_SCOOTER_DECIDED = 'scooter_decided';
